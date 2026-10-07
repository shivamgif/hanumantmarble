import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  accountsError, accountsGuard, createVoucher, loadBusiness, syncPurchaseVoucher, systemLedgers, withBooks,
} from '@/lib/accounts-db';
import { addDays, openingLines, parseOpeningBills, parseTrialBalance, PARTY_GROUPS } from '@/lib/accounts.mjs';

const bad = (message, extra = {}) => Object.assign(new Error(message), { statusCode: 400, ...extra });

/** Books status for one business: start date, opening entry, what is posted and pending. */
export async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    const [opening] = await sql(
      `SELECT id, voucher_number, voucher_date::text AS voucher_date, amount, posted_at
       FROM acc_vouchers WHERE business_id = $1 AND voucher_type = 'opening' AND status = 'posted'`,
      [business.id]
    );
    const [counts] = await sql(
      `SELECT COUNT(*) FILTER (WHERE status = 'posted')::int AS posted,
              COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
       FROM acc_vouchers WHERE business_id = $1`,
      [business.id]
    );
    return NextResponse.json({ business, opening: opening || null, counts });
  } catch (error) {
    return accountsError(error, 'Failed to load books setup');
  }
}

/** Trial balance + bills → ledgers created (party ones linked by name) and one opening voucher. */
async function importOpening(tx, business, body, appUser) {
  const tb = parseTrialBalance(body.trialBalanceCsv);
  const bills = body.billsCsv ? parseOpeningBills(body.billsCsv) : { bills: [], errors: [] };
  const errors = [...tb.errors, ...bills.errors];
  if (!tb.entries.length && !errors.length) errors.push('The trial balance has no balances.');

  const existing = await tx('SELECT id, name, group_name FROM acc_ledgers WHERE business_id = $1', [business.id]);
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
  for (const entry of tb.entries) {
    const found = byName.get(entry.name.toLowerCase());
    if (found && found.group_name !== entry.group) {
      errors.push(`"${entry.name}" already exists under ${found.group_name}, not ${entry.group}.`);
    }
  }
  const partyNames = new Set(tb.entries.filter((e) => PARTY_GROUPS.includes(e.group)).map((e) => e.name.toLowerCase()));
  for (const bill of bills.bills) {
    if (!partyNames.has(bill.party.toLowerCase())) errors.push(`Bill ${bill.billRef}: "${bill.party}" is not a debtor or creditor in the trial balance.`);
  }
  if (errors.length) throw bad('The files have problems; nothing was imported.', { details: errors });

  // Create missing ledgers; link debtors/creditors to the app's customers and
  // suppliers by name so new invoices and purchases land on the same ledger.
  for (const entry of tb.entries) {
    if (byName.has(entry.name.toLowerCase())) continue;
    const link = entry.group === 'Sundry Debtors'
      ? (await tx('SELECT id FROM stock_customers WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [entry.name]))[0]
      : entry.group === 'Sundry Creditors'
        ? (await tx('SELECT id FROM stock_suppliers WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [entry.name]))[0]
        : null;
    const column = entry.group === 'Sundry Debtors' ? 'customer_id' : 'supplier_id';
    const [created] = await tx(
      `INSERT INTO acc_ledgers (business_id, name, group_name${link ? `, ${column}` : ''})
       VALUES ($1, $2, $3${link ? ', $4' : ''})
       ON CONFLICT DO NOTHING RETURNING id, name, group_name`,
      link ? [business.id, entry.name, entry.group, link.id] : [business.id, entry.name, entry.group]
    );
    // ON CONFLICT: the customer/supplier already has a ledger under another name.
    const row = created || (await tx(
      `INSERT INTO acc_ledgers (business_id, name, group_name) VALUES ($1, $2, $3) RETURNING id, name, group_name`,
      [business.id, entry.name, entry.group]
    ))[0];
    byName.set(row.name.toLowerCase(), row);
  }

  const ledgers = await systemLedgers(tx, business.id);
  const lines = openingLines({
    entries: tb.entries,
    bills: bills.bills,
    ledgerIdByName: new Map([...byName].map(([name, l]) => [name, Number(l.id)])),
    differenceLedgerId: ledgers.opening_difference,
  });

  // Re-importing replaces the previous opening entry.
  await tx(
    `UPDATE acc_vouchers SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $2, updated_at = NOW()
     WHERE business_id = $1 AND voucher_type = 'opening' AND status = 'posted'`,
    [business.id, appUser.id]
  );
  const voucher = await createVoucher(tx, {
    businessId: business.id,
    type: 'opening',
    date: addDays(business.books_start_date, -1),
    narration: `Opening balances imported from Tally (${tb.entries.length} ledgers, ${bills.bills.length} bills)`,
    lines,
    createdBy: appUser.id,
  });
  const difference = lines.find((l) => l.ledgerId === ledgers.opening_difference);
  return { voucher, ledgers: tb.entries.length, bills: bills.bills.length, difference: difference ? -difference.amount : 0 };
}

/**
 * start            — set the books start date (only while nothing else is posted).
 * opening          — import Tally's trial balance (+ outstanding bills) as one opening voucher.
 * resync_purchases — post or repair purchase entries from the start date on.
 */
export async function POST(request) {
  const gate = await accountsGuard(request, { write: true });
  if (gate.error) return gate.error;
  try {
    const body = await request.json().catch(() => ({}));
    const business = await loadBusiness(body.businessId);

    if (body.action === 'start') {
      const date = String(body.booksStartDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Pick the date the books start.');
      const [{ count }] = await sql(
        `SELECT COUNT(*)::int AS count FROM acc_vouchers WHERE business_id = $1 AND status = 'posted' AND voucher_type <> 'opening'`,
        [business.id]
      );
      if (count) throw Object.assign(new Error('Entries are already posted; the start date can no longer move.'), { statusCode: 409 });
      await withBooks(gate.appUser, async (tx) => {
        await tx('UPDATE stock_businesses SET books_start_date = $1, updated_at = NOW() WHERE id = $2', [date, business.id]);
        await systemLedgers(tx, business.id);
      });
      return NextResponse.json({ booksStartDate: date });
    }

    if (body.action === 'opening') {
      if (!business.books_start_date) throw bad('Set the books start date first.');
      const result = await withBooks(gate.appUser, (tx) => importOpening(tx, business, body, gate.appUser));
      return NextResponse.json(result, { status: 201 });
    }

    if (body.action === 'resync_purchases') {
      if (!business.books_start_date) throw bad('Set the books start date first.');
      const shipments = await sql(
        `SELECT s.id FROM stock_inbound_shipments s JOIN stock_locations l ON l.id = s.destination_location_id
         WHERE l.business_id = $1 AND COALESCE(s.invoice_date::date, s.arrival_date::date) >= $2
         ORDER BY s.id`,
        [business.id, business.books_start_date]
      );
      const failed = [];
      for (const { id } of shipments) {
        try {
          await withBooks(gate.appUser, (tx) => syncPurchaseVoucher(tx, Number(id), gate.appUser));
        } catch (error) {
          failed.push({ id: Number(id), error: error.message });
        }
      }
      return NextResponse.json({ checked: shipments.length, failed });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error.details) return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    return accountsError(error, 'Failed to update books setup');
  }
}
