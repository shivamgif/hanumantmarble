// Server side of the books: posting, party ledgers, and the queries behind the
// day book, outstanding and ledger statements. Rules live in lib/accounts.mjs;
// the database refuses anything unbalanced, edited after posting, or in a
// locked year (scripts/migrate-accounts.mjs).
import { NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { istToday } from '@/lib/attendance.mjs';
import { computeInvoiceTotals, fiscalYearOf } from '@/lib/gst-invoice.mjs';
import { creditNoteLines, formatVoucherNumber, purchaseLines, salesInvoiceLines, SYSTEM_LEDGERS } from '@/lib/accounts.mjs';

/**
 * Accounts API gate. Approvers (admin/manager) run the books, read_only_admin
 * reads them, salespeople may only record receipt drafts. Returns
 * { appUser, role, isApprover } or { error }.
 */
export async function accountsGuard(request, { write = false, allowSalesperson = false } = {}) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) return { error: NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 }) };
  if (!(await getStockSchemaCapabilities()).hasAccounts) {
    return { error: NextResponse.json({ error: 'Accounts are not set up yet. Run the accounts migration.' }, { status: 503 }) };
  }
  const role = normalizeStockRole(appUser?.role);
  const isApprover = getRoleFlags(role).canApprove;
  const allowed = isApprover
    || (!write && role === 'read_only_admin')
    || (allowSalesperson && role === 'salesperson');
  if (!appUser || !allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { appUser, role, isApprover };
}

/** The business, with its books start date as text; throws 404. */
export async function loadBusiness(businessId) {
  const [business] = await sql(
    `SELECT id, legal_name, gstin, state_code, is_active, books_start_date::text AS books_start_date
     FROM stock_businesses WHERE id = $1`,
    [Number(businessId) || 0]
  );
  if (!business) throw Object.assign(new Error('Business not found'), { statusCode: 404 });
  return business;
}

/** Route error → JSON, keeping 4xx messages and hiding 500 internals. */
export function accountsError(error, fallback) {
  // P0001: a RAISE from the books triggers (locked year, unbalanced, posted is final).
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : error?.code === 'P0001' ? 409 : 500;
  if (status === 500) console.error(fallback, error);
  return NextResponse.json({ error: status === 500 ? fallback : error.message, detail: error.message }, { status });
}

/** A transaction that tags every audit-log row with the acting user. */
export function withBooks(appUser, callback) {
  return withTransaction(async (tx) => {
    await tx(`SELECT set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)`,
      [String(appUser?.id ?? ''), String(appUser?.email ?? '')]);
    return callback(tx);
  });
}

/**
 * Has the business started its books by `date`? Both are 'YYYY-MM-DD' text —
 * callers select dates with ::text, because a DATE read through the
 * transaction driver becomes a JS Date that can shift a day by time zone.
 */
export function booksStarted(booksStartDate, date) {
  return Boolean(booksStartDate && String(date).slice(0, 10) >= String(booksStartDate).slice(0, 10));
}

/** system_key → ledger id for a business, seeding any that are missing. */
export async function systemLedgers(tx, businessId) {
  let rows = await tx('SELECT id, system_key FROM acc_ledgers WHERE business_id = $1 AND system_key IS NOT NULL', [businessId]);
  if (rows.length < Object.keys(SYSTEM_LEDGERS).length) {
    for (const [key, { name, group }] of Object.entries(SYSTEM_LEDGERS)) {
      await tx(
        `INSERT INTO acc_ledgers (business_id, name, group_name, system_key) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [businessId, name, group, key]
      );
    }
    rows = await tx('SELECT id, system_key FROM acc_ledgers WHERE business_id = $1 AND system_key IS NOT NULL', [businessId]);
  }
  return Object.fromEntries(rows.map((row) => [row.system_key, Number(row.id)]));
}

const PARTY = {
  customer: { column: 'customer_id', group: 'Sundry Debtors', table: 'stock_customers', label: 'Customer' },
  supplier: { column: 'supplier_id', group: 'Sundry Creditors', table: 'stock_suppliers', label: 'Supplier' },
  transporter: { column: 'transporter_id', group: 'Sundry Creditors', table: 'stock_transporters', label: 'Transporter' },
};

/**
 * The ledger for a customer/supplier/transporter in this business. Found by
 * its link first, then by name (so ledgers imported from Tally get linked the
 * first time that party trades), else created.
 */
export async function ensurePartyLedger(tx, businessId, kind, partyId) {
  const spec = PARTY[kind];
  const linked = await tx(`SELECT id FROM acc_ledgers WHERE business_id = $1 AND ${spec.column} = $2`, [businessId, partyId]);
  if (linked[0]) return Number(linked[0].id);

  const party = (await tx(`SELECT * FROM ${spec.table} WHERE id = $1`, [partyId]))[0];
  if (!party) throw new Error(`${spec.label} ${partyId} not found`);
  const phone = party.whatsapp_phone || party.phone || null;
  const gstin = party.gst_number || null;

  const byName = await tx(
    `SELECT id FROM acc_ledgers WHERE business_id = $1 AND lower(name) = lower($2) AND group_name = $3 AND ${spec.column} IS NULL`,
    [businessId, party.name, spec.group]
  );
  if (byName[0]) {
    await tx(`UPDATE acc_ledgers SET ${spec.column} = $1, phone = COALESCE(phone, $2), gstin = COALESCE(gstin, $3), updated_at = NOW() WHERE id = $4`,
      [partyId, phone, gstin, byName[0].id]);
    return Number(byName[0].id);
  }

  // A clash with a non-party ledger name gets a suffix rather than a merge.
  const clash = await tx('SELECT 1 FROM acc_ledgers WHERE business_id = $1 AND lower(name) = lower($2)', [businessId, party.name]);
  const name = clash[0] ? `${party.name} (${spec.label} ${partyId})` : party.name;
  const created = await tx(
    `INSERT INTO acc_ledgers (business_id, name, group_name, ${spec.column}, gstin, state_code, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [businessId, name, spec.group, partyId, gstin, gstin ? gstin.slice(0, 2) : null, phone]
  );
  return Number(created[0].id);
}

/** Next number in a business's series for one voucher type and year. */
async function nextSeq(tx, businessId, type, fiscalYear) {
  await tx('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`acc_voucher_seq:${businessId}:${type}:${fiscalYear}`]);
  const [{ next }] = await tx(
    `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM acc_vouchers WHERE business_id = $1 AND voucher_type = $2 AND fiscal_year = $3`,
    [businessId, type, fiscalYear]
  );
  return Number(next);
}

/**
 * Insert a voucher with its lines. status 'posted' numbers it (unless a
 * document number is given, e.g. a sales invoice's own number); 'draft' waits
 * for another approver (postDraft).
 */
export async function createVoucher(tx, {
  businessId, type, date, reference = null, narration = null, lines, partyLedgerId = null,
  sourceTable = null, sourceId = null, createdBy = null, approvedBy = null, voucherNumber = null, status = 'posted',
}) {
  const fiscalYear = fiscalYearOf(date);
  const amount = lines.reduce((sum, line) => sum + Math.max(0, Number(line.amount)), 0);
  const [voucher] = await tx(
    `INSERT INTO acc_vouchers (business_id, voucher_type, status, voucher_date, fiscal_year, reference, narration,
       party_ledger_id, amount, source_table, source_id, created_by_user_id)
     VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [businessId, type, date, fiscalYear, reference, narration, partyLedgerId, amount.toFixed(2), sourceTable, sourceId, createdBy]
  );
  for (const [index, line] of lines.entries()) {
    await tx(
      `INSERT INTO acc_voucher_lines (voucher_id, ledger_id, amount, bill_ref_type, bill_ref, bill_date, location_id, instrument_no, sort)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [voucher.id, line.ledgerId, line.amount, line.billRefType || null, line.billRef || null, line.billDate || null,
        line.locationId || null, line.instrumentNo || null, index]
    );
  }
  if (status === 'posted') return postDraft(tx, voucher.id, approvedBy ?? createdBy, voucherNumber);
  return (await tx('SELECT * FROM acc_vouchers WHERE id = $1', [voucher.id]))[0];
}

/** Number and post a draft. The caller has already checked who may post it. */
export async function postDraft(tx, voucherId, approvedBy, voucherNumber = null) {
  const [draft] = await tx('SELECT * FROM acc_vouchers WHERE id = $1 FOR UPDATE', [voucherId]);
  if (draft.status !== 'draft') throw Object.assign(new Error(`Voucher is already ${draft.status}.`), { statusCode: 409 });
  const seq = voucherNumber ? null : await nextSeq(tx, draft.business_id, draft.voucher_type, draft.fiscal_year);
  const [posted] = await tx(
    `UPDATE acc_vouchers SET status = 'posted', seq = $1, voucher_number = $2, approved_by_user_id = $3,
       posted_at = NOW(), updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [seq, voucherNumber || formatVoucherNumber(draft.voucher_type, draft.fiscal_year, seq), approvedBy, voucherId]
  );
  return posted;
}

/** Cancel the live voucher auto-posted from a document (if any). */
export async function cancelSourceVoucher(tx, sourceTable, sourceId, userId) {
  return tx(
    `UPDATE acc_vouchers SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $3, updated_at = NOW()
     WHERE source_table = $1 AND source_id = $2 AND status = 'posted' RETURNING id`,
    [sourceTable, sourceId, userId]
  );
}

/**
 * Post an approved tax invoice as a sales voucher — inside the approval
 * transaction, so an invoice is never issued without its entry (once the
 * business's books have started).
 */
export async function postSalesInvoice(tx, invoice, date, appUser) {
  const [business] = await tx(
    'SELECT id, state_code, books_start_date::text AS books_start_date FROM stock_businesses WHERE id = $1',
    [invoice.business_id]
  );
  if (!booksStarted(business.books_start_date, date)) return null;

  const ledgers = await systemLedgers(tx, business.id);
  const partyLedgerId = invoice.customer_id
    ? await ensurePartyLedger(tx, business.id, 'customer', invoice.customer_id)
    : null;
  if (!partyLedgerId) throw new Error('The invoice has no customer record to post against.');
  // The invoice is where a customer's GSTIN is entered; the ledger (and the
  // Tally master exported from it) needs it for B2B. Fills blanks only.
  await tx(
    `UPDATE acc_ledgers SET gstin = COALESCE(gstin, $1), state_code = COALESCE(state_code, $2), updated_at = NOW()
     WHERE id = $3 AND (gstin IS NULL OR state_code IS NULL)`,
    [invoice.bill_to_gstin || null, invoice.bill_to_state_code || null, partyLedgerId]
  );

  const totals = computeInvoiceTotals(invoice.items, business.state_code, invoice.bill_to_state_code);
  return createVoucher(tx, {
    businessId: business.id,
    type: 'sales',
    date,
    reference: invoice.invoice_number,
    narration: `Sales invoice ${invoice.invoice_number} to ${invoice.bill_to_name}`,
    lines: salesInvoiceLines({ totals, partyLedgerId, ledgers, billRef: invoice.invoice_number, billDate: date, locationId: invoice.location_id }),
    partyLedgerId,
    sourceTable: 'stock_sales_invoices',
    sourceId: invoice.id,
    createdBy: appUser?.id ?? null,
    voucherNumber: invoice.invoice_number,
  });
}

/**
 * Post an approved credit note against its invoice, inside the approval
 * transaction. `date` is the note's date as 'YYYY-MM-DD' text.
 */
export async function postCreditNote(tx, note, invoice, date, appUser) {
  const [business] = await tx(
    'SELECT id, state_code, books_start_date::text AS books_start_date FROM stock_businesses WHERE id = $1',
    [note.business_id]
  );
  if (!booksStarted(business.books_start_date, date)) return null;
  if (!invoice.customer_id) throw new Error('The invoice has no customer record to post against.');
  const partyLedgerId = await ensurePartyLedger(tx, business.id, 'customer', invoice.customer_id);
  const sellerState = invoice.seller_snapshot?.business?.stateCode || business.state_code;
  return createVoucher(tx, {
    businessId: business.id,
    type: 'credit_note',
    date,
    reference: invoice.invoice_number,
    narration: `Credit note ${note.note_number} to ${invoice.bill_to_name} against ${invoice.invoice_number}`,
    lines: creditNoteLines({
      totals: computeInvoiceTotals(note.items, sellerState, invoice.bill_to_state_code),
      partyLedgerId,
      ledgers: await systemLedgers(tx, business.id),
      invoiceNumber: invoice.invoice_number,
      locationId: invoice.location_id,
    }),
    partyLedgerId,
    sourceTable: 'acc_notes',
    sourceId: note.id,
    createdBy: note.created_by_user_id ?? null,
    approvedBy: appUser?.id ?? null,
    voucherNumber: note.note_number,
  });
}

/**
 * Keep an approved purchase's voucher equal to its bill. Idempotent: called on
 * approval and after any edit that can change the total; re-posts (cancel +
 * new) only when the amount or supplier actually changed.
 */
export async function syncPurchaseVoucher(tx, shipmentId, appUser) {
  const [shipment] = await tx(
    `SELECT s.*, l.business_id, b.books_start_date::text AS books_start_date, b.state_code AS business_state,
            sup.gst_number AS supplier_gstin,
            COALESCE(s.invoice_date::date, s.arrival_date::date, CURRENT_DATE)::text AS doc_date
     FROM stock_inbound_shipments s
     LEFT JOIN stock_locations l ON l.id = s.destination_location_id
     LEFT JOIN stock_businesses b ON b.id = l.business_id
     LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
     WHERE s.id = $1`,
    [shipmentId]
  );
  if (!shipment) return null;
  const date = shipment.doc_date;
  const due = shipment.approval_status === 'approved' && shipment.supplier_id && Number(shipment.grand_total) > 0
    && booksStarted(shipment.books_start_date, date);

  const [current] = await tx(
    `SELECT id, amount, party_ledger_id FROM acc_vouchers
     WHERE source_table = 'stock_inbound_shipments' AND source_id = $1 AND status = 'posted'`,
    [shipmentId]
  );
  if (!due) {
    if (current) await cancelSourceVoucher(tx, 'stock_inbound_shipments', shipmentId, appUser?.id ?? null);
    return null;
  }

  const partyLedgerId = await ensurePartyLedger(tx, shipment.business_id, 'supplier', shipment.supplier_id);
  if (current && Number(current.amount) === Number(Number(shipment.grand_total).toFixed(2)) && Number(current.party_ledger_id) === partyLedgerId) {
    return current;
  }
  if (current) await cancelSourceVoucher(tx, 'stock_inbound_shipments', shipmentId, appUser?.id ?? null);

  const supplierState = shipment.supplier_gstin ? String(shipment.supplier_gstin).slice(0, 2) : shipment.business_state;
  const billRef = shipment.invoice_number || shipment.shipment_number;
  return createVoucher(tx, {
    businessId: shipment.business_id,
    type: 'purchase',
    date,
    reference: billRef,
    narration: `Purchase ${shipment.shipment_number}, supplier bill ${billRef}`,
    lines: purchaseLines({
      grandTotal: shipment.grand_total,
      gstPercent: shipment.gst_percent ?? 18,
      interState: supplierState !== shipment.business_state,
      claimItc: Boolean(shipment.supplier_gstin),
      partyLedgerId,
      ledgers: await systemLedgers(tx, shipment.business_id),
      billRef,
      billDate: date,
      locationId: shipment.destination_location_id,
    }),
    partyLedgerId,
    sourceTable: 'stock_inbound_shipments',
    sourceId: shipmentId,
    createdBy: appUser?.id ?? null,
  });
}

/**
 * Open bills per party: posted party lines grouped by bill reference. Bills
 * with no reference are the party's on-account (advance) balance.
 */
export async function loadOutstanding({ businessId, groups, ledgerId = null, asOf = istToday() }) {
  const params = [businessId, groups, asOf];
  let ledgerFilter = '';
  if (ledgerId) {
    params.push(ledgerId);
    ledgerFilter = `AND l.id = $${params.length}`;
  }
  return sql(
    `SELECT l.id AS ledger_id, l.name, l.group_name, l.phone, l.credit_days, l.credit_limit,
            vl.bill_ref,
            MIN(CASE WHEN vl.bill_ref_type = 'new' THEN COALESCE(vl.bill_date, v.voucher_date) END)::text AS bill_date,
            SUM(vl.amount) AS balance
     FROM acc_voucher_lines vl
     JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
     JOIN acc_ledgers l ON l.id = vl.ledger_id
     WHERE l.business_id = $1 AND l.group_name = ANY($2::text[]) AND v.voucher_date <= $3 ${ledgerFilter}
     GROUP BY l.id, vl.bill_ref
     HAVING SUM(vl.amount) <> 0
     ORDER BY l.name, bill_date NULLS LAST, vl.bill_ref`,
    params
  );
}

/** Ledger statement: opening balance before `from`, then every posted line in range. */
export async function loadStatement({ ledgerId, from, to }) {
  const [opening] = await sql(
    `SELECT COALESCE(SUM(vl.amount), 0) AS balance
     FROM acc_voucher_lines vl JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
     WHERE vl.ledger_id = $1 AND v.voucher_date < $2`,
    [ledgerId, from]
  );
  const lines = await sql(
    `SELECT v.id AS voucher_id, v.voucher_date::text AS date, v.voucher_type, v.voucher_number, v.reference, v.narration,
            vl.amount, vl.bill_ref, vl.bill_ref_type, vl.instrument_no, vl.bank_cleared_on::text AS bank_cleared_on
     FROM acc_voucher_lines vl JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
     WHERE vl.ledger_id = $1 AND v.voucher_date BETWEEN $2 AND $3
     ORDER BY v.voucher_date, v.id, vl.sort`,
    [ledgerId, from, to]
  );
  return { opening: Number(opening.balance), lines };
}

/** Posted balance per ledger for a business (Dr +, Cr −). */
export async function loadLedgers(businessId) {
  return sql(
    `SELECT l.*, COALESCE(b.balance, 0) AS balance
     FROM acc_ledgers l
     LEFT JOIN (
       SELECT vl.ledger_id, SUM(vl.amount) AS balance
       FROM acc_voucher_lines vl JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
       GROUP BY vl.ledger_id
     ) b ON b.ledger_id = l.id
     WHERE l.business_id = $1
     ORDER BY l.group_name, l.name`,
    [businessId]
  );
}
