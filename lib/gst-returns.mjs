// GSTR-1 and GSTR-3B check figures for one GSTIN and one month. Pure — no
// db/session imports — so lib/gst-returns.test.mjs pins the rules.
//
// These are for ticking against Tally and the portal before the CA files;
// the app does not upload them. Credit notes count negative, debit notes
// positive, everywhere a total is taken.
import { computeInvoiceTotals, lineQty } from './gst-invoice.mjs';
import { lineUqc } from './einvoice.mjs';
import { purchaseLines } from './accounts.mjs';

// An inter-state invoice to an unregistered buyer above this goes in B2CL,
// invoice by invoice (₹1 lakh since 1 August 2024); below it, B2CS in aggregate.
export const B2CL_LIMIT = 100000;

const HEADS = ['taxable', 'igst', 'cgst', 'sgst'];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const zero = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
function add(into, from, sign = 1) {
  for (const key of HEADS) into[key] = r2(into[key] + sign * (Number(from[key]) || 0));
  return into;
}
const sumRows = (rows, sign = 1) => rows.reduce((acc, row) => add(acc, row, sign), zero());

/** A document's lines grouped by GST rate: [{ rate, taxable, igst, cgst, sgst }]. */
export function rateRows(items, sellerState, buyerState) {
  const totals = computeInvoiceTotals(items, sellerState, buyerState);
  const byRate = new Map();
  for (const line of totals.lines) {
    if (!byRate.has(line.gstRate)) byRate.set(line.gstRate, { rate: line.gstRate, ...zero() });
    add(byRate.get(line.gstRate), line);
  }
  return { interState: totals.interState, lines: totals.lines, rows: [...byRate.values()].sort((a, b) => a.rate - b.rate) };
}

/** 'HM/26-27/0007' → 'HM/26-27/': documents numbered in one series share it. */
const seriesOf = (number) => String(number).replace(/\d+$/, '');

/**
 * invoices: [{ number, seq, date, status, gstin, name, pos, value, irn, items }]
 * notes:    [{ kind, number, seq, date, status, gstin, name, pos, value, irn, items,
 *              originalNumber, originalDate, originalValue }] — customer notes only
 * Approved documents are reported; cancelled ones only count in the
 * documents-issued table.
 */
export function buildGstr1({ sellerState, invoices = [], notes = [] }) {
  const b2b = [];
  const b2cl = [];
  const cdnr = [];
  const cdnur = [];
  const b2cs = new Map();
  const hsn = new Map();

  const toB2cs = (pos, interState, rows, sign) => {
    for (const row of rows) {
      const key = `${pos}|${row.rate}`;
      if (!b2cs.has(key)) b2cs.set(key, { pos, rate: row.rate, supply: interState ? 'INTER' : 'INTRA', ...zero() });
      add(b2cs.get(key), row, sign);
    }
  };
  const toHsn = (doc, lines, side, sign) => {
    doc.items.forEach((item, index) => {
      const line = lines[index];
      const uqc = lineUqc(item);
      const key = `${side}|${item.hsnCode}|${line.gstRate}|${uqc}`;
      if (!hsn.has(key)) hsn.set(key, { side, hsn: item.hsnCode, rate: line.gstRate, uqc, qty: 0, ...zero() });
      const row = hsn.get(key);
      row.qty = Math.round((row.qty + sign * lineQty(item)) * 1000) / 1000;
      add(row, line, sign);
    });
  };

  for (const invoice of invoices.filter((doc) => doc.status === 'approved')) {
    const { interState, rows, lines } = rateRows(invoice.items, sellerState, invoice.pos);
    const doc = {
      number: invoice.number, date: invoice.date, gstin: invoice.gstin, name: invoice.name,
      pos: invoice.pos, value: Number(invoice.value), einvoiced: Boolean(invoice.irn), rows,
    };
    if (invoice.gstin) b2b.push(doc);
    else if (interState && Number(invoice.value) > B2CL_LIMIT) b2cl.push(doc);
    else toB2cs(invoice.pos, interState, rows, 1);
    toHsn(invoice, lines, invoice.gstin ? 'b2b' : 'b2c', 1);
  }

  for (const note of notes.filter((doc) => doc.status === 'approved')) {
    const sign = note.kind === 'credit' ? -1 : 1;
    const { interState, rows, lines } = rateRows(note.items, sellerState, note.pos);
    const doc = {
      type: note.kind === 'credit' ? 'C' : 'D', number: note.number, date: note.date, gstin: note.gstin, name: note.name,
      pos: note.pos, value: Number(note.value), einvoiced: Boolean(note.irn), rows,
      originalNumber: note.originalNumber, originalDate: note.originalDate,
    };
    if (note.gstin) cdnr.push(doc);
    // A note on a B2CL invoice is reported note by note; on any other B2C
    // invoice it just nets into B2CS.
    else if (interState && Number(note.originalValue) > B2CL_LIMIT) cdnur.push({ ...doc, noteType: 'B2CL' });
    else toB2cs(note.pos, interState, rows, sign);
    toHsn(note, lines, note.gstin ? 'b2b' : 'b2c', sign);
  }

  // Documents issued (table 13): each series' range, with cancellations.
  const docs = new Map();
  const nature = { invoice: 'Invoices for outward supply', credit: 'Credit Note', debit: 'Debit Note' };
  for (const [kind, list] of [['invoice', invoices], ...['credit', 'debit'].map((k) => [k, notes.filter((n) => n.kind === k)])]) {
    for (const doc of list) {
      if (!doc.number) continue;
      const key = `${kind}|${seriesOf(doc.number)}`;
      if (!docs.has(key)) docs.set(key, { nature: nature[kind], docs: [] });
      docs.get(key).docs.push(doc);
    }
  }
  const documents = [...docs.values()].map(({ nature: label, docs: list }) => {
    const sorted = [...list].sort((a, b) => Number(a.seq) - Number(b.seq));
    const cancelled = list.filter((doc) => doc.status === 'cancelled').length;
    return { nature: label, from: sorted[0].number, to: sorted.at(-1).number, total: list.length, cancelled, net: list.length - cancelled };
  });

  const docTotal = (list, signOf = () => 1) => list.reduce((acc, doc) => add(acc, sumRows(doc.rows), signOf(doc)), zero());
  // A row a note fully cancelled out reports nothing.
  const b2csRows = [...b2cs.values()].filter((row) => HEADS.some((key) => row[key])).sort((a, b) => String(a.pos).localeCompare(String(b.pos)) || a.rate - b.rate);
  const noteSign = (doc) => (doc.type === 'C' ? -1 : 1);
  const summary = {
    b2b: { count: b2b.length, ...docTotal(b2b) },
    b2cl: { count: b2cl.length, ...docTotal(b2cl) },
    b2cs: { count: b2csRows.length, ...sumRows(b2csRows) },
    cdnr: { count: cdnr.length, ...docTotal(cdnr, noteSign) },
    cdnur: { count: cdnur.length, ...docTotal(cdnur, noteSign) },
  };
  const total = Object.values(summary).reduce((acc, part) => add(acc, part), zero());
  const hsnRows = [...hsn.values()].sort((a, b) => a.side.localeCompare(b.side) || String(a.hsn).localeCompare(String(b.hsn)) || a.rate - b.rate);
  return { b2b, b2cl, b2cs: b2csRows, cdnr, cdnur, hsn: hsnRows, documents, summary, total };
}

/**
 * purchases:     [{ number, date, supplier, gstin, grandTotal, gstPercent }] — approved, dated in the month
 * supplierNotes: [{ number, date, supplier, gstin, items }] — approved supplier debit notes in the month
 * expenseItc:    { igst, cgst, sgst } — input tax on posted expense vouchers in the month
 */
export function buildGstr3b({ businessState, gstr1, purchases = [], supplierNotes = [], expenseItc = zero() }) {
  // 3.1: outward supplies from every GSTR-1 section, notes netted.
  const outward = zero();
  const nilRated = zero();
  const signed = [
    ...gstr1.b2b.map((doc) => [doc, 1]), ...gstr1.b2cl.map((doc) => [doc, 1]),
    ...gstr1.cdnr.map((doc) => [doc, doc.type === 'C' ? -1 : 1]), ...gstr1.cdnur.map((doc) => [doc, doc.type === 'C' ? -1 : 1]),
  ];
  for (const [doc, sign] of signed) for (const row of doc.rows) add(row.rate > 0 ? outward : nilRated, row, sign);
  for (const row of gstr1.b2cs) add(row.rate > 0 ? outward : nilRated, row);

  // 3.2: inter-state supplies to unregistered persons, by place of supply.
  const byPos = new Map();
  const toPos = (pos, row, sign) => {
    if (!byPos.has(pos)) byPos.set(pos, { pos, taxable: 0, igst: 0 });
    const entry = byPos.get(pos);
    entry.taxable = r2(entry.taxable + sign * row.taxable);
    entry.igst = r2(entry.igst + sign * row.igst);
  };
  for (const doc of gstr1.b2cl) for (const row of doc.rows) toPos(doc.pos, row, 1);
  for (const doc of gstr1.cdnur) for (const row of doc.rows) toPos(doc.pos, row, doc.type === 'C' ? -1 : 1);
  for (const row of gstr1.b2cs.filter((r) => r.supply === 'INTER')) toPos(row.pos, row, 1);

  // 4: input tax, the same split the purchase voucher posts.
  const ids = { purchases: 1, input_igst: 2, input_cgst: 3, input_sgst: 4 };
  const fromPurchases = zero();
  const noGstin = { count: 0, value: 0 };
  for (const bill of purchases) {
    if (!bill.gstin) {
      noGstin.count += 1;
      noGstin.value = r2(noGstin.value + Number(bill.grandTotal));
      continue;
    }
    const lines = purchaseLines({
      grandTotal: bill.grandTotal, gstPercent: bill.gstPercent, interState: String(bill.gstin).slice(0, 2) !== String(businessState),
      claimItc: true, partyLedgerId: 5, ledgers: ids, billRef: bill.number, billDate: bill.date,
    });
    const amount = (id) => lines.find((line) => line.ledgerId === id)?.amount || 0;
    add(fromPurchases, { taxable: amount(1), igst: amount(2), cgst: amount(3), sgst: amount(4) });
  }
  const reversals = zero();
  for (const note of supplierNotes.filter((n) => n.gstin)) {
    add(reversals, sumRows(rateRows(note.items, businessState, String(note.gstin).slice(0, 2)).rows));
  }
  const available = add(add(zero(), fromPurchases), expenseItc);
  const net = add(add(zero(), available), reversals, -1);
  const tax = (row) => ({ igst: row.igst, cgst: row.cgst, sgst: row.sgst });
  return {
    outward,
    nilRated: { taxable: nilRated.taxable },
    interStateUnregistered: [...byPos.values()].filter((e) => e.taxable || e.igst).sort((a, b) => String(a.pos).localeCompare(String(b.pos))),
    itc: { purchases: tax(fromPurchases), expenses: tax(expenseItc), available: tax(available), reversals: tax(reversals), net: tax(net) },
    purchasesWithoutGstin: noGstin,
    // Before any cross-use of IGST credit against CGST/SGST: the CA sets that off.
    payable: { igst: r2(outward.igst - net.igst), cgst: r2(outward.cgst - net.cgst), sgst: r2(outward.sgst - net.sgst) },
  };
}

/** Rows → CSV text (RFC 4180), for the per-section downloads. */
export function toCsv(columns, rows) {
  const cell = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map((c) => cell(c.label)), ...rows.map((row) => columns.map((c) => cell(typeof c.get === 'function' ? c.get(row) : row[c.get])))]
    .map((line) => line.join(','))
    .join('\n') + '\n';
}

// ─── GSTR-2B: what suppliers filed, matched against recorded purchases ───────

/** 'dd-mm-yyyy' → 'yyyy-mm-dd'; anything else unchanged. */
const isoFromPortal = (date) => {
  const m = String(date || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(date || '');
};

/**
 * The portal's GSTR-2B JSON → { gstin, period ('YYYY-MM'), rows }. Rows are
 * [{ kind: 'invoice'|'credit'|'debit', gstin, tradeName, number, date,
 * value, taxable, igst, cgst, sgst, itcAvailable }]. Accepts the download as
 * is ({ data: { gstin, rtnprd, docdata } }) or just its `data`.
 */
export function parseGstr2b(json) {
  const data = json?.data?.docdata ? json.data : json?.docdata ? json : null;
  if (!data) throw Object.assign(new Error('That is not a GSTR-2B file (no docdata in it).'), { statusCode: 400 });
  const period = /^\d{6}$/.test(String(data.rtnprd || '')) ? `${data.rtnprd.slice(2)}-${data.rtnprd.slice(0, 2)}` : null;
  const taxOf = (items = []) => items.reduce((acc, it) => add(acc, { taxable: it.txval, igst: it.igst, cgst: it.cgst, sgst: it.sgst }), zero());
  const rows = [];
  for (const supplier of data.docdata.b2b || []) {
    for (const inv of supplier.inv || []) {
      rows.push({
        kind: 'invoice', gstin: supplier.ctin, tradeName: supplier.trdnm || '', number: String(inv.inum),
        date: isoFromPortal(inv.dt), value: Number(inv.val) || 0, ...taxOf(inv.items), itcAvailable: inv.itcavl !== 'N',
      });
    }
  }
  for (const supplier of data.docdata.cdnr || []) {
    for (const note of supplier.nt || []) {
      rows.push({
        kind: note.typ === 'D' ? 'debit' : 'credit', gstin: supplier.ctin, tradeName: supplier.trdnm || '', number: String(note.ntnum),
        date: isoFromPortal(note.dt), value: Number(note.val) || 0, ...taxOf(note.items), itcAvailable: note.itcavl !== 'N',
      });
    }
  }
  return { gstin: data.gstin || null, period, rows };
}

/**
 * A supplier bill number as both sides may have typed it: case, spaces and
 * punctuation ignored, and leading zeros of every number in it ('SC/0001' = 'SC-1').
 */
export const normaliseBillNo = (number) => String(number || '').toUpperCase()
  .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ''))
  .replace(/[^A-Z0-9]/g, '');

const fyOf = (iso) => {
  const [y, m] = String(iso).split('-').map(Number);
  return m >= 4 ? y : y - 1;
};
const billKey = (gstin, number, date) => `${String(gstin).toUpperCase()}|${fyOf(date)}|${normaliseBillNo(number)}`;

/**
 * rows:            this month's 2B invoices (credit/debit notes are only totalled)
 * allRows:         every stored 2B's invoices for the business, to know what has ever appeared
 * purchases:       candidate purchases [{ id, number, date, gstin, supplierId, supplier, grandTotal }]
 * monthPurchases:  purchases dated in the month, for "in books, not in 2B"
 *
 * A bill matches on supplier GSTIN + bill number within the financial year,
 * then on value within ₹1. A 2B bill with no match is checked against
 * suppliers that have no GSTIN yet (same bill number and value) to propose one.
 */
export function matchGstr2b({ rows, allRows = rows, purchases, monthPurchases = [] }) {
  const byKey = new Map(purchases.filter((p) => p.gstin).map((p) => [billKey(p.gstin, p.number, p.date), p]));
  const noGstin = purchases.filter((p) => !p.gstin);
  const matched = [];
  const mismatched = [];
  const only2b = [];
  for (const row of rows.filter((r) => r.kind === 'invoice')) {
    const purchase = byKey.get(billKey(row.gstin, row.number, row.date));
    if (purchase) {
      const diff = r2(row.value - Number(purchase.grandTotal));
      (Math.abs(diff) <= 1 ? matched : mismatched).push({ row, purchase, diff });
      continue;
    }
    const candidate = noGstin.find((p) => fyOf(p.date) === fyOf(row.date)
      && normaliseBillNo(p.number) === normaliseBillNo(row.number) && Math.abs(Number(p.grandTotal) - row.value) <= 1);
    only2b.push({ row, proposal: candidate ? { supplierId: candidate.supplierId, supplier: candidate.supplier, gstin: row.gstin } : null });
  }
  const seen = new Set(allRows.filter((r) => r.kind === 'invoice').map((r) => billKey(r.gstin, r.number, r.date)));
  const onlyBooks = monthPurchases.filter((p) => p.gstin && !seen.has(billKey(p.gstin, p.number, p.date)));

  // ITC as the portal sees it: available invoices and debit notes, less credit notes.
  const itc = zero();
  for (const row of rows.filter((r) => r.itcAvailable)) add(itc, row, row.kind === 'credit' ? -1 : 1);
  return { matched, mismatched, only2b, onlyBooks, itc: { igst: itc.igst, cgst: itc.cgst, sgst: itc.sgst } };
}
