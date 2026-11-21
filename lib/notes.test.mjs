// Run: node lib/notes.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { creditNoteLines, toPaise } from './accounts.mjs';
import { formatNoteNumber, prepareCreditNote } from './notes.mjs';

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
  assert.equal(totals.grandTotal, 850.5);
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
fails({ reason: 'other', invoiceTotal: 100, lines: [{ lineIndex: 0, qty: 1 }] }, /more than the invoice/);

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

console.log('notes: all checks passed');
