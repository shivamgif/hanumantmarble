// Server side of credit and debit notes, shared by /api/stock/notes and
// /api/stock/notes/[id]. Rules (numbering, caps) live in lib/notes.mjs.
//
// Three kinds, one table:
//   credit / customer  against a sales invoice — takes value off it
//   debit  / customer  against a sales invoice — a price raised after it
//   debit  / supplier  against a purchase — goods sent back or a claim on the bill
import { sql } from '@/lib/db';
import { booksStarted, createVoucher, ensurePartyLedger, systemLedgers } from '@/lib/accounts-db';
import { creditNoteLines, salesInvoiceLines, supplierDebitNoteLines } from '@/lib/accounts.mjs';
import { computeInvoiceTotals, lineQty } from '@/lib/gst-invoice.mjs';
import { prepareCreditNote, prepareCustomerDebitNote, purchaseNoteItems } from '@/lib/notes.mjs';

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// note_date_text / original_date_text: a DATE read back as a JS Date can print
// a day early in some zones; the text form is the stored IST date.
const NOTE_SELECT = `
  SELECT n.*, n.note_date::text AS note_date_text, n.original_date::text AS original_date_text,
         COALESCE(si.bill_to_name, sup.name) AS party_name,
         si.salesperson_user_id, si.created_by_user_id AS invoice_created_by_user_id,
         cb.name AS created_by_name, ab.name AS approved_by_name, os.shipment_number
  FROM acc_notes n
  LEFT JOIN stock_sales_invoices si ON si.id = n.sales_invoice_id
  LEFT JOIN stock_suppliers sup ON sup.id = n.supplier_id
  LEFT JOIN stock_app_users cb ON cb.id = n.created_by_user_id
  LEFT JOIN stock_app_users ab ON ab.id = n.approved_by_user_id
  LEFT JOIN stock_outbound_shipments os ON os.id = n.outbound_shipment_id`;

/** Newest first, one page. Each row carries total_count: the matches across all pages. */
export async function listNotes({ status = null, salesInvoiceId = null, partyKind = null, search = '', limit = 100, offset = 0 } = {}) {
  const filters = [];
  const values = [];
  if (status === 'needs_irn') filters.push("n.status = 'approved' AND n.einvoice_status = 'pending'");
  else if (status) { values.push(status); filters.push(`n.status = $${values.length}`); }
  if (salesInvoiceId) { values.push(salesInvoiceId); filters.push(`n.sales_invoice_id = $${values.length}`); }
  if (partyKind) { values.push(partyKind); filters.push(`n.party_kind = $${values.length}`); }
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(n.note_number ILIKE $${values.length} OR n.original_number ILIKE $${values.length}
      OR COALESCE(si.bill_to_name, sup.name) ILIKE $${values.length})`);
  }
  values.push(limit, offset);
  // NOTE_SELECT starts with SELECT; the window count rides along as one more column.
  return sql(
    `${NOTE_SELECT.replace('SELECT n.*,', 'SELECT n.*, COUNT(*) OVER () AS total_count,')}
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY n.created_at DESC, n.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
}

export async function loadNote(id, query = sql) {
  return (await query(`${NOTE_SELECT} WHERE n.id = $1`, [id]))[0] || null;
}

/**
 * The document a note adjusts, in one shape for both sides:
 * { partyKind, id, number, date, items, sellerState, buyerState, total,
 *   partyId, partyName, businessId, locationId, issued, status, row }.
 * `lock` takes the row lock that serialises notes on one document.
 */
export async function loadOriginal(tx, { salesInvoiceId = null, inboundShipmentId = null }, { lock = false } = {}) {
  if (salesInvoiceId) {
    const [invoice] = await tx(
      `SELECT *, invoice_date::text AS invoice_date_text FROM stock_sales_invoices WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [Number(salesInvoiceId) || 0]
    );
    if (!invoice) throw fail('Invoice not found', 404);
    return {
      partyKind: 'customer',
      id: Number(invoice.id),
      number: invoice.invoice_number,
      date: invoice.invoice_date_text,
      items: invoice.items,
      sellerState: invoice.seller_snapshot?.business?.stateCode,
      buyerState: invoice.bill_to_state_code,
      total: Number(invoice.grand_total),
      partyId: invoice.customer_id,
      partyName: invoice.bill_to_name,
      businessId: invoice.business_id,
      locationId: invoice.location_id,
      issued: invoice.status === 'approved',
      status: invoice.status,
      row: invoice,
    };
  }
  const [shipment] = await tx(
    `SELECT s.*, l.business_id, b.state_code AS business_state, sup.name AS supplier_name, sup.gst_number AS supplier_gstin,
            COALESCE(s.invoice_date::date, s.arrival_date::date)::text AS doc_date
     FROM stock_inbound_shipments s
     LEFT JOIN stock_locations l ON l.id = s.destination_location_id
     LEFT JOIN stock_businesses b ON b.id = l.business_id
     LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
     WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`,
    [Number(inboundShipmentId) || 0]
  );
  if (!shipment) throw fail('Purchase not found', 404);
  const items = await tx(
    `SELECT isi.*, i.sku, i.name, i.unit_of_measure
     FROM stock_inbound_shipment_items isi JOIN stock_items i ON i.id = isi.item_id
     WHERE isi.inbound_shipment_id = $1 ORDER BY isi.id`,
    [shipment.id]
  );
  const claimItc = Boolean(shipment.supplier_gstin);
  return {
    partyKind: 'supplier',
    id: Number(shipment.id),
    // The supplier's bill number, as the purchase voucher's bill reference has it.
    number: shipment.invoice_number || shipment.shipment_number,
    date: shipment.doc_date,
    items: purchaseNoteItems({ shipment, items, claimItc }),
    sellerState: shipment.business_state,
    buyerState: claimItc ? String(shipment.supplier_gstin).slice(0, 2) : shipment.business_state,
    total: Number(shipment.grand_total),
    partyId: shipment.supplier_id,
    partyName: shipment.supplier_name,
    businessId: shipment.business_id,
    locationId: shipment.destination_location_id,
    issued: shipment.approval_status === 'approved' && Boolean(shipment.supplier_id) && Boolean(shipment.business_id),
    status: shipment.approval_status,
    row: shipment,
  };
}

const ORIGINAL_COLUMN = { customer: 'sales_invoice_id', supplier: 'inbound_shipment_id' };

/** Live (pending or approved) notes of one kind on a document, other than `excludeNoteId`. */
export const liveNotes = (tx, original, kind, excludeNoteId = 0) => tx(
  `SELECT reason, items, grand_total FROM acc_notes
   WHERE ${ORIGINAL_COLUMN[original.partyKind]} = $1 AND kind = $2 AND status IN ('pending', 'approved') AND id <> $3`,
  [original.id, kind, excludeNoteId]
);

/**
 * Validate requested lines against the original and its other live notes.
 * Run on create and again on approval, under the original's row lock, so two
 * notes cannot both take the last of a line. Everything except a customer
 * debit note takes value off the original, under the same caps.
 */
export async function prepareNote(tx, original, { kind, reason, lines, excludeNoteId = 0 }) {
  const args = { invoiceItems: original.items, sellerState: original.sellerState, buyerState: original.buyerState, lines, reason };
  if (kind === 'debit' && original.partyKind === 'customer') return prepareCustomerDebitNote(args);
  return prepareCreditNote({ ...args, invoiceTotal: original.total, earlier: await liveNotes(tx, original, kind, excludeNoteId) });
}

/** A note's own items back as request lines, for re-checking on approval. */
export const noteLines = (note) => note.items.map((item) => ({ lineIndex: item.lineIndex, qty: lineQty(item), rate: item.ratePerUnit }));

/**
 * Post an approved note inside its approval transaction (once the business's
 * books have started). `date` is the note's date as 'YYYY-MM-DD' text.
 */
export async function postNote(tx, note, original, date, appUser) {
  const [business] = await tx('SELECT books_start_date::text AS books_start_date FROM stock_businesses WHERE id = $1', [note.business_id]);
  if (!booksStarted(business.books_start_date, date)) return null;
  if (!original.partyId) throw new Error(`The ${original.partyKind}'s record is missing, so there is no ledger to post against.`);

  const partyLedgerId = await ensurePartyLedger(tx, note.business_id, original.partyKind, original.partyId);
  const ledgers = await systemLedgers(tx, note.business_id);
  const totals = computeInvoiceTotals(note.items, original.sellerState, original.buyerState);
  const common = { totals, partyLedgerId, ledgers, locationId: original.locationId };
  const lines = note.kind === 'credit'
    ? creditNoteLines({ ...common, invoiceNumber: original.number })
    : original.partyKind === 'customer'
      // A raised price is a new amount owed, billed as the note itself.
      ? salesInvoiceLines({ ...common, billRef: note.note_number, billDate: date })
      : supplierDebitNoteLines({ ...common, billRef: original.number });
  return createVoucher(tx, {
    businessId: note.business_id,
    type: note.kind === 'credit' ? 'credit_note' : 'debit_note',
    date,
    reference: original.number,
    narration: `${note.kind === 'credit' ? 'Credit' : 'Debit'} note ${note.note_number} to ${original.partyName} against ${original.number}`,
    lines,
    partyLedgerId,
    sourceTable: 'acc_notes',
    sourceId: note.id,
    createdBy: note.created_by_user_id ?? null,
    approvedBy: appUser?.id ?? null,
    voucherNumber: note.note_number,
  });
}

/**
 * Goods on a supplier debit note leave stock on approval ('out') and come
 * back if the note is cancelled ('in'). Refuses to take stock below zero.
 * Same movement rows as a dispatch return.
 */
export async function moveReturnedGoods(tx, note, direction, appUser) {
  if (note.party_kind !== 'supplier' || note.reason !== 'sales_return') return;
  const sign = direction === 'out' ? -1 : 1;
  for (const item of note.items) {
    const stone = item.itemCategory === 'stone';
    const qty = lineQty(item);
    const column = stone ? 'current_sqft' : 'current_whole_qty';
    const [moved] = await tx(
      `UPDATE stock_items SET ${column} = ${column} + $1, updated_at = NOW()
       WHERE id = $2 AND ${column} + $1 >= 0 RETURNING id`,
      [sign * qty, item.itemId]
    );
    if (!moved) throw fail(`Not enough ${item.itemLabel} in stock to send ${qty} back.`, 409);
    await tx(
      `INSERT INTO stock_movements (movement_number, movement_type, direction, item_id, quantity, quantity_sqft, tile_condition,
         source_type, source_id, reference_number, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'whole', 'debit_note', $7, $8, $9, $10)`,
      [
        `MOV-DN-${note.id}-${item.lineIndex}-${direction.toUpperCase()}-${Date.now()}`,
        direction === 'out' ? 'return_out' : 'return_in',
        direction,
        item.itemId,
        stone ? 0 : qty,
        stone ? qty : 0,
        note.id,
        note.note_number,
        direction === 'out' ? `Sent back to supplier on debit note ${note.note_number}` : `Debit note ${note.note_number} cancelled`,
        appUser?.email || null,
      ]
    );
  }
  await tx('UPDATE acc_notes SET restock_done = $1 WHERE id = $2', [direction === 'out', note.id]);
}
