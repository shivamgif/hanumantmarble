import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { buildEwbJson, EWB_NUMBER_PATTERN, needsEwayBill } from '@/lib/ewaybill.mjs';
import { loadSalesInvoice, sellerFor } from '@/lib/sales-invoices';

/**
 * E-way bill for a dispatch registered from a tax invoice.
 *   GET  → bulk-upload JSON for the e-way bill portal (truck from the dispatch).
 *   POST → { ewbNo } the 12-digit number the portal issued.
 * Stock staff may use it: they are the ones loading the truck.
 */

async function load(request, context) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) return { error: NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 }) };
  if (!(await getStockSchemaCapabilities()).hasSalesInvoices) {
    return { error: NextResponse.json({ error: 'Invoicing is not set up yet.' }, { status: 503 }) };
  }
  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer'])) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { id } = await context.params;
  const shipment = (await sql(
    `SELECT id, shipment_number, sales_invoice_id, approval_status, ewb_no, ewb_date,
            truck_license_plate_snapshot, truck_number_snapshot
     FROM stock_outbound_shipments WHERE id = $1`,
    [Number(id)]
  ))[0];
  if (!shipment) return { error: NextResponse.json({ error: 'Dispatch not found' }, { status: 404 }) };
  if (!shipment.sales_invoice_id) {
    return { error: NextResponse.json({ error: 'Only dispatches registered from an invoice have e-way bill data.' }, { status: 400 }) };
  }
  const invoice = await loadSalesInvoice(shipment.sales_invoice_id);
  const business = (await sellerFor(invoice)).business;
  return { appUser, shipment, invoice, business };
}

export async function GET(request, context) {
  const ctx = await load(request, context);
  if (ctx.error) return ctx.error;
  try {
    return NextResponse.json({
      document: buildEwbJson(ctx.shipment, ctx.invoice, ctx.business),
      required: needsEwayBill(ctx.invoice, ctx.business),
      ewbNo: ctx.shipment.ewb_no,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request, context) {
  const ctx = await load(request, context);
  if (ctx.error) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const ewbNo = String(body.ewbNo || '').replace(/\s/g, '');
  if (!EWB_NUMBER_PATTERN.test(ewbNo)) {
    return NextResponse.json({ error: 'An e-way bill number is 12 digits.' }, { status: 400 });
  }
  if (ctx.shipment.approval_status === 'rejected') {
    return NextResponse.json({ error: 'This dispatch was rejected.' }, { status: 409 });
  }

  const rows = await sql(
    `UPDATE stock_outbound_shipments SET ewb_no = $1, ewb_date = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING id, ewb_no, ewb_date`,
    [ewbNo, ctx.shipment.id]
  );
  await recordTimelineEvent({
    eventType: 'other',
    entityType: 'outbound_shipment',
    entityId: ctx.shipment.id,
    summary: `E-way bill ${ewbNo} recorded for ${ctx.shipment.shipment_number}`,
    details: { ewbNo, previous: ctx.shipment.ewb_no || null },
    userId: ctx.appUser.id,
  }).catch(() => null);
  return NextResponse.json({ shipment: rows[0] });
}
