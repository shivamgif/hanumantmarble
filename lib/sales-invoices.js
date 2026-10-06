// Server-side reads shared by /api/stock/sales-invoices and the dispatch route
// that consumes a scanned invoice. Arithmetic lives in lib/gst-invoice.mjs.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, normalizeStockRole } from '@/lib/stock-workflow';
import { serializeBusiness } from '@/lib/gst-invoice.mjs';

/** Signed in, database up, migration run, and a stock role. Returns { session, appUser } or { error }. */
export async function salesInvoiceGuard(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) {
    return { error: NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 }) };
  }
  if (!(await getStockSchemaCapabilities()).hasSalesInvoices) {
    return { error: NextResponse.json({ error: 'Invoicing is not set up yet. Run the sales invoices migration.' }, { status: 503 }) };
  }
  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson', 'read_only_admin'])) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session, appUser };
}

// "Dispatched" is derived, never stored: an invoice is dispatched while a
// non-rejected shipment points at it. Rejecting that shipment frees the invoice.
const INVOICE_FROM = `
  FROM stock_sales_invoices si
  JOIN stock_locations l ON l.id = si.location_id
  LEFT JOIN stock_app_users sp ON sp.id = si.salesperson_user_id
  LEFT JOIN stock_app_users cb ON cb.id = si.created_by_user_id
  LEFT JOIN stock_app_users ab ON ab.id = si.approved_by_user_id
  LEFT JOIN LATERAL (
    SELECT sos.id AS dispatch_id, sos.shipment_number AS dispatch_number,
           sos.approval_status AS dispatch_approval_status
    FROM stock_outbound_shipments sos
    WHERE sos.sales_invoice_id = si.id AND sos.approval_status <> 'rejected'
    ORDER BY sos.id DESC
    LIMIT 1
  ) d ON TRUE`;

// invoice_date_text: a DATE comes back as a JS Date at server midnight, which
// prints as the previous day in some zones. The text form is the IST date as stored.
const INVOICE_SELECT = `si.*, si.invoice_date::text AS invoice_date_text, l.name AS location_name, l.address AS location_address,
  sp.name AS salesperson_name, cb.name AS created_by_name, ab.name AS approved_by_name,
  d.dispatch_id, d.dispatch_number, d.dispatch_approval_status`;

export async function listSalesInvoices({ status = null, ownerUserId = null, limit = 100 } = {}) {
  const filters = [];
  const values = [];
  if (status === 'dispatched') {
    filters.push('d.dispatch_id IS NOT NULL');
  } else if (status) {
    values.push(status);
    filters.push(`si.status = $${values.length}`);
  }
  if (ownerUserId) {
    values.push(ownerUserId);
    filters.push(`(si.salesperson_user_id = $${values.length} OR si.created_by_user_id = $${values.length})`);
  }
  values.push(limit);
  // ponytail: newest 100, no paging; add ?page when the list outgrows a screen.
  return sql(
    `SELECT ${INVOICE_SELECT} ${INVOICE_FROM}
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY si.created_at DESC
     LIMIT $${values.length}`,
    values
  );
}

export async function loadSalesInvoice(id, query = sql) {
  const rows = await query(`SELECT ${INVOICE_SELECT} ${INVOICE_FROM} WHERE si.id = $1`, [id]);
  return rows[0] || null;
}

/** Salespeople see the invoices they raised or are credited with; everyone else sees all. */
export function canViewInvoice(appUser, invoice) {
  if (normalizeStockRole(appUser?.role) !== 'salesperson') return true;
  const me = Number(appUser.id);
  return Number(invoice.salesperson_user_id) === me || Number(invoice.created_by_user_id) === me;
}

/** Who the invoice is from: frozen at approval, the live business before it. */
export async function sellerFor(invoice) {
  if (invoice.seller_snapshot) return invoice.seller_snapshot;
  const rows = await sql('SELECT * FROM stock_businesses WHERE id = $1', [invoice.business_id]);
  return {
    business: rows[0] ? serializeBusiness(rows[0]) : null,
    location: { name: invoice.location_name, address: invoice.location_address },
  };
}
