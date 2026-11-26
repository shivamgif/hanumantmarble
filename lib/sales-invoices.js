// Server-side reads shared by /api/stock/sales-invoices and the dispatch route
// that consumes a scanned invoice. Arithmetic lives in lib/gst-invoice.mjs.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  canSell,
  ensureDatabaseAvailable,
  findOrCreateCustomer,
  getStockContext,
  hasAnyStockRole,
  normalizeStockRole,
  normalizeText,
} from '@/lib/stock-workflow';
import { sellerFilter } from '@/lib/stock-analytics-sql.mjs';
import { CARTAGE_SAC, computeInvoiceTotals, DEFAULT_GST_RATE, GST_STATES, isValidGstin, serializeBusiness } from '@/lib/gst-invoice.mjs';

// Slabs GST has used for goods; anything else is a typo.
const GST_RATES = new Set([0, 0.25, 3, 5, 12, 18, 28, 40]);

const MAX_ITEMS = 200;
const MAX_TEXT = 1000;

// Addresses keep their line breaks; normalizeText would fold them into one line.
const multiline = (value) => String(value ?? '').trim().slice(0, MAX_TEXT) || null;

export function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

/** The seller the sale is credited to: a salesperson always credits themselves. */
async function resolveSeller(appUser, body) {
  const schemaCaps = await getStockSchemaCapabilities();
  const sellerId = normalizeStockRole(appUser.role) === 'salesperson'
    ? Number(appUser.id)
    : Number(body.salespersonUserId || (canSell(appUser) ? appUser.id : 0));
  if (!sellerId) throw badRequest('Select a salesperson from the list.');

  const rows = await sql(
    `SELECT u.id, u.name,
       ARRAY_AGG(ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL) AS division_ids
     FROM stock_app_users u
     LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
     WHERE u.id = $1 AND ${sellerFilter(schemaCaps, 'u')} AND u.status = 'active'
     GROUP BY u.id`,
    [sellerId]
  );
  if (!rows[0]) throw badRequest('Selected salesperson is invalid or inactive.');
  return { id: Number(rows[0].id), name: rows[0].name, divisionIds: (rows[0].division_ids || []).map(Number) };
}

/**
 * Client rows → the stored item snapshot, in the dispatch form's row shape so
 * the QR prefill is a straight copy. Category, label and HSN default come from
 * the database, not the client.
 */
async function resolveItems(rawItems, seller) {
  const rows = (Array.isArray(rawItems) ? rawItems : []).filter((row) => Number(row?.itemId) > 0);
  if (rows.length === 0) throw badRequest('Add at least one item.');
  if (rows.length > MAX_ITEMS) throw badRequest(`An estimate can have at most ${MAX_ITEMS} items.`);

  const stockRows = await sql(
    `SELECT i.id, i.sku, i.name, i.unit_of_measure, i.division_id, i.pieces_per_box,
       t.unit_label, t.uqc,
       (SELECT isi.hsn_code FROM stock_inbound_shipment_items isi
          WHERE isi.item_id = i.id AND isi.hsn_code IS NOT NULL
          ORDER BY isi.id DESC LIMIT 1) AS hsn_code
     FROM stock_items i
     LEFT JOIN stock_types t ON t.id = i.type_id
     WHERE i.id = ANY($1::bigint[])`,
    [rows.map((row) => Number(row.itemId))]
  );
  const byId = new Map(stockRows.map((row) => [Number(row.id), row]));

  return rows.map((row) => {
    const stock = byId.get(Number(row.itemId));
    if (!stock) throw badRequest(`Item ${row.itemId} not found.`);
    // Dispatch validates the same rule; failing here stops an invoice that could never ship.
    if (!seller.divisionIds.includes(Number(stock.division_id))) {
      throw badRequest(`${stock.sku} is not in a division assigned to ${seller.name}.`);
    }

    const itemCategory = stock.unit_of_measure === 'sqft' ? 'stone' : stock.unit_of_measure === 'bag' ? 'bag' : 'tile';
    const qty = Number(itemCategory === 'stone' ? row.qtySqft : itemCategory === 'bag' ? row.qtyBags : row.loadedWholeQty);
    if (!(qty > 0)) throw badRequest(`Enter a quantity for ${stock.sku}.`);
    if (itemCategory !== 'stone' && !Number.isInteger(qty)) throw badRequest(`Quantity for ${stock.sku} must be a whole number.`);

    const ratePerUnit = Number(row.ratePerUnit);
    if (!(ratePerUnit > 0)) throw badRequest(`Enter a rate for ${stock.sku}.`);

    const gstRate = row.gstRate === '' || row.gstRate == null ? DEFAULT_GST_RATE : Number(row.gstRate);
    if (!GST_RATES.has(gstRate)) throw badRequest(`GST rate for ${stock.sku} must be one of ${[...GST_RATES].join(', ')}%.`);

    const hsnCode = normalizeText(row.hsnCode) || normalizeText(stock.hsn_code);
    // 6 digits minimum: required on every tax invoice once turnover exceeds ₹5 crore.
    if (!/^\d{6,8}$/.test(hsnCode || '')) throw badRequest(`Enter a 6–8 digit HSN code for ${stock.sku}.`);

    const sellUnit = itemCategory === 'bag' ? 'bag' : itemCategory === 'stone' ? 'sqft'
      : (row.sellUnit === 'piece' && Number(stock.pieces_per_box) > 1 ? 'piece' : 'box');

    return {
      itemId: String(stock.id),
      itemLabel: `${stock.sku} - ${stock.name}`,
      itemCategory,
      sellUnit,
      loadedWholeQty: itemCategory === 'tile' ? qty : 0,
      qtyBags: itemCategory === 'bag' ? qty : 0,
      qtySqft: itemCategory === 'stone' ? qty : 0,
      ratePerUnit,
      gstRate,
      hsnCode,
      divisionId: Number(stock.division_id),
      // Saved into the invoice snapshot, so a later change to the type never
      // rewrites an issued invoice. Absent = "bag" / BAG, as before.
      ...(itemCategory === 'bag' && stock.unit_label ? { unitLabel: stock.unit_label } : {}),
      ...(itemCategory === 'bag' && stock.uqc ? { uqc: stock.uqc } : {}),
    };
  });
}

const MAX_CHARGES = 10;

/**
 * Optional charges billed with the goods (cartage, loading) → charge lines
 * appended to the items, so every total, the books and the returns include
 * them. See isCharge in lib/gst-invoice.mjs.
 */
function resolveCharges(rawCharges) {
  const rows = (Array.isArray(rawCharges) ? rawCharges : [])
    .filter((row) => normalizeText(row?.label) || Number(row?.amount) > 0);
  if (rows.length > MAX_CHARGES) throw badRequest(`An estimate can have at most ${MAX_CHARGES} charges.`);
  return rows.map((row) => {
    const label = normalizeText(row.label).slice(0, 100);
    if (!label) throw badRequest('Name each charge, e.g. Cartage.');
    const amount = Math.round(Number(row.amount) * 100) / 100;
    if (!(amount > 0)) throw badRequest(`Enter an amount for ${label}.`);
    const gstRate = row.gstRate === '' || row.gstRate == null ? DEFAULT_GST_RATE : Number(row.gstRate);
    if (!GST_RATES.has(gstRate)) throw badRequest(`GST rate for ${label} must be one of ${[...GST_RATES].join(', ')}%.`);
    const sac = normalizeText(row.sacCode) || CARTAGE_SAC;
    if (!/^99\d{4}$/.test(sac)) throw badRequest(`SAC for ${label} is 6 digits starting with 99, e.g. ${CARTAGE_SAC}.`);
    return { itemCategory: 'charge', itemId: '', itemLabel: label, hsnCode: sac, ratePerUnit: amount, gstRate };
  });
}

/**
 * The estimate form's body → validated stock_sales_invoices columns, totals
 * included. Raising an estimate and an approver's correction of one both come
 * through here, so they can never disagree on what is valid.
 * `names` carries the branch and salesperson names for the edit's change log.
 */
export async function readEstimate(body, appUser) {
  const locationRows = await sql(
    `SELECT l.id, l.name, l.business_id, b.state_code, b.is_active AS business_active
     FROM stock_locations l
     LEFT JOIN stock_businesses b ON b.id = l.business_id
     WHERE l.id = $1 AND l.is_active`,
    [Number(body.locationId) || 0]
  );
  const location = locationRows[0];
  if (!location) throw badRequest('Select the branch this sale is made from.');
  if (!location.business_id || !location.business_active) {
    throw badRequest('That branch has no active business (GSTIN). Assign one in Branches.');
  }

  const billToName = normalizeText(body.customerName).slice(0, 200);
  if (!billToName) throw badRequest('Customer name is required.');
  const billToStateCode = normalizeText(body.billToStateCode);
  if (!GST_STATES[billToStateCode]) throw badRequest('Select the customer’s state (place of supply).');
  const billToGstin = normalizeText(body.billToGstin)?.toUpperCase() || null;
  if (billToGstin && !isValidGstin(billToGstin, billToStateCode)) {
    throw badRequest('Customer GSTIN must be 15 characters and start with their state code.');
  }

  // City and PIN go on every invoice: the e-invoice and e-way bill portals
  // reject an address without them, and an issued invoice cannot be edited.
  const billToCity = normalizeText(body.billToCity).slice(0, 50);
  if (billToCity.length < 3) throw badRequest('Enter the customer’s city.');
  const billToPincode = normalizeText(body.billToPincode);
  if (!/^[1-9]\d{5}$/.test(billToPincode)) throw badRequest('Enter the customer’s 6-digit PIN code.');
  const shipToPincode = normalizeText(body.shipToPincode) || null;
  if (shipToPincode && !/^[1-9]\d{5}$/.test(shipToPincode)) throw badRequest('Delivery PIN code must be 6 digits.');

  const seller = await resolveSeller(appUser, body);
  const items = [...await resolveItems(body.items, seller), ...resolveCharges(body.charges)];
  const totals = computeInvoiceTotals(items, location.state_code, billToStateCode);
  const customer = await findOrCreateCustomer(billToName, body.customerPhoneNumber, { id: body.customerId });

  return {
    seller,
    totals,
    names: { location_name: location.name, salesperson_name: seller.name },
    row: {
      location_id: location.id,
      business_id: location.business_id,
      customer_id: customer?.customer_id || null,
      bill_to_name: billToName,
      bill_to_phone: normalizeText(body.customerPhoneNumber) || null,
      bill_to_address: multiline(body.billToAddress),
      bill_to_gstin: billToGstin,
      bill_to_state_code: billToStateCode,
      ship_to_address: multiline(body.shipToAddress),
      salesperson_user_id: seller.id,
      items,
      taxable_total: totals.taxableTotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      grand_total: totals.grandTotal,
      notes: multiline(body.notes),
      bill_to_city: billToCity,
      bill_to_pincode: billToPincode,
      ship_to_pincode: shipToPincode,
      // Internal: who sent the customer. Never printed on the customer's copy.
      referred_by_name: normalizeText(body.referredByName).slice(0, 100) || null,
      referred_by_phone: normalizeText(body.referredByPhone).slice(0, 20) || null,
    },
  };
}

/** A row's column names and values for INSERT / UPDATE; items go in as JSON. */
export function estimateSql(row) {
  const keys = Object.keys(row);
  return { keys, values: keys.map((key) => (key === 'items' ? JSON.stringify(row[key]) : row[key])) };
}

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

/** Credit / debit notes are accounting: the invoice guard, minus salespeople. */
export async function notesGuard(request) {
  const gate = await salesInvoiceGuard(request);
  if (!gate.error && normalizeStockRole(gate.appUser.role) === 'salesperson') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return gate;
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
           sos.approval_status AS dispatch_approval_status,
           COALESCE(sos.truck_license_plate_snapshot, sos.truck_number_snapshot) AS dispatch_vehicle_number
    FROM stock_outbound_shipments sos
    WHERE sos.sales_invoice_id = si.id AND sos.approval_status <> 'rejected'
    ORDER BY sos.id DESC
    LIMIT 1
  ) d ON TRUE`;

// invoice_date_text: a DATE comes back as a JS Date at server midnight, which
// prints as the previous day in some zones. The text form is the IST date as stored.
// salesperson_phone: users.phone is NOT NULL, so some rows hold 'Not provided'.
const INVOICE_SELECT = `si.*, si.invoice_date::text AS invoice_date_text,
  si.proforma_date::text AS proforma_date_text, si.proforma_valid_until::text AS proforma_valid_until_text,
  l.name AS location_name, l.address AS location_address,
  sp.name AS salesperson_name, CASE WHEN sp.phone ~ '\\d' THEN sp.phone END AS salesperson_phone, cb.name AS created_by_name, ab.name AS approved_by_name,
  d.dispatch_id, d.dispatch_number, d.dispatch_approval_status, d.dispatch_vehicle_number`;

/** Newest first, one page. Each row carries total_count: the matches across all pages. */
export async function listSalesInvoices({ status = null, ownerUserId = null, search = '', limit = 100, offset = 0 } = {}) {
  const filters = [];
  const values = [];
  if (status === 'dispatched') {
    filters.push('d.dispatch_id IS NOT NULL');
  } else if (status === 'needs_irn') {
    filters.push("si.status = 'approved' AND si.einvoice_status = 'pending'");
  } else if (status) {
    values.push(status);
    filters.push(`si.status = $${values.length}`);
  }
  if (ownerUserId) {
    values.push(ownerUserId);
    filters.push(`(si.salesperson_user_id = $${values.length} OR si.created_by_user_id = $${values.length})`);
  }
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(si.invoice_number ILIKE $${values.length} OR si.bill_to_name ILIKE $${values.length}
      OR si.proforma_number ILIKE $${values.length} OR si.referred_by_name ILIKE $${values.length} OR si.id::text = $${values.length + 1})`);
    values.push(search);
  }
  values.push(limit, offset);
  return sql(
    `SELECT ${INVOICE_SELECT}, COUNT(*) OVER () AS total_count ${INVOICE_FROM}
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY si.created_at DESC, si.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
}

export async function loadSalesInvoice(id, query = sql) {
  const rows = await query(`SELECT ${INVOICE_SELECT} ${INVOICE_FROM} WHERE si.id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Salespeople see the invoices they raised or are credited with. Stock
 * maintainers see issued invoices only: the one whose QR they scan to dispatch,
 * or one they shipped. Everyone else sees all.
 */
export function canViewInvoice(appUser, invoice) {
  const role = normalizeStockRole(appUser?.role);
  if (role === 'stock_maintainer') return invoice.status === 'approved';
  if (role !== 'salesperson') return true;
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
