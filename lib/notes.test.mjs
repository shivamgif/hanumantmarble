// Run: node lib/notes.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { creditNoteLines, salesInvoiceLines, supplierDebitNoteLines, toPaise } from './accounts.mjs';
import { formatNoteNumber, prepareCreditNote, prepareCustomerDebitNote, purchaseNoteItems } from './notes.mjs';

const items = [
  { itemId: '5', itemLabel: 'GVT-6060', itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: 100, ratePerUnit: 500, gstRate: 18, hsnCode: '690721' },
  { itemId: '9', itemLabel: 'KOTA-GRN', itemCategory: 'stone', qtySqft: 120.5, ratePerUnit: 40, gstRate: 5, hsnCode: '680299' },
];
// Same state (08 → 08): CGST + SGST. Invoice total = 59,000 + 5,061 = 64,061.
const base = { invoiceItems: items, sellerState: '08', buyerState: '08', invoiceTotal: 64061 };
const fails = (args, pattern) => assert.throws(() => prepareCreditNote({ ...base, ...args }), (e) => e.statusCode === 400 && pattern.test(e.message));

// Numbering: prefix + C/D, never past GST's 16 characters for any allowed prefix (1–4 chars) and seq.
assert.equal(formatNoteNumber('HM', 'credit', '26-27', 1), 'HMC/26-27/0001');
assert.equal(formatNoteNumber('HM', 'debit', '26-27', 12), 'HMD/26-27/0012');
for (const prefix of ['A', 'AB', 'ABC', 'ABCD']) {
  for (const kind of ['credit', 'debit']) assert.ok(formatNoteNumber(prefix, kind, '99-00', 9999).length <= 16);
}

// A return: billed rate by default, copies the invoice line, keeps its index.
{
  const { items: noted, totals } = prepareCreditNote({ ...base, reason: 'sales_return', lines: [{ lineIndex: 1, qty: 20.25 }] });
  assert.equal(noted.length, 1);
  assert.equal(noted[0].lineIndex, 1);
  assert.equal(noted[0].qtySqft, 20.25);
  assert.equal(noted[0].hsnCode, '680299');
  assert.equal(totals.taxableTotal, 810);
  assert.equal(totals.cgst, 20.25);
  assert.equal(totals.grandTotal, 851); // 850.50 rounds up; 0.50 to Round Off
  assert.equal(totals.roundOff, 0.5);
}

// Quantity caps: per line, net of earlier returns; whole numbers for boxes.
fails({ reason: 'sales_return', lines: [{ lineIndex: 0, qty: 101 }] }, /more than the 100 billed/);
fails({ reason: 'sales_return', lines: [{ lineIndex: 0, qty: 2.5 }] }, /whole number/);
fails({ reason: 'sales_return', lines: [{ lineIndex: 7, qty: 1 }] }, /does not match/);
fails({ reason: 'sales_return', lines: [{ lineIndex: 0, qty: 1 }, { lineIndex: 0, qty: 1 }] }, /does not match/);
fails({ reason: 'sales_return', lines: [] }, /at least one line/);
fails({ reason: 'nope', lines: [{ lineIndex: 0, qty: 1 }] }, /reason/);
const earlierReturn = { reason: 'sales_return', grand_total: 47200, items: [{ ...items[0], loadedWholeQty: 80, lineIndex: 0 }] };
fails({ reason: 'sales_return', earlier: [earlierReturn], lines: [{ lineIndex: 0, qty: 21 }] }, /only 20 is left/);
assert.ok(prepareCreditNote({ ...base, reason: 'sales_return', earlier: [earlierReturn], lines: [{ lineIndex: 0, qty: 20 }] }));

// Price reasons: rate at most the billed rate, value net of earlier notes.
fails({ reason: 'post_sale_discount', lines: [{ lineIndex: 0, qty: 100, rate: 501 }] }, /at most the billed/);
{
  // ₹50/box off all 100 boxes after 80 were returned: only ₹10,000 of value is left, ₹5,000 asked.
  const { totals } = prepareCreditNote({ ...base, reason: 'post_sale_discount', earlier: [earlierReturn], lines: [{ lineIndex: 0, qty: 20, rate: 250 }] });
  assert.equal(totals.taxableTotal, 5000);
}
fails({ reason: 'rate_correction', earlier: [earlierReturn], lines: [{ lineIndex: 0, qty: 100, rate: 101 }] }, /only ₹10000 of its value/);
// Two discounts on the same line are fine while value remains.
assert.ok(prepareCreditNote({
  ...base, reason: 'post_sale_discount',
  earlier: [{ reason: 'post_sale_discount', grand_total: 11800, items: [{ ...items[0], ratePerUnit: 100, lineIndex: 0 }] }],
  lines: [{ lineIndex: 0, qty: 100, rate: 100 }],
}));
// The notes together never pass the invoice total.
fails({ reason: 'other', invoiceTotal: 100, lines: [{ lineIndex: 0, qty: 1 }] }, /more than the original/);

// Credit note voucher: the sales entry reversed, against the invoice, balanced.
{
  const ledgers = { sales: 1, sales_returns: 2, output_cgst: 3, output_sgst: 4, output_igst: 5, round_off: 6 };
  const { totals } = prepareCreditNote({ ...base, reason: 'sales_return', lines: [{ lineIndex: 0, qty: 3 }, { lineIndex: 1, qty: 0.5 }] });
  const lines = creditNoteLines({ totals, partyLedgerId: 99, ledgers, invoiceNumber: 'HM/26-27/0001', locationId: 4 });
  assert.equal(lines.reduce((sum, line) => sum + toPaise(line.amount), 0), 0);
  const party = lines.find((line) => line.ledgerId === 99);
  assert.deepEqual(
    { amount: party.amount, billRefType: party.billRefType, billRef: party.billRef },
    { amount: -totals.grandTotal, billRefType: 'against', billRef: 'HM/26-27/0001' }
  );
  assert.equal(lines.find((line) => line.ledgerId === 2).amount, totals.taxableTotal);
  assert.equal(lines.find((line) => line.ledgerId === 3).amount, totals.cgst);
  assert.ok(!lines.some((line) => line.ledgerId === 1 || line.ledgerId === 5));
}

// Supplier debit notes number in their own series.
assert.equal(formatNoteNumber('HM', 'debit', '26-27', 3, 'supplier'), 'HMPD/26-27/0003');

// Customer debit note: a raised price on billed quantity; no value cap, but no returns.
{
  const { totals, items: noted } = prepareCustomerDebitNote({ ...base, reason: 'rate_correction', lines: [{ lineIndex: 0, qty: 100, rate: 20 }] });
  assert.equal(totals.taxableTotal, 2000);
  assert.equal(totals.grandTotal, 2360);
  assert.equal(noted[0].ratePerUnit, 20);
  assert.throws(() => prepareCustomerDebitNote({ ...base, reason: 'sales_return', lines: [{ lineIndex: 0, qty: 1, rate: 1 }] }), /rate correction/);
  assert.throws(() => prepareCustomerDebitNote({ ...base, reason: 'other', lines: [{ lineIndex: 0, qty: 101, rate: 1 }] }), /more than the 100 billed/);
  assert.throws(() => prepareCustomerDebitNote({ ...base, reason: 'other', lines: [{ lineIndex: 0, qty: 1 }] }), /extra rate/);
  // Voucher: a new amount owed under the note's own number.
  const ledgers = { sales: 1, output_cgst: 3, output_sgst: 4, output_igst: 5, round_off: 6 };
  const lines = salesInvoiceLines({ totals, partyLedgerId: 99, ledgers, billRef: 'HMD/26-27/0001', billDate: '2026-11-21' });
  assert.equal(lines.reduce((sum, line) => sum + toPaise(line.amount), 0), 0);
  assert.deepEqual(lines[0], { ledgerId: 99, amount: 2360, billRefType: 'new', billRef: 'HMD/26-27/0001', billDate: '2026-11-21', locationId: null });
}

// Purchase lines → note lines whose values rebuild the supplier's bill.
{
  const shipment = { discount_amount: 1000, fuel_cost_percent: 5, handling_cost_percent: 1, gst_percent: 18 };
  const rows = [
    { item_id: 7, sku: 'T1', name: 'Tile', unit_of_measure: 'box', ordered_qty: 100, received_whole_qty: 95, received_qty_sqft: 0, total_cost: 40000, discount_amount: 0, hsn_code: '690721' },
    { item_id: 8, sku: 'K1', name: 'Kota', unit_of_measure: 'sqft', ordered_qty: 0, received_whole_qty: 0, received_qty_sqft: 250.5, total_cost: 10020, discount_amount: 20, hsn_code: '680299' },
  ];
  // computeInboundTotals for these rows: (40,000 + 10,000 − 1,000) × 1.05 × 1.01 × 1.18.
  const grand = 61318.11;
  const lines = purchaseNoteItems({ shipment, items: rows, claimItc: true });
  assert.deepEqual([lines[0].itemCategory, lines[0].loadedWholeQty, lines[0].receivedQty, lines[0].gstRate], ['tile', 100, 95, 18]);
  assert.deepEqual([lines[1].itemCategory, lines[1].qtySqft, lines[1].receivedQty], ['stone', 250.5, 250.5]);
  const rebuilt = lines.reduce((sum, l) => sum + (l.loadedWholeQty || l.qtySqft) * l.ratePerUnit * 1.18, 0);
  assert.ok(Math.abs(rebuilt - grand) < 2, `rebuilt ${rebuilt} vs bill ${grand}`);
  // Without ITC the GST sits in the rate and the line carries 0%.
  const noItc = purchaseNoteItems({ shipment, items: rows, claimItc: false });
  assert.equal(noItc[0].gstRate, 0);
  assert.ok(Math.abs(noItc[0].ratePerUnit - lines[0].ratePerUnit * 1.18) < 0.02);

  // Goods back: capped by what was received, not what was billed. A shortfall can claim the unreceived 5.
  const args = { invoiceItems: lines, sellerState: '08', buyerState: '08', invoiceTotal: grand };
  assert.throws(() => prepareCreditNote({ ...args, reason: 'sales_return', lines: [{ lineIndex: 0, qty: 96 }] }), /only 95 received/);
  const back = prepareCreditNote({ ...args, reason: 'sales_return', lines: [{ lineIndex: 0, qty: 95 }] });
  assert.equal(back.items[0].receivedQty, undefined);
  assert.ok(prepareCreditNote({ ...args, reason: 'deficiency', earlier: [{ reason: 'sales_return', items: back.items, grand_total: back.totals.grandTotal }], lines: [{ lineIndex: 0, qty: 5 }] }));

  // Voucher: Dr supplier against the bill, Cr Purchase Returns and input tax.
  const ledgers = { purchase_returns: 2, input_cgst: 3, input_sgst: 4, input_igst: 5, round_off: 6 };
  const entry = supplierDebitNoteLines({ totals: back.totals, partyLedgerId: 77, ledgers, billRef: 'SUP-991' });
  assert.equal(entry.reduce((sum, line) => sum + toPaise(line.amount), 0), 0);
  assert.deepEqual(entry[0], { ledgerId: 77, amount: back.totals.grandTotal, billRefType: 'against', billRef: 'SUP-991', billDate: undefined, locationId: null });
  assert.equal(entry.find((l) => l.ledgerId === 2).amount, -back.totals.taxableTotal);
  assert.equal(entry.find((l) => l.ledgerId === 3).amount, -back.totals.cgst);
  const noItcTotals = prepareCreditNote({ ...args, invoiceItems: noItc, reason: 'other', lines: [{ lineIndex: 0, qty: 10 }] }).totals;
  const noItcEntry = supplierDebitNoteLines({ totals: noItcTotals, partyLedgerId: 77, ledgers, billRef: 'SUP-991' });
  // No input tax reversed (only Purchase Returns, plus Round Off for the paise).
  assert.ok(!noItcEntry.some((l) => [3, 4, 5].includes(l.ledgerId)));
  assert.equal(noItcEntry.reduce((sum, line) => sum + toPaise(line.amount), 0), 0);
}

console.log('notes: all checks passed');
