// Run: node lib/gst-invoice.test.mjs
import assert from 'node:assert/strict';
import {
  computeInvoiceTotals,
  dispatchMatchesInvoice,
  fiscalYearOf,
  formatInvoiceNumber,
  isValidGstin,
  PLACEHOLDER_GSTIN,
} from './gst-invoice.mjs';

const tile = { itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: '10', ratePerUnit: '333.33', gstRate: 18 };
const stone = { itemCategory: 'stone', qtySqft: '120.5', ratePerUnit: '42', gstRate: 12 };
const bag = { itemCategory: 'bag', qtyBags: '3', ratePerUnit: '410', gstRate: 18 };

// Intra-state: CGST + SGST, half the rate each, rounded per line.
{
  const t = computeInvoiceTotals([tile, stone, bag], '08', '08');
  assert.equal(t.interState, false);
  assert.equal(t.lines[0].taxable, 3333.3);
  assert.equal(t.lines[0].cgst, 300); // 3333.30 × 9% = 299.997 → 300.00
  assert.equal(t.lines[1].qty, 120.5); // stone bills square feet
  assert.equal(t.lines[1].taxable, 5061);
  assert.equal(t.lines[1].cgst, 303.66);
  assert.equal(t.lines[2].taxable, 1230);
  assert.equal(t.igst, 0);
  assert.equal(t.cgst, t.sgst);
  assert.equal(t.taxableTotal, 9624.3);
  assert.equal(t.grandTotal, +(t.taxableTotal + t.cgst + t.sgst).toFixed(2));
}

// Inter-state: IGST at the full rate, no CGST/SGST.
{
  const t = computeInvoiceTotals([tile], '08', '24');
  assert.equal(t.interState, true);
  assert.equal(t.cgst, 0);
  assert.equal(t.igst, 599.99);
  assert.equal(t.grandTotal, 3933.29);
}

// Financial year rolls over on 1 April.
assert.equal(fiscalYearOf('2026-03-31'), '25-26');
assert.equal(fiscalYearOf('2026-04-01'), '26-27');
assert.equal(fiscalYearOf('2027-01-15'), '26-27');

const number = formatInvoiceNumber('HM', '26-27', 7);
assert.equal(number, 'HM/26-27/0007');
assert.ok(number.length <= 16);
assert.ok(/^[A-Z0-9/-]+$/.test(number)); // passes the dispatch form's invoiceFormat

assert.equal(isValidGstin('08AABCH1234F1Z5', '08'), true);
assert.equal(isValidGstin('08aabch1234f1z5', '08'), true);
assert.equal(isValidGstin('08AABCH1234F1Z5', '24'), false); // state mismatch
assert.equal(isValidGstin('08AABCH1234F1Y5', '08'), false); // 14th char must be Z
assert.equal(isValidGstin(PLACEHOLDER_GSTIN, '08'), true);

// A scanned dispatch must ship exactly what the invoice bills.
{
  const invoice = [{ itemId: '5', ...tile }, { itemId: '9', ...stone }];
  const sameReordered = [
    { itemId: 9, itemCategory: 'stone', qtySqft: 120.5, ratePerUnit: 42 },
    { itemId: 5, itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: 10, ratePerUnit: 333.33 },
  ];
  assert.equal(dispatchMatchesInvoice(invoice, sameReordered), true);
  assert.equal(dispatchMatchesInvoice(invoice, sameReordered.slice(0, 1)), false);
  assert.equal(dispatchMatchesInvoice(invoice, [sameReordered[0], { ...sameReordered[1], loadedWholeQty: 9 }]), false);
  assert.equal(dispatchMatchesInvoice(invoice, [sameReordered[0], { ...sameReordered[1], sellUnit: 'piece' }]), false);
  assert.equal(dispatchMatchesInvoice(invoice, [sameReordered[0], { ...sameReordered[1], ratePerUnit: 300 }]), false);
  // Unbilled broken pieces riding along on a matching line.
  assert.equal(dispatchMatchesInvoice(invoice, [sameReordered[0], { ...sameReordered[1], loadedBrokenQty: 50 }]), false);
  assert.equal(dispatchMatchesInvoice(invoice, [sameReordered[0], { ...sameReordered[1], fromBroken: true }]), false);
  assert.equal(dispatchMatchesInvoice(invoice, [sameReordered[0], { ...sameReordered[1], loadedBrokenQty: '0', fromBroken: false }]), true);
}

console.log('gst-invoice: all checks passed');
