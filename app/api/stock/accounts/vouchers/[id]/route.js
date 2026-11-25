import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { accountsError, accountsGuard, loadOutstanding, postDraft, withBooks } from '@/lib/accounts-db';
import { PARTY_GROUPS, settlementLines, toPaise } from '@/lib/accounts.mjs';
import { stockRoute } from '@/lib/stock-workflow';

async function loadVoucher(id) {
  const [voucher] = await sql(
    `SELECT v.*, v.voucher_date::text AS voucher_date, p.name AS party_name, p.group_name AS party_group,
            cu.name AS created_by_name, au.name AS approved_by_name
     FROM acc_vouchers v
     LEFT JOIN acc_ledgers p ON p.id = v.party_ledger_id
     LEFT JOIN stock_app_users cu ON cu.id = v.created_by_user_id
     LEFT JOIN stock_app_users au ON au.id = v.approved_by_user_id
     WHERE v.id = $1`,
    [Number(id) || 0]
  );
  if (!voucher) return null;
  const lines = await sql(
    `SELECT vl.*, vl.bill_date::text AS bill_date, l.name AS ledger_name, l.group_name
     FROM acc_voucher_lines vl JOIN acc_ledgers l ON l.id = vl.ledger_id
     WHERE vl.voucher_id = $1 ORDER BY vl.sort, vl.id`,
    [voucher.id]
  );
  return { voucher, lines };
}

export const GET = stockRoute(async function GET(request, context) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { id } = await context.params;
    const found = await loadVoucher(id);
    if (!found) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }
    return NextResponse.json(found);
  } catch (error) {
    return accountsError(error, 'Failed to load voucher');
  }
});

/**
 * Settle a receipt/payment draft against the party's open bills before posting.
 * Each allocation must fit inside what that bill still has open.
 */
async function settleDraft(tx, voucher, lines, allocations) {
  const party = lines.find((l) => Number(l.ledger_id) === Number(voucher.party_ledger_id));
  const cash = lines.find((l) => Number(l.ledger_id) !== Number(voucher.party_ledger_id));
  const amount = Math.abs(Number(cash.amount));

  const open = await loadOutstanding({ businessId: voucher.business_id, groups: PARTY_GROUPS, ledgerId: party.ledger_id });
  const openByRef = new Map(open.filter((b) => b.bill_ref).map((b) => [b.bill_ref, Number(b.balance)]));
  for (const a of allocations) {
    // A receipt clears debit (receivable) bills, a payment clears credit (payable) ones.
    const balance = openByRef.get(a.billRef);
    const room = voucher.voucher_type === 'receipt' ? balance : -balance;
    if (balance == null || !(room > 0)) throw Object.assign(new Error(`Bill ${a.billRef} is not open for this party.`), { statusCode: 400 });
    if (toPaise(a.amount) > toPaise(room)) throw Object.assign(new Error(`Bill ${a.billRef} has only ₹${room.toFixed(2)} open.`), { statusCode: 400 });
  }

  const rebuilt = settlementLines({
    kind: voucher.voucher_type, partyLedgerId: Number(party.ledger_id), cashBankLedgerId: Number(cash.ledger_id),
    amount, allocations, instrumentNo: cash.instrument_no,
  });
  await tx('DELETE FROM acc_voucher_lines WHERE voucher_id = $1', [voucher.id]);
  for (const [index, line] of rebuilt.entries()) {
    await tx(
      `INSERT INTO acc_voucher_lines (voucher_id, ledger_id, amount, bill_ref_type, bill_ref, instrument_no, sort)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [voucher.id, line.ledgerId, line.amount, line.billRefType || null, line.billRef || null, line.instrumentNo || null, index]
    );
  }
}

/**
 * post    — an approver who did not enter it numbers and posts a draft,
 *           optionally settling a receipt/payment against bills first.
 * discard — delete a draft (its creator or an approver).
 * cancel  — reverse a posted manual voucher. Auto-posted entries are cancelled
 *           through their invoice or purchase instead.
 */
export const PATCH = stockRoute(async function PATCH(request, context) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const found = await loadVoucher(id);
    if (!found) return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    const { voucher, lines } = found;
    const mine = Number(voucher.created_by_user_id) === Number(gate.appUser.id);

    if (body.action === 'discard') {
      if (voucher.status !== 'draft') return NextResponse.json({ error: 'Only a draft can be discarded.' }, { status: 409 });
      if (!mine && !gate.isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      await withBooks(gate.appUser, (tx) => tx('DELETE FROM acc_vouchers WHERE id = $1 AND status = $2', [voucher.id, 'draft']));
      return NextResponse.json({ discarded: voucher.id });
    }

    if (!gate.isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (body.action === 'post') {
      if (voucher.status !== 'draft') return NextResponse.json({ error: `Voucher is already ${voucher.status}.` }, { status: 409 });
      if (mine) return NextResponse.json({ error: 'Another approver must post a voucher you entered.' }, { status: 403 });
      const posted = await withBooks(gate.appUser, async (tx) => {
        const allocations = Array.isArray(body.allocations) ? body.allocations : null;
        if (allocations && ['receipt', 'payment'].includes(voucher.voucher_type) && PARTY_GROUPS.includes(voucher.party_group)) {
          await settleDraft(tx, voucher, lines, allocations);
        }
        return postDraft(tx, voucher.id, gate.appUser.id);
      });
      return NextResponse.json({ voucher: posted });
    }

    if (body.action === 'cancel') {
      if (voucher.status !== 'posted') return NextResponse.json({ error: 'Only a posted voucher can be cancelled.' }, { status: 409 });
      if (voucher.source_table) {
        return NextResponse.json({ error: 'This entry follows its invoice or purchase; cancel that document instead.' }, { status: 409 });
      }
      const [cancelled] = await withBooks(gate.appUser, (tx) => tx(
        `UPDATE acc_vouchers SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'posted' RETURNING *`,
        [gate.appUser.id, voucher.id]
      ));
      return NextResponse.json({ voucher: cancelled });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return accountsError(error, 'Failed to update voucher');
  }
});
