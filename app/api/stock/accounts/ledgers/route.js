import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { accountsError, accountsGuard, loadBusiness, loadLedgers, withBooks } from '@/lib/accounts-db';
import { canonicalGroup, CASH_BANK_GROUPS, PARTY_GROUPS } from '@/lib/accounts.mjs';
import { stockRoute } from '@/lib/stock-workflow';

/**
 * Ledgers of one business with their posted balances. Salespeople get only
 * customers and cash/bank — enough to record a receipt draft.
 */
export const GET = stockRoute(async function GET(request) {
  const gate = await accountsGuard(request, { allowSalesperson: true });
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    let ledgers = await loadLedgers(business.id);
    if (gate.role === 'salesperson') {
      ledgers = ledgers
        .filter((l) => l.group_name === 'Sundry Debtors' || CASH_BANK_GROUPS.includes(l.group_name))
        .map(({ id, name, group_name, is_active }) => ({ id, name, group_name, is_active }));
    }
    return NextResponse.json({ business, ledgers });
  } catch (error) {
    return accountsError(error, 'Failed to load ledgers');
  }
});

function readLedgerFields(body, { partial }) {
  const fields = {};
  const has = (key) => body[key] !== undefined;
  if (!partial || has('name')) {
    fields.name = String(body.name || '').trim().slice(0, 120);
    if (!fields.name) throw Object.assign(new Error('Ledger name is required'), { statusCode: 400 });
  }
  if (!partial || has('group')) {
    fields.group_name = canonicalGroup(body.group);
    if (!fields.group_name) throw Object.assign(new Error('Pick a group from the list'), { statusCode: 400 });
  }
  if (!partial || has('creditLimit')) fields.credit_limit = Math.max(0, Number(body.creditLimit) || 0);
  if (!partial || has('creditDays')) fields.credit_days = Math.max(0, Math.min(365, Number.parseInt(body.creditDays, 10) || 0));
  if (!partial || has('phone')) fields.phone = String(body.phone || '').trim() || null;
  if (!partial || has('gstin')) fields.gstin = String(body.gstin || '').trim().toUpperCase() || null;
  if (partial && has('isActive')) fields.is_active = Boolean(body.isActive);
  return fields;
}

export const POST = stockRoute(async function POST(request) {
  const gate = await accountsGuard(request, { write: true });
  if (gate.error) return gate.error;
  try {
    const body = await request.json().catch(() => ({}));
    const business = await loadBusiness(body.businessId);
    const fields = readLedgerFields(body, { partial: false });
    const columns = ['business_id', ...Object.keys(fields)];
    const [ledger] = await withBooks(gate.appUser, (tx) => tx(
      `INSERT INTO acc_ledgers (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      [business.id, ...Object.values(fields)]
    ));
    return NextResponse.json({ ledger }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505') return NextResponse.json({ error: 'A ledger with that name already exists' }, { status: 409 });
    return accountsError(error, 'Failed to create ledger');
  }
});

export const PATCH = stockRoute(async function PATCH(request) {
  const gate = await accountsGuard(request, { write: true });
  if (gate.error) return gate.error;
  try {
    const body = await request.json().catch(() => ({}));
    const [current] = await sql('SELECT * FROM acc_ledgers WHERE id = $1', [Number(body.ledgerId) || 0]);
    if (!current) return NextResponse.json({ error: 'Ledger not found' }, { status: 404 });
    const fields = readLedgerFields(body, { partial: true });
    // The code posts to system ledgers by role and to party ledgers by group:
    // renaming them is fine, regrouping them would silently move balances.
    if (fields.group_name && fields.group_name !== current.group_name
        && (current.system_key || PARTY_GROUPS.includes(current.group_name))) {
      return NextResponse.json({ error: 'System and party ledgers keep their group.' }, { status: 409 });
    }
    const columns = Object.keys(fields);
    if (!columns.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    const [ledger] = await withBooks(gate.appUser, (tx) => tx(
      `UPDATE acc_ledgers SET ${columns.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = NOW()
       WHERE id = $${columns.length + 1} RETURNING *`,
      [...Object.values(fields), current.id]
    ));
    return NextResponse.json({ ledger });
  } catch (error) {
    if (error?.code === '23505') return NextResponse.json({ error: 'A ledger with that name already exists' }, { status: 409 });
    return accountsError(error, 'Failed to update ledger');
  }
});
