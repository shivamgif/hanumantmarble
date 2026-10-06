import { NextResponse } from 'next/server';
import { getRoleFlags, queueNotification, recordTimelineEvent } from '@/lib/stock-workflow';
import { withTransaction } from '@/lib/db';
import { istToday } from '@/lib/attendance.mjs';
import {
  computeInvoiceTotals,
  fiscalYearOf,
  formatInvoiceNumber,
  PLACEHOLDER_GSTIN,
  serializeBusiness,
} from '@/lib/gst-invoice.mjs';
import { canViewInvoice, loadSalesInvoice, salesInvoiceGuard, sellerFor } from '@/lib/sales-invoices';

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export async function GET(request, context) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;

  try {
    const { id } = await context.params;
    const invoice = await loadSalesInvoice(Number(id));
    if (!invoice || !canViewInvoice(gate.appUser, invoice)) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ invoice, seller: await sellerFor(invoice) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load invoice', detail: error.message }, { status: 500 });
  }
}

/**
 * Numbering: gap-free per business per financial year, as GST requires. The
 * advisory lock serialises approvals in one series so two admins approving at
 * once cannot both read the same MAX; UNIQUE(business_id, fiscal_year,
 * invoice_seq) is the backstop. Totals are recomputed here because the
 * business's state may have been corrected since the estimate was raised.
 */
async function approve(invoiceId, appUser) {
  return withTransaction(async (tx) => {
    const invoice = (await tx('SELECT * FROM stock_sales_invoices WHERE id = $1 FOR UPDATE', [invoiceId]))[0];
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    if (invoice.status === 'approved') return { invoice, idempotent: true };
    if (invoice.status !== 'pending') throw conflict(`Only a pending estimate can be approved (this one is ${invoice.status}).`);

    const business = (await tx('SELECT * FROM stock_businesses WHERE id = $1', [invoice.business_id]))[0];
    if (!business?.is_active) throw conflict('This branch’s business is inactive. Assign an active business in Branches.');
    if (business.gstin === PLACEHOLDER_GSTIN) {
      throw conflict('Enter the business’s real GSTIN in Branches before issuing invoices.');
    }
    const location = (await tx('SELECT name, address FROM stock_locations WHERE id = $1', [invoice.location_id]))[0];

    const invoiceDate = istToday();
    const fiscalYear = fiscalYearOf(invoiceDate);
    await tx('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`sales_invoice_seq:${business.id}:${fiscalYear}`]);
    const [{ next_seq: seq }] = await tx(
      `SELECT COALESCE(MAX(invoice_seq), 0) + 1 AS next_seq
       FROM stock_sales_invoices WHERE business_id = $1 AND fiscal_year = $2`,
      [business.id, fiscalYear]
    );

    const totals = computeInvoiceTotals(invoice.items, business.state_code, invoice.bill_to_state_code);
    const rows = await tx(
      `UPDATE stock_sales_invoices
          SET status = 'approved', invoice_number = $1, fiscal_year = $2, invoice_seq = $3, invoice_date = $4,
              seller_snapshot = $5, taxable_total = $6, cgst = $7, sgst = $8, igst = $9, grand_total = $10,
              approved_by_user_id = $11, approved_at = NOW(), updated_at = NOW(),
              einvoice_status = $13
        WHERE id = $12
        RETURNING *`,
      [
        formatInvoiceNumber(business.invoice_prefix, fiscalYear, seq),
        fiscalYear,
        seq,
        invoiceDate,
        JSON.stringify({ business: serializeBusiness(business), location }),
        totals.taxableTotal,
        totals.cgst,
        totals.sgst,
        totals.igst,
        totals.grandTotal,
        appUser.id,
        invoiceId,
        // Turnover above ₹5 crore: a B2B invoice is not valid until it has an IRN.
        business.einvoice_enabled !== false && invoice.bill_to_gstin ? 'pending' : 'not_required',
      ]
    );
    return { invoice: rows[0], idempotent: false };
  });
}

export async function PATCH(request, context) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { session, appUser } = gate;
  const isApprover = getRoleFlags(appUser.role).canApprove;

  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const body = await request.json().catch(() => ({}));
    const current = await loadSalesInvoice(invoiceId);
    if (!current || !canViewInvoice(appUser, current)) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (current.dispatch_id) throw conflict(`Already dispatched as ${current.dispatch_number}.`);

    // No self-approval: a seller who is also an approver needs someone else to
    // review what they raised or are credited with.
    const me = Number(appUser.id);
    const isOwn = Number(current.created_by_user_id) === me || Number(current.salesperson_user_id) === me;
    const ownError = () => NextResponse.json({ error: 'Another approver must review an estimate you raised or sold.' }, { status: 403 });

    let invoice;
    let summary;

    if (body.action === 'approve') {
      if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (isOwn) return ownError();
      const result = await approve(invoiceId, appUser);
      invoice = result.invoice;
      if (result.idempotent) return NextResponse.json({ invoice, idempotent: true });
      summary = `Invoice ${invoice.invoice_number} issued to ${invoice.bill_to_name}`;
    } else if (body.action === 'reject') {
      if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (isOwn) return ownError();
      const reason = String(body.reason || '').trim().slice(0, 1000);
      if (!reason) return NextResponse.json({ error: 'Give a reason for rejecting' }, { status: 400 });
      if (current.status !== 'pending') throw conflict('Only a pending estimate can be rejected.');
      invoice = (await withTransaction((tx) => tx(
        `UPDATE stock_sales_invoices SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
          WHERE id = $2 AND status = 'pending' RETURNING *`,
        [reason, invoiceId]
      )))[0];
      summary = `Estimate for ${current.bill_to_name} rejected: ${reason}`;
    } else if (body.action === 'cancel') {
      // The seller withdraws their own pending estimate; an approver may also
      // void an issued invoice that never shipped. Its number stays used, so
      // the series has no gap.
      const isOwnPending = current.status === 'pending' && Number(current.created_by_user_id) === me;
      const canCancel = isOwnPending || (isApprover && !isOwn && ['pending', 'approved'].includes(current.status));
      if (!canCancel) return NextResponse.json({ error: 'You cannot cancel this invoice' }, { status: 403 });
      invoice = (await withTransaction((tx) => tx(
        `UPDATE stock_sales_invoices
            SET status = 'cancelled', updated_at = NOW(),
                einvoice_status = CASE WHEN einvoice_status = 'generated' THEN 'cancelled' ELSE einvoice_status END
          WHERE id = $1 AND status IN ('pending', 'approved')
            AND NOT EXISTS (SELECT 1 FROM stock_outbound_shipments
                            WHERE sales_invoice_id = $1 AND approval_status <> 'rejected')
          RETURNING *`,
        [invoiceId]
      )))[0];
      summary = `${current.invoice_number || 'Estimate'} for ${current.bill_to_name} cancelled`
        + (current.irn ? '. Cancel its IRN on the e-invoice portal too (allowed within 24 hours of generation).' : '');
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (!invoice) throw conflict('The invoice changed while you were looking at it. Reload and try again.');

    try {
      await recordTimelineEvent({
        eventType: 'other',
        entityType: 'sales_invoice',
        entityId: invoiceId,
        summary,
        details: { action: body.action, status: invoice.status },
        userId: appUser.id,
      });
      await queueNotification({
        channel: 'whatsapp',
        eventType: 'other',
        messageText: summary,
        recipients: [],
        sourceTable: 'stock_sales_invoices',
        sourceId: invoiceId,
        createdBy: session.user.email,
      });
    } catch (sideEffectError) {
      console.error('Failed to log invoice action:', sideEffectError);
    }

    return NextResponse.json({ invoice, message: summary });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status === 500) console.error('Failed to update invoice:', error);
    return NextResponse.json(
      { error: status === 500 ? 'Failed to update invoice' : error.message, detail: error.message },
      { status }
    );
  }
}
