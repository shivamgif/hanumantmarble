import { NextResponse } from 'next/server';
import {
  canSell,
  collectNotificationRecipients,
  findOrCreateCustomer,
  getRoleFlags,
  normalizeStockRole,
  normalizeText,
  queueNotification,
  recordTimelineEvent,
} from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { sellerFilter } from '@/lib/stock-analytics-sql.mjs';
import { computeInvoiceTotals, DEFAULT_GST_RATE, GST_STATES, isValidGstin } from '@/lib/gst-invoice.mjs';
import { listSalesInvoices, salesInvoiceGuard } from '@/lib/sales-invoices';

// Slabs GST has used for goods; anything else is a typo.
const GST_RATES = new Set([0, 0.25, 3, 5, 12, 18, 28, 40]);

const MAX_ITEMS = 200;
const MAX_TEXT = 1000;

// Addresses keep their line breaks; normalizeText would fold them into one line.
const multiline = (value) => String(value ?? '').trim().slice(0, MAX_TEXT) || null;

function badRequest(message) {
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
       (SELECT isi.hsn_code FROM stock_inbound_shipment_items isi
          WHERE isi.item_id = i.id AND isi.hsn_code IS NOT NULL
          ORDER BY isi.id DESC LIMIT 1) AS hsn_code
     FROM stock_items i
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
    };
  });
}

export async function GET(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;

  try {
    const { searchParams } = new URL(request.url);
    const invoices = await listSalesInvoices({
      status: searchParams.get('status') || null,
      ownerUserId: normalizeStockRole(appUser.role) === 'salesperson' ? Number(appUser.id) : null,
    });
    return NextResponse.json({ invoices });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load invoices', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { session, appUser } = gate;

  if (!canSell(appUser) && !getRoleFlags(appUser.role).canApprove) {
    return NextResponse.json({ error: 'Only sellers can raise estimates' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const locationRows = await sql(
      `SELECT l.id, l.business_id, b.state_code, b.is_active AS business_active
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
    const items = await resolveItems(body.items, seller);
    const totals = computeInvoiceTotals(items, location.state_code, billToStateCode);
    const customer = await findOrCreateCustomer(billToName, body.customerPhoneNumber);

    const rows = await sql(
      `INSERT INTO stock_sales_invoices (
         location_id, business_id, customer_id,
         bill_to_name, bill_to_phone, bill_to_address, bill_to_gstin, bill_to_state_code, ship_to_address,
         salesperson_user_id, items, taxable_total, cgst, sgst, igst, grand_total, notes, created_by_user_id,
         bill_to_city, bill_to_pincode, ship_to_pincode
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        location.id,
        location.business_id,
        customer?.customer_id || null,
        billToName,
        normalizeText(body.customerPhoneNumber) || null,
        multiline(body.billToAddress),
        billToGstin,
        billToStateCode,
        multiline(body.shipToAddress),
        seller.id,
        JSON.stringify(items),
        totals.taxableTotal,
        totals.cgst,
        totals.sgst,
        totals.igst,
        totals.grandTotal,
        multiline(body.notes),
        appUser.id,
        billToCity,
        billToPincode,
        shipToPincode,
      ]
    );
    const invoice = rows[0];

    try {
      const divisionIds = [...new Set(items.map((item) => item.divisionId))];
      await queueNotification({
        channel: 'whatsapp',
        eventType: 'other',
        messageText: `New estimate from ${seller.name} for ${billToName}: ₹${totals.grandTotal}. Review and approve to issue the invoice.`,
        recipients: await collectNotificationRecipients(divisionIds),
        sourceTable: 'stock_sales_invoices',
        sourceId: invoice.id,
        createdBy: session.user.email,
      });
      await recordTimelineEvent({
        eventType: 'other',
        entityType: 'sales_invoice',
        entityId: invoice.id,
        summary: `Estimate for ${billToName} submitted for approval`,
        details: { grandTotal: totals.grandTotal, salespersonUserId: seller.id },
        userId: appUser.id,
      });
    } catch (sideEffectError) {
      console.error('Failed to notify about new estimate:', sideEffectError);
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status === 500) console.error('Failed to create estimate:', error);
    return NextResponse.json(
      { error: status === 500 ? 'Failed to save estimate' : error.message, detail: error.message },
      { status }
    );
  }
}
