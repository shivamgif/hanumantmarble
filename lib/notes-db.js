// Server side of credit notes, shared by /api/stock/notes and /api/stock/notes/[id].
// Rules (numbering, caps) live in lib/notes.mjs.
import { sql } from '@/lib/db';
import { lineQty } from '@/lib/gst-invoice.mjs';
import { prepareCreditNote } from '@/lib/notes.mjs';

// note_date_text / original_date_text: a DATE read back as a JS Date can print
// a day early in some zones; the text form is the stored IST date.
const NOTE_SELECT = `
  SELECT n.*, n.note_date::text AS note_date_text, n.original_date::text AS original_date_text,
         si.bill_to_name, si.salesperson_user_id, si.created_by_user_id AS invoice_created_by_user_id,
         cb.name AS created_by_name, ab.name AS approved_by_name, os.shipment_number
  FROM acc_notes n
  LEFT JOIN stock_sales_invoices si ON si.id = n.sales_invoice_id
  LEFT JOIN stock_app_users cb ON cb.id = n.created_by_user_id
  LEFT JOIN stock_app_users ab ON ab.id = n.approved_by_user_id
  LEFT JOIN stock_outbound_shipments os ON os.id = n.outbound_shipment_id`;

export async function listNotes({ status = null, salesInvoiceId = null, ownerUserId = null, limit = 100 } = {}) {
  const filters = [];
  const values = [];
  if (status === 'needs_irn') filters.push("n.status = 'approved' AND n.einvoice_status = 'pending'");
  else if (status) { values.push(status); filters.push(`n.status = $${values.length}`); }
  if (salesInvoiceId) { values.push(salesInvoiceId); filters.push(`n.sales_invoice_id = $${values.length}`); }
  if (ownerUserId) {
    values.push(ownerUserId);
    filters.push(`(si.salesperson_user_id = $${values.length} OR si.created_by_user_id = $${values.length} OR n.created_by_user_id = $${values.length})`);
  }
  values.push(limit);
  // ponytail: newest 100, no paging, same as the invoice list.
  return sql(
    `${NOTE_SELECT} ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY n.created_at DESC LIMIT $${values.length}`,
    values
  );
}

export async function loadNote(id, query = sql) {
  return (await query(`${NOTE_SELECT} WHERE n.id = $1`, [id]))[0] || null;
}

/** The seller's state on the invoice as issued (its frozen snapshot). */
export const invoiceSellerState = (invoice) => invoice.seller_snapshot?.business?.stateCode;

/** An invoice's other credit notes that still count against it (pending or approved). */
export const liveCreditNotes = (tx, invoiceId, excludeNoteId = 0) => tx(
  `SELECT reason, items, grand_total FROM acc_notes
   WHERE sales_invoice_id = $1 AND kind = 'credit' AND status IN ('pending', 'approved') AND id <> $2`,
  [invoiceId, excludeNoteId]
);

/**
 * Validate requested lines against the invoice and its other live credit
 * notes. Run on create and again on approval, under the invoice's row lock,
 * so two notes cannot both take the last of a line.
 */
export async function prepareForInvoice(tx, invoice, { reason, lines, excludeNoteId = 0 }) {
  const earlier = await liveCreditNotes(tx, invoice.id, excludeNoteId);
  return prepareCreditNote({
    invoiceItems: invoice.items,
    sellerState: invoiceSellerState(invoice),
    buyerState: invoice.bill_to_state_code,
    invoiceTotal: Number(invoice.grand_total),
    lines,
    earlier,
    reason,
  });
}

/** A note's own items back as request lines, for re-checking on approval. */
export const noteLines = (note) => note.items.map((item) => ({ lineIndex: item.lineIndex, qty: lineQty(item), rate: item.ratePerUnit }));
