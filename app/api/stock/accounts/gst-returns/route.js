import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { accountsError, accountsGuard, loadBusiness } from '@/lib/accounts-db';
import { stockRoute } from '@/lib/stock-workflow';
import { buildGstr1, buildGstr3b, matchGstr2b, parseGstr2b } from '@/lib/gst-returns.mjs';

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });
// Documents dated in the month: [$2, $2 + 1 month).
const IN_MONTH = (column) => `${column} >= $2::date AND ${column} < ($2::date + INTERVAL '1 month')`;

/**
 * GET ?businessId&month=YYYY-MM → GSTR-1 and GSTR-3B check figures for one
 * GSTIN and month, from the documents themselves (invoices, notes, purchases)
 * plus input tax on posted expense vouchers. Read-only.
 */
export const GET = stockRoute(async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    const month = String(searchParams.get('month') || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Pick a month.');
    const params = [business.id, `${month}-01`];

    const [invoices, notes, purchases, supplierNotes, [expense], candidates, stored] = await Promise.all([
      sql(
        `SELECT invoice_number AS number, invoice_seq AS seq, invoice_date::text AS date, status, bill_to_gstin AS gstin,
                bill_to_name AS name, bill_to_state_code AS pos, grand_total AS value, irn, items
         FROM stock_sales_invoices
         WHERE business_id = $1 AND status IN ('approved', 'cancelled') AND invoice_number IS NOT NULL AND ${IN_MONTH('invoice_date')}`,
        params
      ),
      sql(
        `SELECT n.kind, n.note_number AS number, n.seq, n.note_date::text AS date, n.status, si.bill_to_gstin AS gstin,
                si.bill_to_name AS name, si.bill_to_state_code AS pos, n.grand_total AS value, n.irn, n.items,
                n.original_number AS "originalNumber", n.original_date::text AS "originalDate", si.grand_total AS "originalValue"
         FROM acc_notes n JOIN stock_sales_invoices si ON si.id = n.sales_invoice_id
         WHERE n.business_id = $1 AND n.party_kind = 'customer' AND n.status IN ('approved', 'cancelled')
           AND n.note_number IS NOT NULL AND ${IN_MONTH('n.note_date')}`,
        params
      ),
      sql(
        `SELECT s.invoice_number AS number, COALESCE(s.invoice_date::date, s.arrival_date::date)::text AS date,
                sup.name AS supplier, sup.gst_number AS gstin, s.grand_total AS "grandTotal", s.gst_percent AS "gstPercent"
         FROM stock_inbound_shipments s
         JOIN stock_locations l ON l.id = s.destination_location_id
         LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
         WHERE l.business_id = $1 AND s.approval_status = 'approved'
           AND ${IN_MONTH('COALESCE(s.invoice_date::date, s.arrival_date::date)')}`,
        params
      ),
      sql(
        `SELECT n.note_number AS number, n.note_date::text AS date, sup.name AS supplier, sup.gst_number AS gstin, n.items
         FROM acc_notes n LEFT JOIN stock_suppliers sup ON sup.id = n.supplier_id
         WHERE n.business_id = $1 AND n.party_kind = 'supplier' AND n.status = 'approved' AND ${IN_MONTH('n.note_date')}`,
        params
      ),
      // Input tax on entries not made from a purchase or note: expenses with GST.
      sql(
        `SELECT COALESCE(SUM(vl.amount) FILTER (WHERE l.system_key = 'input_igst'), 0) AS igst,
                COALESCE(SUM(vl.amount) FILTER (WHERE l.system_key = 'input_cgst'), 0) AS cgst,
                COALESCE(SUM(vl.amount) FILTER (WHERE l.system_key = 'input_sgst'), 0) AS sgst
         FROM acc_voucher_lines vl
         JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted' AND v.source_table IS NULL AND v.voucher_type <> 'opening'
         JOIN acc_ledgers l ON l.id = vl.ledger_id
         WHERE v.business_id = $1 AND ${IN_MONTH('v.voucher_date')}`,
        params
      ),
      // 2B lists bills by the month the supplier filed them, which can be
      // months after the bill: match against this and last financial year.
      sql(
        `SELECT s.id, s.invoice_number AS number, COALESCE(s.invoice_date::date, s.arrival_date::date)::text AS date,
                sup.id AS "supplierId", sup.name AS supplier, sup.gst_number AS gstin, s.grand_total AS "grandTotal"
         FROM stock_inbound_shipments s
         JOIN stock_locations l ON l.id = s.destination_location_id
         LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
         WHERE l.business_id = $1 AND s.approval_status = 'approved'
           AND COALESCE(s.invoice_date::date, s.arrival_date::date) >= ($2::date - INTERVAL '2 years')`,
        params
      ),
      sql(
        `SELECT period, rows, uploaded_at FROM acc_gstr2b WHERE business_id = $1 AND period <= $2 ORDER BY period`,
        [business.id, month]
      ),
    ]);

    const gstr1 = buildGstr1({ sellerState: business.state_code, invoices, notes });
    const gstr3b = buildGstr3b({
      businessState: business.state_code,
      gstr1,
      purchases,
      supplierNotes,
      expenseItc: { taxable: 0, igst: Number(expense.igst), cgst: Number(expense.cgst), sgst: Number(expense.sgst) },
    });
    const thisMonth = stored.find((row) => row.period === month);
    const monthKeys = new Set(purchases.map((p) => `${p.number}|${p.date}`));
    const gstr2b = thisMonth
      ? {
        uploadedAt: thisMonth.uploaded_at,
        ...matchGstr2b({
          rows: thisMonth.rows,
          allRows: stored.flatMap((row) => row.rows),
          purchases: candidates,
          monthPurchases: candidates.filter((p) => monthKeys.has(`${p.number}|${p.date}`)),
        }),
      }
      : null;
    return NextResponse.json({
      business: { id: business.id, legalName: business.legal_name, gstin: business.gstin, stateCode: business.state_code },
      month,
      gstr1,
      gstr3b,
      gstr2b,
    });
  } catch (error) {
    return accountsError(error, 'Failed to build the GST returns');
  }
});

/** POST { businessId, month, text } → store that month's GSTR-2B (replacing an earlier upload). */
export const POST = stockRoute(async function POST(request) {
  const gate = await accountsGuard(request, { write: true });
  if (gate.error) return gate.error;
  try {
    const body = await request.json().catch(() => ({}));
    const business = await loadBusiness(body.businessId);
    let json;
    try {
      json = JSON.parse(String(body.text || ''));
    } catch {
      throw bad('That file is not JSON. Download GSTR-2B from the portal as JSON.');
    }
    const parsed = parseGstr2b(json);
    if (parsed.gstin && parsed.gstin !== business.gstin) throw bad(`That GSTR-2B is for GSTIN ${parsed.gstin}, not ${business.gstin}.`);
    const period = parsed.period || String(body.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw bad('Could not tell which month the file is for.');
    await sql(
      `INSERT INTO acc_gstr2b (business_id, period, rows, uploaded_by_user_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (business_id, period) DO UPDATE SET rows = EXCLUDED.rows, uploaded_by_user_id = EXCLUDED.uploaded_by_user_id, uploaded_at = NOW()`,
      [business.id, period, JSON.stringify(parsed.rows), gate.appUser.id]
    );
    return NextResponse.json({ period, rows: parsed.rows.length }, { status: 201 });
  } catch (error) {
    return accountsError(error, 'Failed to import GSTR-2B');
  }
});
