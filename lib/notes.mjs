// Credit/debit note rules. Pure — no db/session imports — so the API and
// lib/notes.test.mjs agree on numbering and caps.
import { computeInvoiceTotals, formatInvoiceNumber, lineQty } from './gst-invoice.mjs';

// The reasons GSTR-1 / the e-invoice schema distinguish, in our words.
export const NOTE_REASONS = ['sales_return', 'post_sale_discount', 'rate_correction', 'deficiency', 'other'];
// Reasons where goods (or a shortfall of them) are being credited: these use
// up the original quantity. Price reasons only use up value.
const QTY_REASONS = new Set(['sales_return', 'deficiency']);

// A customer debit note only adds value: a price raised after invoicing.
export const CUSTOMER_DEBIT_REASONS = ['rate_correction', 'other'];

/**
 * 'HM', 'credit', '26-27', 1 → 'HMC/26-27/0001'; customer debit → 'HMD/…'.
 * Within GST's 16 characters for a ≤4-character prefix. A supplier debit
 * note is our own claim, not a GST document (the supplier issues that), so it
 * has its own series: 'HMPD/…'.
 */
export function formatNoteNumber(prefix, kind, fiscalYear, seq, partyKind = 'customer') {
  const letter = partyKind === 'supplier' ? 'PD' : kind === 'debit' ? 'D' : 'C';
  return formatInvoiceNumber(`${prefix}${letter}`, fiscalYear, seq);
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

/**
 * Per original line, what earlier notes already took: { qty (returns and
 * shortfalls), returned (goods sent back only), taxable (all reasons) }.
 */
export function creditedSoFar(invoiceItems, earlier) {
  const used = invoiceItems.map(() => ({ qty: 0, returned: 0, taxable: 0 }));
  for (const note of earlier) {
    for (const item of note.items || []) {
      const slot = used[item.lineIndex];
      if (!slot) continue;
      if (QTY_REASONS.has(note.reason)) slot.qty = round3(slot.qty + lineQty(item));
      if (note.reason === 'sales_return') slot.returned = round3(slot.returned + lineQty(item));
      slot.taxable = round2(slot.taxable + round2(lineQty(item) * Number(item.ratePerUnit)));
    }
  }
  return used;
}

/**
 * A note that takes value off the original document — a credit note on a
 * sales invoice, or a debit note on a purchase. Requested lines
 * [{ lineIndex, qty, rate }] → the note's item snapshot and totals, refusing
 * anything the original does not cover. `earlier` are the live (pending or
 * approved) notes of the same kind on the same document, as
 * [{ reason, items, grand_total }].
 *
 * Caps, per original line: rate ≤ the billed rate; value (all reasons) ≤ the
 * line's value; quantity (returns and shortfalls) ≤ the billed quantity; goods
 * returned ≤ `receivedQty` when the line has one (a purchase). And the notes
 * together ≤ the document's total.
 */
export function prepareCreditNote({ invoiceItems, sellerState, buyerState, invoiceTotal, lines, earlier = [], reason }) {
  if (!NOTE_REASONS.includes(reason)) throw bad('Pick a reason for the note.');
  const wanted = (Array.isArray(lines) ? lines : []).filter((line) => Number(line?.qty) > 0);
  if (!wanted.length) throw bad('Enter a quantity on at least one line.');

  const used = creditedSoFar(invoiceItems, earlier);

  const seen = new Set();
  const items = wanted.map((line) => {
    const index = Number(line.lineIndex);
    const original = invoiceItems[index];
    if (!original || seen.has(index)) throw bad('A note line does not match the original document.');
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
    if (reason === 'sales_return' && original.receivedQty != null && round3(used[index].returned + qty) > original.receivedQty) {
      throw bad(`${label}: only ${round3(original.receivedQty - used[index].returned)} received is left to send back.`);
    }
    const billedTaxable = round2(billedQty * billedRate);
    if (round2(used[index].taxable + round2(qty * rate)) > billedTaxable) {
      throw bad(`${label}: only ₹${round2(billedTaxable - used[index].taxable)} of its value is left to credit after earlier notes.`);
    }
    return snapshot(original, qty, rate, index);
  });

  const totals = computeInvoiceTotals(items, sellerState, buyerState);
  const earlierTotal = earlier.reduce((sum, note) => sum + Number(note.grand_total || 0), 0);
  // Each note and the original round to the rupee, so allow their round-off
  // (≤ ₹0.50 each); the per-line caps above are what stop real over-crediting.
  if (round2(earlierTotal + totals.grandTotal) > round2(invoiceTotal) + 0.5 * (earlier.length + 1)) {
    throw bad(`Notes would total more than the original's ₹${round2(invoiceTotal)}.`);
  }
  return { items, totals };
}

/** The stored line: the original's, with the note's quantity and rate (bookkeeping fields dropped). */
function snapshot(original, qty, rate, lineIndex) {
  const { receivedQty, ...line } = withQtyRate(original, qty, rate);
  return { ...line, lineIndex };
}

/**
 * A customer debit note: a price raised after the invoice. Lines carry the
 * billed quantity (or less) at the extra rate per unit; no value cap, since it
 * adds to what is owed.
 */
export function prepareCustomerDebitNote({ invoiceItems, sellerState, buyerState, lines, reason }) {
  if (!CUSTOMER_DEBIT_REASONS.includes(reason)) throw bad('A debit note to a customer is for a rate correction or other increase.');
  const wanted = (Array.isArray(lines) ? lines : []).filter((line) => Number(line?.qty) > 0);
  if (!wanted.length) throw bad('Enter a quantity on at least one line.');
  const seen = new Set();
  const items = wanted.map((line) => {
    const index = Number(line.lineIndex);
    const original = invoiceItems[index];
    if (!original || seen.has(index)) throw bad('A note line does not match the original document.');
    seen.add(index);
    const qty = original.itemCategory === 'stone' ? round3(line.qty) : Number(line.qty);
    if (original.itemCategory !== 'stone' && !Number.isInteger(qty)) throw bad(`Quantity for ${original.itemLabel} must be a whole number.`);
    if (qty > lineQty(original)) throw bad(`${original.itemLabel}: ${qty} is more than the ${lineQty(original)} billed.`);
    const rate = round2(line.rate);
    if (!(rate > 0)) throw bad(`Enter the extra rate per unit for ${original.itemLabel}.`);
    return snapshot(original, qty, rate, index);
  });
  return { items, totals: computeInvoiceTotals(items, sellerState, buyerState) };
}

/**
 * Purchase lines → invoice-shaped lines a debit note can be cut from. The
 * billed quantity is what the supplier billed (ordered boxes/bags; sqft for
 * stone), the rate is the line's share of the bill before GST — line
 * discount, shipment discount and the fuel/handling percentages folded in, the
 * same cascade as computeInboundTotals — and receivedQty caps goods sent back.
 * Without ITC (supplier has no GSTIN) the GST is part of the rate and the
 * line carries 0% tax, so nothing is reversed out of input tax.
 *
 * items: stock_inbound_shipment_items joined with stock_items (sku, name, unit_of_measure).
 */
export function purchaseNoteItems({ shipment, items, claimItc }) {
  const net = items.map((item) => Math.max(0, Number(item.total_cost || 0) - Number(item.discount_amount || 0)));
  const subtotal = net.reduce((sum, value) => sum + value, 0);
  const shipmentDiscount = Math.min(Math.max(0, Number(shipment.discount_amount || 0)), subtotal);
  const gst = Number(shipment.gst_percent ?? 18);
  const factor = (subtotal > 0 ? (subtotal - shipmentDiscount) / subtotal : 0)
    * (1 + Number(shipment.fuel_cost_percent ?? 5) / 100)
    * (1 + Number(shipment.handling_cost_percent ?? 1) / 100)
    * (claimItc ? 1 : 1 + gst / 100);
  return items.map((item, index) => {
    const itemCategory = Number(item.received_qty_sqft) > 0 || item.unit_of_measure === 'sqft' ? 'stone'
      : item.unit_of_measure === 'bag' ? 'bag' : 'tile';
    const billedQty = itemCategory === 'stone' ? Number(item.received_qty_sqft) : Number(item.ordered_qty);
    const receivedQty = itemCategory === 'stone' ? Number(item.received_qty_sqft) : Number(item.received_whole_qty);
    const rate = billedQty > 0 ? round2((net[index] * factor) / billedQty) : 0;
    return {
      ...withQtyRate({ itemCategory, sellUnit: itemCategory === 'tile' ? 'box' : undefined }, billedQty, rate),
      itemId: String(item.item_id),
      itemLabel: `${item.sku} - ${item.name}`,
      hsnCode: item.hsn_code || null,
      gstRate: claimItc ? gst : 0,
      receivedQty,
    };
  });
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
