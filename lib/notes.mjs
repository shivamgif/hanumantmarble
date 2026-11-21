// Credit/debit note rules. Pure — no db/session imports — so the API and
// lib/notes.test.mjs agree on numbering and caps.
import { computeInvoiceTotals, formatInvoiceNumber, lineQty } from './gst-invoice.mjs';

// The reasons GSTR-1 / the e-invoice schema distinguish, in our words.
export const NOTE_REASONS = ['sales_return', 'post_sale_discount', 'rate_correction', 'deficiency', 'other'];
// Reasons where goods (or a shortfall of them) are being credited: these use
// up the original quantity. Price reasons only use up value.
const QTY_REASONS = new Set(['sales_return', 'deficiency']);

/** 'HM', 'credit', '26-27', 1 → 'HMC/26-27/0001'. Within GST's 16 characters for a ≤4-character prefix. */
export function formatNoteNumber(prefix, kind, fiscalYear, seq) {
  return formatInvoiceNumber(`${prefix}${kind === 'debit' ? 'D' : 'C'}`, fiscalYear, seq);
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** A copy of an invoice line carrying another quantity and rate. */
export function withQtyRate(row, qty, rate) {
  return {
    ...row,
    loadedWholeQty: row.itemCategory === 'tile' ? qty : 0,
    qtyBags: row.itemCategory === 'bag' ? qty : 0,
    qtySqft: row.itemCategory === 'stone' ? qty : 0,
    ratePerUnit: rate,
  };
}

/** Per invoice line, what earlier notes already credited: { qty (returns and shortfalls), taxable (all) }. */
export function creditedSoFar(invoiceItems, earlier) {
  const used = invoiceItems.map(() => ({ qty: 0, taxable: 0 }));
  for (const note of earlier) {
    for (const item of note.items || []) {
      const slot = used[item.lineIndex];
      if (!slot) continue;
      if (QTY_REASONS.has(note.reason)) slot.qty = round3(slot.qty + lineQty(item));
      slot.taxable = round2(slot.taxable + round2(lineQty(item) * Number(item.ratePerUnit)));
    }
  }
  return used;
}

/**
 * Requested lines [{ lineIndex, qty, rate }] → the note's item snapshot and
 * totals, refusing anything the original invoice does not cover. `earlier` are
 * the live (pending or approved) credit notes on the same invoice, as
 * [{ reason, items, grand_total }].
 *
 * Caps, per invoice line: rate ≤ the billed rate; credited value (all
 * reasons) ≤ the line's value; credited quantity (returns and shortfalls) ≤
 * the billed quantity. And the notes together ≤ the invoice total.
 */
export function prepareCreditNote({ invoiceItems, sellerState, buyerState, invoiceTotal, lines, earlier = [], reason }) {
  if (!NOTE_REASONS.includes(reason)) throw bad('Pick a reason for the credit note.');
  const wanted = (Array.isArray(lines) ? lines : []).filter((line) => Number(line?.qty) > 0);
  if (!wanted.length) throw bad('Enter a quantity on at least one line.');

  const used = creditedSoFar(invoiceItems, earlier);

  const seen = new Set();
  const items = wanted.map((line) => {
    const index = Number(line.lineIndex);
    const original = invoiceItems[index];
    if (!original || seen.has(index)) throw bad('A credit note line does not match the invoice.');
    seen.add(index);
    const label = original.itemLabel;
    const qty = original.itemCategory === 'stone' ? round3(line.qty) : Number(line.qty);
    if (original.itemCategory !== 'stone' && !Number.isInteger(qty)) throw bad(`Quantity for ${label} must be a whole number.`);
    const billedQty = lineQty(original);
    const billedRate = Number(original.ratePerUnit);
    const rate = line.rate === '' || line.rate == null ? billedRate : round2(line.rate);
    if (!(rate > 0) || rate > billedRate) throw bad(`Rate for ${label} must be more than 0 and at most the billed ₹${billedRate}.`);
    if (qty > billedQty) throw bad(`${label}: ${qty} is more than the ${billedQty} billed.`);
    if (QTY_REASONS.has(reason) && round3(used[index].qty + qty) > billedQty) {
      throw bad(`${label}: only ${round3(billedQty - used[index].qty)} is left to credit after earlier notes.`);
    }
    const billedTaxable = round2(billedQty * billedRate);
    if (round2(used[index].taxable + round2(qty * rate)) > billedTaxable) {
      throw bad(`${label}: only ₹${round2(billedTaxable - used[index].taxable)} of its value is left to credit after earlier notes.`);
    }
    return { ...withQtyRate(original, qty, rate), lineIndex: index };
  });

  const totals = computeInvoiceTotals(items, sellerState, buyerState);
  const earlierTotal = earlier.reduce((sum, note) => sum + Number(note.grand_total || 0), 0);
  if (round2(earlierTotal + totals.grandTotal) > round2(invoiceTotal)) {
    throw bad(`Credit notes would total more than the invoice's ₹${round2(invoiceTotal)}.`);
  }
  return { items, totals };
}

/** A note as the invoice-shaped row buildEinvoiceJson takes: its own number, date and items, plus the invoice it adjusts. */
export function noteEinvoiceDoc(note, invoice) {
  return {
    ...invoice,
    id: note.id,
    items: note.items,
    invoice_number: note.note_number,
    invoice_date_text: note.note_date_text,
    docType: note.kind === 'debit' ? 'DBN' : 'CRN',
    precedingDoc: { number: invoice.invoice_number, date: invoice.invoice_date_text },
  };
}
