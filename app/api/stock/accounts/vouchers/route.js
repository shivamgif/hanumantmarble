import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { istToday } from '@/lib/attendance.mjs';
import { accountsError, accountsGuard, createVoucher, loadBusiness, systemLedgers, withBooks, withTds } from '@/lib/accounts-db';
import {
  assertBalanced, CASH_BANK_GROUPS, expenseLines, PARTY_GROUPS, settlementLines, toPaise, VOUCHER_TYPES,
} from '@/lib/accounts.mjs';
import { stockRoute } from '@/lib/stock-workflow';

const MANUAL_TYPES = ['receipt', 'payment', 'contra', 'journal'];
const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Day book: vouchers of one business, newest first. */
export const GET = stockRoute(async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    const params = [business.id, searchParams.get('from') || '1900-01-01', searchParams.get('to') || '2999-12-31'];
    const filters = ['v.business_id = $1', 'v.voucher_date BETWEEN $2 AND $3'];
    for (const key of ['type', 'status']) {
      const value = searchParams.get(key);
      if (value) {
        params.push(value);
        filters.push(`v.${key === 'type' ? 'voucher_type' : 'status'} = $${params.length}`);
      }
    }
    const vouchers = await sql(
      `SELECT v.id, v.voucher_type, v.status, v.voucher_date::text AS voucher_date, v.voucher_number, v.reference,
              v.narration, v.amount, v.source_table, v.source_id, v.created_by_user_id,
              p.name AS party_name, cu.name AS created_by_name, au.name AS approved_by_name
       FROM acc_vouchers v
       LEFT JOIN acc_ledgers p ON p.id = v.party_ledger_id
       LEFT JOIN stock_app_users cu ON cu.id = v.created_by_user_id
       LEFT JOIN stock_app_users au ON au.id = v.approved_by_user_id
       WHERE ${filters.join(' AND ')}
       ORDER BY v.voucher_date DESC, v.id DESC
       LIMIT 300`,
      params
    );
    return NextResponse.json({ business, vouchers });
  } catch (error) {
    return accountsError(error, 'Failed to load vouchers');
  }
});

/** Ledgers referenced by a voucher, all in this business and active. */
async function ledgersById(businessId, ids) {
  const rows = await sql(
    'SELECT id, name, group_name, system_key FROM acc_ledgers WHERE business_id = $1 AND id = ANY($2::bigint[]) AND is_active',
    [businessId, ids.filter(Boolean).map(Number)]
  );
  const map = new Map(rows.map((row) => [Number(row.id), row]));
  for (const id of ids) {
    if (id && !map.has(Number(id))) throw bad(`Ledger ${id} is not an active ledger of this business.`);
  }
  return map;
}

const isCashBank = (ledger) => ledger && CASH_BANK_GROUPS.includes(ledger.group_name);
const isParty = (ledger) => ledger && PARTY_GROUPS.includes(ledger.group_name);

/**
 * Request → balanced lines. The server builds every line itself from the
 * typed fields; a client never submits raw entries except for a journal.
 */
async function buildLines(business, body) {
  const type = body.type;
  if (type === 'receipt' || type === 'payment') {
    const counterId = Number(body.partyLedgerId || body.ledgerId);
    const cashBankId = Number(body.cashBankLedgerId);
    const ledgers = await ledgersById(business.id, [counterId, cashBankId]);
    const counter = ledgers.get(counterId);
    if (!counter) throw bad(type === 'receipt' ? 'Pick who paid.' : 'Pick who or what was paid.');
    if (!isCashBank(ledgers.get(cashBankId))) throw bad('Pick the cash or bank account.');
    if (isCashBank(counter)) throw bad('Moving money between cash and bank is a contra entry.');

    if (isParty(counter)) {
      const allocations = body.allocations || [];
      return {
        partyLedgerId: counterId,
        lines: settlementLines({ kind: type, partyLedgerId: counterId, cashBankLedgerId: cashBankId, amount: body.amount, allocations, instrumentNo: body.instrumentNo || null }),
      };
    }
    if (type === 'payment') {
      return {
        partyLedgerId: null,
        lines: expenseLines({
          expenseLedgerId: counterId, cashBankLedgerId: cashBankId, amount: body.amount,
          gstRate: Number(body.gstRate) || 0, interState: Boolean(body.interState),
          ledgers: await systemLedgers(sql, business.id),
          instrumentNo: body.instrumentNo || null,
        }),
      };
    }
    // Receipt from a non-party ledger (interest, a loan, capital brought in).
    const amount = toPaise(body.amount) / 100;
    if (!(amount > 0)) throw bad('Amount must be more than zero.');
    return { partyLedgerId: null, lines: assertBalanced([{ ledgerId: cashBankId, amount, instrumentNo: body.instrumentNo || null }, { ledgerId: counterId, amount: -amount }]) };
  }

  if (type === 'contra') {
    const fromId = Number(body.fromLedgerId);
    const toId = Number(body.toLedgerId);
    const ledgers = await ledgersById(business.id, [fromId, toId]);
    if (fromId === toId || !isCashBank(ledgers.get(fromId)) || !isCashBank(ledgers.get(toId))) {
      throw bad('A contra moves money between two different cash/bank accounts.');
    }
    const amount = toPaise(body.amount) / 100;
    if (!(amount > 0)) throw bad('Amount must be more than zero.');
    return { partyLedgerId: null, lines: assertBalanced([{ ledgerId: toId, amount, instrumentNo: body.instrumentNo || null }, { ledgerId: fromId, amount: -amount }]) };
  }

  if (type === 'journal') {
    const raw = Array.isArray(body.lines) ? body.lines : [];
    if (raw.length < 2 || raw.length > 100) throw bad('A journal needs 2 to 100 lines.');
    await ledgersById(business.id, raw.map((l) => Number(l.ledgerId)));
    const lines = raw.map((l) => ({
      ledgerId: Number(l.ledgerId),
      amount: (toPaise(l.debit) - toPaise(l.credit)) / 100,
      ...(l.billRef ? { billRefType: 'against', billRef: String(l.billRef).trim() } : {}),
    }));
    return { partyLedgerId: null, lines: assertBalanced(lines) };
  }
  throw bad(`Vouchers you can enter: ${MANUAL_TYPES.map((t) => VOUCHER_TYPES[t].label).join(', ')}.`);
}

/**
 * Enter a receipt, payment, contra or journal. Every manual voucher starts as
 * a draft; a different approver posts it (no self-approval).
 */
export const POST = stockRoute(async function POST(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const body = await request.json().catch(() => ({}));
    const business = await loadBusiness(body.businessId);
    if (!business.books_start_date) throw bad('Set the books start date in Accounts → Setup first.');
    const date = String(body.date || istToday()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Pick a valid date.');
    if (date < business.books_start_date) throw bad(`Books start on ${business.books_start_date}; earlier entries belong in the opening balances.`);
    if (date > istToday()) throw bad('A voucher cannot be dated in the future.');

    const built = await buildLines(business, body);
    const voucher = await withBooks(gate.appUser, async (tx) => {
      // Paying a party whose bills attract TDS (contractor, rent, fees,
      // commission): the amount is what is settled, the bank pays it less
      // the tax, and the tax goes to the section's TDS Payable.
      const { lines, tds } = body.type === 'payment' && built.partyLedgerId
        ? await withTds(tx, {
          businessId: business.id,
          partyLedgerId: built.partyLedgerId,
          date,
          base: Number(body.amount),
          adjustLedgerId: Number(body.cashBankLedgerId),
          sections: ['194C', '194H', '194I(a)', '194I(b)', '194J(a)', '194J(b)'],
          lines: built.lines,
        })
        : { lines: built.lines, tds: null };
      return createVoucher(tx, {
        businessId: business.id,
        type: body.type,
        date,
        reference: String(body.reference || '').trim().slice(0, 100) || null,
        narration: String(body.narration || '').trim().slice(0, 500) || null,
        lines,
        partyLedgerId: built.partyLedgerId,
        createdBy: gate.appUser.id,
        status: 'draft',
        tds,
      });
    });
    return NextResponse.json({ voucher }, { status: 201 });
  } catch (error) {
    return accountsError(error, 'Failed to save voucher');
  }
});
