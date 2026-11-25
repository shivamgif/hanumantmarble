import { NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/db';
import { getRoleFlags, normalizeStockRole, recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { accountsError, withBooks } from '@/lib/accounts-db';
import { lineQty, lineUnit } from '@/lib/gst-invoice.mjs';
import { creditedSoFar } from '@/lib/notes.mjs';
import { listNotes, liveNotes, loadOriginal, prepareNote } from '@/lib/notes-db';
import { canViewInvoice, notesGuard } from '@/lib/sales-invoices';

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/** Customer notes: approvers. Supplier debit notes: approvers and stock maintainers (they run purchases). Salespeople: none. */
function mayRaise(appUser, partyKind) {
  const role = normalizeStockRole(appUser.role);
  if (getRoleFlags(role).canApprove) return true;
  return partyKind === 'supplier' && role === 'stock_maintainer';
}

/** The kind a request is for: a supplier only gets debit notes. */
const kindFor = (partyKind, kind) => (partyKind === 'supplier' || kind === 'debit' ? 'debit' : 'credit');

/**
 * GET → notes, newest first (?status=)
 * GET ?invoiceId=[&kind=debit][&shipmentId] or ?purchaseId= → what the "raise
 *   a note" form needs: the original's lines with what is left to take off,
 *   prefilled with the quantities a dispatch return brought back.
 */
export const GET = stockRoute(async function GET(request) {
  const gate = await notesGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;
  const { searchParams } = new URL(request.url);
  const invoiceId = Number(searchParams.get('invoiceId')) || 0;
  const purchaseId = Number(searchParams.get('purchaseId')) || 0;

  try {
    if (!invoiceId && !purchaseId) {
      const notes = await listNotes({
        status: searchParams.get('status') || null,
        // Stock maintainers run purchases: supplier debit notes only.
        partyKind: normalizeStockRole(appUser.role) === 'stock_maintainer' ? 'supplier' : null,
      });
      return NextResponse.json({ notes });
    }

    const original = await loadOriginal(sql, { salesInvoiceId: invoiceId || null, inboundShipmentId: purchaseId || null });
    if (original.partyKind === 'customer' && !canViewInvoice(appUser, original.row)) throw fail('Invoice not found', 404);
    if (!mayRaise(appUser, original.partyKind)) throw fail('Forbidden', 403);
    const kind = kindFor(original.partyKind, searchParams.get('kind'));
    const adds = kind === 'debit' && original.partyKind === 'customer';
    const used = creditedSoFar(original.items, adds ? [] : await liveNotes(sql, original, kind));

    // Returned quantities, matched to invoice lines by item in order (the
    // dispatch ships exactly the invoice's lines).
    const returnedByItem = new Map();
    const shipmentId = Number(searchParams.get('shipmentId')) || 0;
    let shipmentNumber = null;
    if (shipmentId && original.partyKind === 'customer') {
      const rows = await sql(
        `SELECT soi.item_id, soi.returned_whole_qty, soi.returned_qty_sqft, s.shipment_number
         FROM stock_outbound_shipment_items soi
         JOIN stock_outbound_shipments s ON s.id = soi.outbound_shipment_id
         WHERE s.id = $1 AND s.sales_invoice_id = $2 AND s.approval_status = 'approved'
         ORDER BY soi.id`,
        [shipmentId, original.id]
      );
      if (!rows.length) throw fail('That dispatch is not an approved dispatch of this invoice.', 400);
      shipmentNumber = rows[0].shipment_number;
      for (const row of rows) {
        const key = String(row.item_id);
        if (!returnedByItem.has(key)) returnedByItem.set(key, []);
        returnedByItem.get(key).push(row);
      }
    }

    const lines = original.items.map((item, index) => {
      const billedQty = lineQty(item);
      const rate = Number(item.ratePerUnit);
      const leftQty = Math.max(0, round(billedQty - used[index].qty, 3));
      const returned = returnedByItem.get(String(item.itemId))?.shift();
      const returnedQty = returned
        ? Number(item.itemCategory === 'stone' ? returned.returned_qty_sqft : returned.returned_whole_qty) || 0
        : 0;
      return {
        lineIndex: index,
        itemLabel: item.itemLabel,
        itemCategory: item.itemCategory,
        unit: lineUnit(item),
        billedQty,
        rate,
        gstRate: Number(item.gstRate),
        leftQty,
        leftValue: Math.max(0, round(billedQty * rate - used[index].taxable, 2)),
        // Purchases: goods that can still go back (received, less earlier returns).
        leftToReturn: item.receivedQty == null ? null : Math.max(0, round(item.receivedQty - used[index].returned, 3)),
        prefillQty: Math.min(returnedQty, leftQty),
      };
    });
    return NextResponse.json({
      kind,
      original: {
        partyKind: original.partyKind,
        id: original.id,
        number: original.number,
        date: original.date,
        partyName: original.partyName,
        total: original.total,
        sellerState: original.sellerState,
        buyerState: original.buyerState,
        issued: original.issued,
      },
      lines,
      shipmentNumber,
    });
  } catch (error) {
    return accountsError(error, 'Failed to load notes');
  }
});

/** Raise a note against an issued invoice or an approved purchase. It waits for another approver. */
export const POST = stockRoute(async function POST(request) {
  const gate = await notesGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;

  try {
    const body = await request.json().catch(() => ({}));
    const note = await withBooks(appUser, async (tx) => {
      const original = await loadOriginal(
        tx,
        body.inboundShipmentId ? { inboundShipmentId: body.inboundShipmentId } : { salesInvoiceId: body.salesInvoiceId },
        { lock: true }
      );
      if (original.partyKind === 'customer' && !canViewInvoice(appUser, original.row)) throw fail('Invoice not found', 404);
      if (!mayRaise(appUser, original.partyKind)) throw fail('Your role cannot raise this note.', 403);
      if (!original.issued) {
        throw fail(original.partyKind === 'customer'
          ? `Only an issued invoice can get a note (this one is ${original.status}).`
          : 'Only an approved purchase with a supplier and a branch business can get a debit note.', 409);
      }
      const kind = kindFor(original.partyKind, body.kind);

      const shipmentId = original.partyKind === 'customer' ? Number(body.outboundShipmentId) || null : null;
      if (shipmentId) {
        const [shipment] = await tx('SELECT 1 FROM stock_outbound_shipments WHERE id = $1 AND sales_invoice_id = $2', [shipmentId, original.id]);
        if (!shipment) throw fail('That dispatch is not of this invoice.', 400);
      }

      const { items, totals } = await prepareNote(tx, original, { kind, reason: body.reason, lines: body.lines });
      const customer = original.partyKind === 'customer';
      const [row] = await tx(
        `INSERT INTO acc_notes (business_id, kind, party_kind, customer_id, supplier_id, sales_invoice_id, inbound_shipment_id,
           outbound_shipment_id, original_number, original_date, reason, items, taxable_total, cgst, sgst, igst, grand_total,
           notes, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [
          original.businessId, kind, original.partyKind,
          customer ? original.partyId : null, customer ? null : original.partyId,
          customer ? original.id : null, customer ? null : original.id, shipmentId,
          original.number, original.date, body.reason, JSON.stringify(items),
          totals.taxableTotal, totals.cgst, totals.sgst, totals.igst, totals.grandTotal,
          String(body.notes || '').trim().slice(0, 1000) || null, appUser.id,
        ]
      );
      return { ...row, party_name: original.partyName };
    });

    try {
      await withTransaction(() => recordTimelineEvent({
        eventType: 'other',
        entityType: note.party_kind === 'customer' ? 'sales_invoice' : 'inbound_shipment',
        entityId: note.sales_invoice_id || note.inbound_shipment_id,
        summary: `${note.kind === 'credit' ? 'Credit' : 'Debit'} note of ₹${note.grand_total} raised against ${note.original_number} for approval`,
        details: { noteId: note.id, reason: note.reason },
        userId: appUser.id,
      }));
    } catch (sideEffectError) {
      console.error('Failed to log note:', sideEffectError);
    }

    const label = note.kind === 'credit' ? 'Credit note' : 'Debit note';
    return NextResponse.json({ note, message: `${label} for ${note.party_name} sent for approval.` }, { status: 201 });
  } catch (error) {
    return accountsError(error, 'Failed to save note');
  }
});
