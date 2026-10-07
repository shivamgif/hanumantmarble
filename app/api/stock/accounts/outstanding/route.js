import { NextResponse } from 'next/server';
import { istToday } from '@/lib/attendance.mjs';
import { accountsError, accountsGuard, loadBusiness, loadOutstanding } from '@/lib/accounts-db';
import { addDays, ageBucket, AGE_BUCKETS, daysBetween } from '@/lib/accounts.mjs';

/**
 * Receivables (customers) or payables (suppliers, transporters), bill by bill,
 * aged by days past due (bill date + the party's credit days). Amounts are
 * returned positive for the side asked about; an advance shows negative.
 */
export async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    const kind = searchParams.get('kind') === 'payable' ? 'payable' : 'receivable';
    const asOf = searchParams.get('asOf') || istToday();
    const sign = kind === 'receivable' ? 1 : -1;
    const rows = await loadOutstanding({
      businessId: business.id,
      groups: [kind === 'receivable' ? 'Sundry Debtors' : 'Sundry Creditors'],
      ledgerId: Number(searchParams.get('ledgerId')) || null,
      asOf,
    });

    const parties = new Map();
    for (const row of rows) {
      if (!parties.has(row.ledger_id)) {
        parties.set(row.ledger_id, {
          ledgerId: Number(row.ledger_id), name: row.name, phone: row.phone,
          creditDays: Number(row.credit_days), creditLimit: Number(row.credit_limit),
          total: 0, buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])), onAccount: 0, bills: [],
        });
      }
      const party = parties.get(row.ledger_id);
      const amount = sign * Number(row.balance);
      party.total += amount;
      if (!row.bill_ref) {
        party.onAccount += amount; // advance or unallocated payment
        continue;
      }
      const dueDate = row.bill_date ? addDays(row.bill_date, Number(row.credit_days) || 0) : null;
      const daysPastDue = dueDate ? daysBetween(dueDate, asOf) : 0;
      const bucket = ageBucket(daysPastDue);
      party.buckets[bucket] += amount;
      party.bills.push({ billRef: row.bill_ref, billDate: row.bill_date, dueDate, daysPastDue, bucket, amount });
    }

    const list = [...parties.values()]
      .map((p) => ({ ...p, total: Math.round(p.total * 100) / 100 }))
      .filter((p) => p.total !== 0 || p.bills.length)
      .sort((a, b) => b.total - a.total);
    const totals = Object.fromEntries(AGE_BUCKETS.map((b) => [b, list.reduce((sum, p) => sum + p.buckets[b], 0)]));
    return NextResponse.json({ business, kind, asOf, parties: list, totals, grandTotal: list.reduce((sum, p) => sum + p.total, 0) });
  } catch (error) {
    return accountsError(error, 'Failed to load outstanding');
  }
}
