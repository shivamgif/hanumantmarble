import { NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { getRoleFlags, recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { accountsError, cancelSourceVoucher, postCreditNote, withBooks } from '@/lib/accounts-db';
import { istToday } from '@/lib/attendance.mjs';
import { fiscalYearOf } from '@/lib/gst-invoice.mjs';
import { formatNoteNumber } from '@/lib/notes.mjs';
import { loadNote, noteLines, prepareForInvoice } from '@/lib/notes-db';
import { canViewInvoice, loadSalesInvoice, salesInvoiceGuard, sellerFor } from '@/lib/sales-invoices';

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** Salespeople see notes on invoices they can see, or that they raised. */
const canViewNote = (appUser, note) =>
  Number(note.created_by_user_id) === Number(appUser.id)
  || canViewInvoice(appUser, { salesperson_user_id: note.salesperson_user_id, created_by_user_id: note.invoice_created_by_user_id });

/** The note with its invoice and seller, for the print page. */
export const GET = stockRoute(async function GET(request, context) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  try {
    const note = await loadNote(Number((await context.params).id));
    if (!note || !canViewNote(gate.appUser, note)) throw fail('Credit note not found', 404);
    const invoice = await loadSalesInvoice(note.sales_invoice_id);
    return NextResponse.json({ note, invoice, seller: await sellerFor(invoice) });
  } catch (error) {
    return accountsError(error, 'Failed to load credit note');
  }
});

/**
 * Approval numbers the note in its own series (gap-free per business, kind and
 * year, like invoices), posts its voucher and queues it for an IRN, all in
 * one transaction. Caps are checked again under the invoice's lock.
 */
async function approve(noteId, appUser) {
  const { hasAccounts } = await getStockSchemaCapabilities();
  return withBooks(appUser, async (tx) => {
    const [note] = await tx('SELECT * FROM acc_notes WHERE id = $1 FOR UPDATE', [noteId]);
    if (note.status !== 'pending') throw fail(`Only a pending credit note can be approved (this one is ${note.status}).`, 409);
    const [invoice] = await tx('SELECT * FROM stock_sales_invoices WHERE id = $1 FOR UPDATE', [note.sales_invoice_id]);
    if (invoice.status !== 'approved') throw fail(`Invoice ${note.original_number} is ${invoice.status}.`, 409);
    const [business] = await tx('SELECT * FROM stock_businesses WHERE id = $1', [note.business_id]);

    const { items, totals } = await prepareForInvoice(tx, invoice, { reason: note.reason, lines: noteLines(note), excludeNoteId: note.id });
    const noteDate = istToday();
    const fiscalYear = fiscalYearOf(noteDate);
    await tx('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`acc_note_seq:${business.id}:${note.kind}:${fiscalYear}`]);
    const [{ next_seq: seq }] = await tx(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM acc_notes WHERE business_id = $1 AND kind = $2 AND fiscal_year = $3`,
      [business.id, note.kind, fiscalYear]
    );
    const [approved] = await tx(
      `UPDATE acc_notes
          SET status = 'approved', note_date = $1, fiscal_year = $2, seq = $3, note_number = $4,
              items = $5, taxable_total = $6, cgst = $7, sgst = $8, igst = $9, grand_total = $10,
              einvoice_status = $11, approved_by_user_id = $12, approved_at = NOW(), updated_at = NOW()
        WHERE id = $13 RETURNING *`,
      [
        noteDate, fiscalYear, seq, formatNoteNumber(business.invoice_prefix, note.kind, fiscalYear, seq),
        JSON.stringify(items), totals.taxableTotal, totals.cgst, totals.sgst, totals.igst, totals.grandTotal,
        // A B2B credit note needs its own IRN, like the invoice it adjusts.
        business.einvoice_enabled !== false && invoice.bill_to_gstin ? 'pending' : 'not_required',
        appUser.id, note.id,
      ]
    );
    if (hasAccounts) await postCreditNote(tx, approved, invoice, noteDate, appUser);
    return approved;
  });
}

export const PATCH = stockRoute(async function PATCH(request, context) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;
  const isApprover = getRoleFlags(appUser.role).canApprove;

  try {
    const noteId = Number((await context.params).id);
    const body = await request.json().catch(() => ({}));
    const current = await loadNote(noteId);
    if (!current || !canViewNote(appUser, current)) throw fail('Credit note not found', 404);

    // No self-approval: whoever raised the note, or sold the invoice, needs
    // another approver (the invoice's own rule).
    const me = Number(appUser.id);
    const isOwn = [current.created_by_user_id, current.salesperson_user_id].map(Number).includes(me);
    const forbidden = (message = 'Another approver must review a credit note you raised or on your own sale.') =>
      NextResponse.json({ error: message }, { status: 403 });

    let note;
    let summary;
    if (body.action === 'approve') {
      if (!isApprover) return forbidden('Forbidden');
      if (isOwn) return forbidden();
      note = await approve(noteId, appUser);
      summary = `Credit note ${note.note_number} of ₹${note.grand_total} issued against ${note.original_number}`;
    } else if (body.action === 'reject') {
      if (!isApprover) return forbidden('Forbidden');
      if (isOwn) return forbidden();
      const reason = String(body.reason || '').trim().slice(0, 1000);
      if (!reason) throw fail('Give a reason for rejecting', 400);
      [note] = await withBooks(appUser, (tx) => tx(
        `UPDATE acc_notes SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'pending' RETURNING *`,
        [reason, noteId]
      ));
      summary = `Credit note against ${current.original_number} rejected: ${reason}`;
    } else if (body.action === 'cancel') {
      // Pending: the maker withdraws it or an approver drops it. Approved: only
      // another approver voids it; its number stays used, so no gap.
      const canCancel = current.status === 'pending'
        ? Number(current.created_by_user_id) === me || isApprover
        : current.status === 'approved' && isApprover && !isOwn;
      if (!canCancel) return forbidden('You cannot cancel this credit note');
      note = await withBooks(appUser, async (tx) => {
        const [row] = await tx(
          `UPDATE acc_notes
              SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $2, updated_at = NOW(),
                  einvoice_status = CASE WHEN einvoice_status = 'generated' THEN 'cancelled' ELSE einvoice_status END
            WHERE id = $1 AND status IN ('pending', 'approved') RETURNING *`,
          [noteId, appUser.id]
        );
        if (row) await cancelSourceVoucher(tx, 'acc_notes', noteId, appUser.id);
        return row;
      });
      summary = `${current.note_number || 'Credit note'} against ${current.original_number} cancelled`
        + (current.irn ? '. Cancel its IRN on the e-invoice portal too (allowed within 24 hours of generation).' : '');
    } else {
      throw fail('Unknown action', 400);
    }
    if (!note) throw fail('The credit note changed while you were looking at it. Reload and try again.', 409);

    try {
      await withTransaction(() => recordTimelineEvent({
        eventType: 'other',
        entityType: 'sales_invoice',
        entityId: current.sales_invoice_id,
        summary,
        details: { noteId, action: body.action },
        userId: appUser.id,
      }));
    } catch (sideEffectError) {
      console.error('Failed to log credit note action:', sideEffectError);
    }
    return NextResponse.json({ note, message: summary });
  } catch (error) {
    return accountsError(error, 'Failed to update credit note');
  }
});
