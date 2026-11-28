import { sql, withTransaction } from '@/lib/db';
import { NextResponse } from 'next/server';
import { approverUserIds, getRoleFlags, notifyUsers, recordTimelineEvent, resolveSourceNotifications, stockRoute } from '@/lib/stock-workflow';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { cancelSourceVoucher, ensurePartyLedger, postSalesInvoice, withBooks } from '@/lib/accounts-db';
import { istToday } from '@/lib/attendance.mjs';
import {
  computeInvoiceTotals,
  estimateChanges,
  fiscalYearOf,
  formatInvoiceNumber,
  formatProformaNumber,
  PLACEHOLDER_GSTIN,
  PROFORMA_VALIDITY_DAYS,
  serializeBusiness,
} from '@/lib/gst-invoice.mjs';
import {
  badRequest,
  canViewInvoice,
  estimateSql,
  loadSalesInvoice,
  readEstimate,
  salesInvoiceGuard,
  sellerFor,
} from '@/lib/sales-invoices';

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export const GET = stockRoute(async function GET(request, context) {
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
});

/**
 * Numbering: gap-free per business per financial year, as GST requires. The
 * advisory lock serialises approvals in one series so two admins approving at
 * once cannot both read the same MAX; UNIQUE(business_id, fiscal_year,
 * invoice_seq) is the backstop. Totals are recomputed here because the
 * business's state may have been corrected since the estimate was raised.
 */
async function approve(invoiceId, appUser, { acknowledgeCreditLimit = false } = {}) {
  const { hasAccounts } = await getStockSchemaCapabilities();
  return withBooks(appUser, async (tx) => {
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

    if (hasAccounts) {
      // Credit limit: warn before taking the customer past it. The approver can
      // go ahead after confirming (acknowledgeCreditLimit).
      if (invoice.customer_id && !acknowledgeCreditLimit) {
        const ledgerId = await ensurePartyLedger(tx, business.id, 'customer', invoice.customer_id);
        const [party] = await tx(
          `SELECT l.name, l.credit_limit,
                  COALESCE((SELECT SUM(vl.amount) FROM acc_voucher_lines vl
                            JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
                            WHERE vl.ledger_id = l.id), 0) AS balance
           FROM acc_ledgers l WHERE l.id = $1`,
          [ledgerId]
        );
        const limit = Number(party.credit_limit);
        const after = Number(party.balance) + totals.grandTotal;
        if (limit > 0 && after > limit) {
          throw Object.assign(
            new Error(`${party.name} would owe ₹${after.toLocaleString('en-IN')} against a credit limit of ₹${limit.toLocaleString('en-IN')}.`),
            { statusCode: 409, code: 'credit_limit' }
          );
        }
      }
      // Issued and booked together: once the books have started, an invoice
      // never exists without its sales entry.
      await postSalesInvoice(tx, rows[0], invoiceDate, appUser);
    }
    return { invoice: rows[0], idempotent: false };
  });
}

export const PATCH = stockRoute(async function PATCH(request, context) {
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
    let changes;

    // An estimate that never went out as a numbered proforma is not a document
    // anyone holds: cancelling or rejecting it deletes it. The audit trigger
    // keeps the deleted row and the timeline keeps who did it and why. A
    // proforma's number must stay in its gap-free series, so that one is only
    // marked cancelled / rejected.
    const deletable = current.status === 'pending' && !current.proforma_number;
    const deleteEstimate = () => withBooks(appUser, async (tx) => (await tx(
      `DELETE FROM stock_sales_invoices
        WHERE id = $1 AND status = 'pending' AND proforma_number IS NULL
          AND NOT EXISTS (SELECT 1 FROM stock_outbound_shipments WHERE sales_invoice_id = $1)
        RETURNING *`,
      [invoiceId]
    ))[0]);

    if (body.action === 'update') {
      // The seller fixes their own estimate until a proforma goes out; an
      // approver corrects anyone's before approving. Same validation as raising one.
      if (current.status !== 'pending') throw conflict('Only a pending estimate can be edited.');
      const mine = Number(current.created_by_user_id) === me;
      if (!isApprover && !(mine && !current.proforma_number)) {
        return NextResponse.json({ error: 'You cannot edit this estimate' }, { status: 403 });
      }
      const { row, names } = await readEstimate(body, appUser);
      if (current.proforma_number && Number(row.business_id) !== Number(current.business_id)) {
        throw conflict(`Proforma ${current.proforma_number} was issued under another business. Pick a branch of the same business, or cancel and raise a new estimate.`);
      }
      changes = estimateChanges(current, { ...row, ...names });
      if (!changes.length) return NextResponse.json({ invoice: current, message: 'Nothing changed.' });
      const { keys, values } = estimateSql(row);
      const idParam = `$${keys.length + 1}`;
      invoice = (await withBooks(appUser, (tx) => tx(
        `UPDATE stock_sales_invoices
            SET ${keys.map((key, i) => `${key} = $${i + 1}`).join(', ')},
                proforma_rev = proforma_rev + (proforma_number IS NOT NULL)::int, updated_at = NOW()
          WHERE id = ${idParam} AND status = 'pending'
            AND NOT EXISTS (SELECT 1 FROM stock_outbound_shipments
                            WHERE sales_invoice_id = ${idParam} AND approval_status <> 'rejected')
          RETURNING *`,
        [...values, invoiceId]
      )))[0];
      summary = `${current.proforma_number || 'Estimate'} for ${row.bill_to_name} corrected: ${changes.join('; ')}`;
    } else if (body.action === 'proforma') {
      // An offer for bulk / advance orders: numbered, printable with bank details,
      // but no tax invoice and nothing in the books. Issuing again only moves its validity.
      if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const today = istToday();
      const validUntil = body.validUntil ? String(body.validUntil) : null;
      if (validUntil && !(/^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil >= today)) {
        throw badRequest('Valid until must be today or a later date.');
      }
      invoice = await withBooks(appUser, async (tx) => {
        const [row] = await tx('SELECT * FROM stock_sales_invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
        if (row.status !== 'pending') throw conflict('A proforma can only be issued for a pending estimate.');
        const returning = 'RETURNING *, proforma_valid_until::text AS valid_until_text';
        if (row.proforma_number) {
          return (await tx(
            `UPDATE stock_sales_invoices SET proforma_valid_until = COALESCE($1::date, $2::date + $3::int), updated_at = NOW()
              WHERE id = $4 ${returning}`,
            [validUntil, today, PROFORMA_VALIDITY_DAYS, invoiceId]
          ))[0];
        }
        const [business] = await tx('SELECT id, gstin, state_code, invoice_prefix FROM stock_businesses WHERE id = $1', [row.business_id]);
        if (business.gstin === PLACEHOLDER_GSTIN) {
          throw conflict('Enter the business’s real GSTIN in Branches before issuing a proforma.');
        }
        const fiscalYear = fiscalYearOf(today);
        await tx('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`proforma_seq:${business.id}:${fiscalYear}`]);
        const [{ next_seq: seq }] = await tx(
          `SELECT COALESCE(MAX(proforma_seq), 0) + 1 AS next_seq
           FROM stock_sales_invoices WHERE business_id = $1 AND proforma_fiscal_year = $2`,
          [business.id, fiscalYear]
        );
        // Totals as the customer will see them: the business's state may have been corrected since the estimate was saved.
        const totals = computeInvoiceTotals(row.items, business.state_code, row.bill_to_state_code);
        return (await tx(
          `UPDATE stock_sales_invoices
              SET proforma_number = $1, proforma_fiscal_year = $2, proforma_seq = $3, proforma_date = $4,
                  proforma_valid_until = COALESCE($5::date, $4::date + $6::int),
                  taxable_total = $8, cgst = $9, sgst = $10, igst = $11, grand_total = $12, updated_at = NOW()
            WHERE id = $7 ${returning}`,
          [
            formatProformaNumber(business.invoice_prefix, fiscalYear, seq), fiscalYear, seq, today, validUntil,
            PROFORMA_VALIDITY_DAYS, invoiceId,
            totals.taxableTotal, totals.cgst, totals.sgst, totals.igst, totals.grandTotal,
          ]
        ))[0];
      });
      summary = current.proforma_number
        ? `Proforma ${invoice.proforma_number} for ${current.bill_to_name} now valid until ${invoice.valid_until_text}`
        : `Proforma ${invoice.proforma_number} issued to ${current.bill_to_name}, valid until ${invoice.valid_until_text}`;
    } else if (body.action === 'approve') {
      if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (isOwn) return ownError();
      const result = await approve(invoiceId, appUser, { acknowledgeCreditLimit: body.acknowledgeCreditLimit === true });
      invoice = result.invoice;
      if (result.idempotent) return NextResponse.json({ invoice, idempotent: true });
      summary = `Invoice ${invoice.invoice_number} issued to ${invoice.bill_to_name}`;
    } else if (body.action === 'reject') {
      if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (isOwn) return ownError();
      const reason = String(body.reason || '').trim().slice(0, 1000);
      if (!reason) return NextResponse.json({ error: 'Give a reason for rejecting' }, { status: 400 });
      if (current.status !== 'pending') throw conflict('Only a pending estimate can be rejected.');
      if (deletable) {
        invoice = await deleteEstimate();
        summary = `Estimate #${invoiceId} for ${current.bill_to_name} rejected and deleted: ${reason}`;
      } else {
        invoice = (await withBooks(appUser, (tx) => tx(
          `UPDATE stock_sales_invoices SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
            WHERE id = $2 AND status = 'pending' RETURNING *`,
          [reason, invoiceId]
        )))[0];
        summary = `${current.proforma_number || 'Estimate'} for ${current.bill_to_name} rejected: ${reason}`;
      }
    } else if (body.action === 'cancel') {
      // The seller withdraws their own pending estimate; an approver may also
      // void an issued invoice that never shipped. Its number stays used, so
      // the series has no gap.
      const isOwnPending = current.status === 'pending' && Number(current.created_by_user_id) === me;
      const canCancel = isOwnPending || (isApprover && !isOwn && ['pending', 'approved'].includes(current.status));
      if (!canCancel) return NextResponse.json({ error: 'You cannot cancel this invoice' }, { status: 403 });
      const liveNotes = await sql(
        `SELECT 1 FROM acc_notes WHERE sales_invoice_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
        [invoiceId]
      );
      if (liveNotes.length) throw conflict('This invoice has credit notes. Cancel them first.');
      const { hasAccounts } = await getStockSchemaCapabilities();
      if (deletable) invoice = await deleteEstimate();
      else invoice = await withBooks(appUser, async (tx) => {
        const [row] = await tx(
          `UPDATE stock_sales_invoices
              SET status = 'cancelled', updated_at = NOW(),
                  einvoice_status = CASE WHEN einvoice_status = 'generated' THEN 'cancelled' ELSE einvoice_status END
            WHERE id = $1 AND status IN ('pending', 'approved')
              AND NOT EXISTS (SELECT 1 FROM stock_outbound_shipments
                              WHERE sales_invoice_id = $1 AND approval_status <> 'rejected')
            RETURNING *`,
          [invoiceId]
        );
        // The sales entry goes with the invoice.
        if (row && hasAccounts) await cancelSourceVoucher(tx, 'stock_sales_invoices', invoiceId, appUser.id);
        return row;
      });
      summary = deletable
        ? `Estimate #${invoiceId} for ${current.bill_to_name} cancelled and deleted`
        : `${current.invoice_number || current.proforma_number || 'Estimate'} for ${current.bill_to_name} cancelled`
        + (current.irn ? '. Cancel its IRN on the e-invoice portal too (allowed within 24 hours of generation).' : '');
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (!invoice) throw conflict('The invoice changed while you were looking at it. Reload and try again.');
    const deleted = deletable && ['reject', 'cancel'].includes(body.action);

    try {
      await withTransaction(async () => {
        await recordTimelineEvent({
          eventType: 'other',
          entityType: 'sales_invoice',
          entityId: invoiceId,
          summary,
          details: { action: body.action, status: invoice.status, ...(deleted ? { deleted: true } : {}), ...(changes ? { changes } : {}) },
          userId: appUser.id,
        });
      });
      // The seller acting on their own estimate tells the approvers (an edit
      // refreshes their open entry; withdrawing it just clears it). Anyone
      // else acting tells the seller. A decision clears the approvers' entries.
      if (deleted || ['approve', 'reject', 'cancel'].includes(body.action)) {
        await resolveSourceNotifications('stock_sales_invoices', invoiceId);
      }
      const userIds = isOwn
        ? (body.action === 'update' ? await approverUserIds() : [])
        : [current.salesperson_user_id, current.created_by_user_id];
      await notifyUsers({
        userIds,
        actorId: appUser.id,
        eventType: 'other',
        messageText: summary,
        sourceTable: 'stock_sales_invoices',
        // A deleted estimate has no page left to open.
        sourceId: deleted ? null : invoiceId,
        createdBy: session.user.email,
      });
    } catch (sideEffectError) {
      console.error('Failed to log invoice action:', sideEffectError);
    }

    return NextResponse.json({ invoice: deleted ? null : invoice, deleted, message: summary });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status === 500) console.error('Failed to update invoice:', error);
    return NextResponse.json(
      { error: status === 500 ? 'Failed to update invoice' : error.message, code: error.code, detail: error.message },
      { status }
    );
  }
});
