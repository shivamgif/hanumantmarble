import { NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/db';
import { getRoleFlags, normalizeStockRole, recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { accountsError, cancelSourceVoucher, withBooks } from '@/lib/accounts-db';
import { istToday } from '@/lib/attendance.mjs';
import { fiscalYearOf, serializeBusiness } from '@/lib/gst-invoice.mjs';
import { formatNoteNumber } from '@/lib/notes.mjs';
import { loadNote, loadOriginal, moveReturnedGoods, noteLines, postNote, prepareNote } from '@/lib/notes-db';
import { notesGuard, sellerFor } from '@/lib/sales-invoices';

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const label = (note) => `${note.kind === 'credit' ? 'Credit' : 'Debit'} note`;
const originalOf = (note) => (note.party_kind === 'customer'
  ? { salesInvoiceId: note.sales_invoice_id }
  : { inboundShipmentId: note.inbound_shipment_id });

/** Salespeople never reach here (notesGuard); stock maintainers see supplier notes only. */
const canViewNote = (appUser, note) =>
  normalizeStockRole(appUser.role) !== 'stock_maintainer' || note.party_kind === 'supplier';

/** The note with who it is from and to, for the print page. */
export const GET = stockRoute(async function GET(request, context) {
  const gate = await notesGuard(request);
  if (gate.error) return gate.error;
  try {
    const note = await loadNote(Number((await context.params).id));
    if (!note || !canViewNote(gate.appUser, note)) throw fail('Note not found', 404);
    const original = await loadOriginal(sql, originalOf(note));
    const row = original.row;
    let seller;
    let party;
    if (original.partyKind === 'customer') {
      seller = await sellerFor(row);
      party = { name: row.bill_to_name, address: row.bill_to_address, gstin: row.bill_to_gstin, stateCode: row.bill_to_state_code };
    } else {
      const [business] = await sql('SELECT * FROM stock_businesses WHERE id = $1', [note.business_id]);
      const [supplier] = await sql('SELECT name, address, gst_number FROM stock_suppliers WHERE id = $1', [note.supplier_id]);
      seller = { business: serializeBusiness(business) };
      party = { name: supplier?.name, address: supplier?.address, gstin: supplier?.gst_number, stateCode: original.buyerState };
    }
    return NextResponse.json({ note, seller, party, states: { seller: original.sellerState, buyer: original.buyerState } });
  } catch (error) {
    return accountsError(error, 'Failed to load note');
  }
});

/**
 * Approval numbers the note in its own series (gap-free per business, kind,
 * side and year, like invoices), posts its voucher, sends returned goods out
 * of stock and queues a customer note for its IRN, all in one transaction.
 * Caps are checked again under the original's lock.
 */
async function approve(noteId, appUser) {
  const { hasAccounts } = await getStockSchemaCapabilities();
  return withBooks(appUser, async (tx) => {
    const [note] = await tx('SELECT * FROM acc_notes WHERE id = $1 FOR UPDATE', [noteId]);
    if (note.status !== 'pending') throw fail(`Only a pending note can be approved (this one is ${note.status}).`, 409);
    const original = await loadOriginal(tx, originalOf(note), { lock: true });
    if (!original.issued) throw fail(`${note.original_number} is ${original.status}.`, 409);
    const [business] = await tx('SELECT * FROM stock_businesses WHERE id = $1', [note.business_id]);

    const { items, totals } = await prepareNote(tx, original, { kind: note.kind, reason: note.reason, lines: noteLines(note), excludeNoteId: note.id });
    const noteDate = istToday();
    const fiscalYear = fiscalYearOf(noteDate);
    await tx('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`acc_note_seq:${business.id}:${note.kind}:${note.party_kind}:${fiscalYear}`]);
    const [{ next_seq: seq }] = await tx(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM acc_notes
       WHERE business_id = $1 AND kind = $2 AND party_kind = $3 AND fiscal_year = $4`,
      [business.id, note.kind, note.party_kind, fiscalYear]
    );
    // A B2B customer note needs its own IRN, like the invoice it adjusts. The
    // supplier issues the GST document for a purchase.
    const needsIrn = note.party_kind === 'customer' && business.einvoice_enabled !== false && Boolean(original.row.bill_to_gstin);
    const [approved] = await tx(
      `UPDATE acc_notes
          SET status = 'approved', note_date = $1, fiscal_year = $2, seq = $3, note_number = $4,
              items = $5, taxable_total = $6, cgst = $7, sgst = $8, igst = $9, grand_total = $10,
              einvoice_status = $11, approved_by_user_id = $12, approved_at = NOW(), updated_at = NOW()
        WHERE id = $13 RETURNING *`,
      [
        noteDate, fiscalYear, seq, formatNoteNumber(business.invoice_prefix, note.kind, fiscalYear, seq, note.party_kind),
        JSON.stringify(items), totals.taxableTotal, totals.cgst, totals.sgst, totals.igst, totals.grandTotal,
        needsIrn ? 'pending' : 'not_required', appUser.id, note.id,
      ]
    );
    await moveReturnedGoods(tx, approved, 'out', appUser);
    if (hasAccounts) await postNote(tx, approved, original, noteDate, appUser);
    return approved;
  });
}

export const PATCH = stockRoute(async function PATCH(request, context) {
  const gate = await notesGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;
  const isApprover = getRoleFlags(appUser.role).canApprove;

  try {
    const noteId = Number((await context.params).id);
    const body = await request.json().catch(() => ({}));
    const current = await loadNote(noteId);
    if (!current || !canViewNote(appUser, current)) throw fail('Note not found', 404);

    // No self-approval: whoever raised the note, or sold the invoice, needs
    // another approver (the invoice's own rule).
    const me = Number(appUser.id);
    const isOwn = [current.created_by_user_id, current.salesperson_user_id].map(Number).includes(me);
    const forbidden = (message = 'Another approver must review a note you raised or on your own sale.') =>
      NextResponse.json({ error: message }, { status: 403 });

    let note;
    let summary;
    if (body.action === 'approve') {
      if (!isApprover) return forbidden('Forbidden');
      if (isOwn) return forbidden();
      note = await approve(noteId, appUser);
      summary = `${label(note)} ${note.note_number} of ₹${note.grand_total} issued against ${note.original_number}`;
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
      summary = `${label(current)} against ${current.original_number} rejected: ${reason}`;
    } else if (body.action === 'cancel') {
      // Pending: the maker withdraws it or an approver drops it. Approved: only
      // another approver voids it; its number stays used, so no gap.
      const canCancel = current.status === 'pending'
        ? Number(current.created_by_user_id) === me || isApprover
        : current.status === 'approved' && isApprover && !isOwn;
      if (!canCancel) return forbidden('You cannot cancel this note');
      note = await withBooks(appUser, async (tx) => {
        const [row] = await tx(
          `UPDATE acc_notes
              SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $2, updated_at = NOW(),
                  einvoice_status = CASE WHEN einvoice_status = 'generated' THEN 'cancelled' ELSE einvoice_status END
            WHERE id = $1 AND status IN ('pending', 'approved') RETURNING *`,
          [noteId, appUser.id]
        );
        if (!row) return row;
        await cancelSourceVoucher(tx, 'acc_notes', noteId, appUser.id);
        // Goods that went back to the supplier come back into stock.
        if (row.restock_done) await moveReturnedGoods(tx, row, 'in', appUser);
        return row;
      });
      summary = `${current.note_number || label(current)} against ${current.original_number} cancelled`
        + (current.irn ? '. Cancel its IRN on the e-invoice portal too (allowed within 24 hours of generation).' : '');
    } else {
      throw fail('Unknown action', 400);
    }
    if (!note) throw fail('The note changed while you were looking at it. Reload and try again.', 409);

    try {
      await withTransaction(() => recordTimelineEvent({
        eventType: 'other',
        entityType: current.party_kind === 'customer' ? 'sales_invoice' : 'inbound_shipment',
        entityId: current.sales_invoice_id || current.inbound_shipment_id,
        summary,
        details: { noteId, action: body.action },
        userId: appUser.id,
      }));
    } catch (sideEffectError) {
      console.error('Failed to log note action:', sideEffectError);
    }
    return NextResponse.json({ note, message: summary });
  } catch (error) {
    return accountsError(error, 'Failed to update note');
  }
});
