// Run: node lib/gst-invoice.test.mjs
import assert from 'node:assert/strict';
import {
  amountInWords,
  computeInvoiceTotals,
  dispatchMatchesInvoice,
  estimateChanges,
  exclusiveRate,
  inclusiveRate,
  fiscalYearOf,
  formatInvoiceNumber,
  formatProformaNumber,
  isCharge,
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
  assert.equal(t.grandTotal, Math.round(t.taxableTotal + t.cgst + t.sgst));
  assert.equal(t.roundOff, +(t.grandTotal - (t.taxableTotal + t.cgst + t.sgst)).toFixed(2));
}

// Inter-state: IGST at the full rate, no CGST/SGST.
{
  const t = computeInvoiceTotals([tile], '08', '24');
  assert.equal(t.interState, true);
  assert.equal(t.cgst, 0);
  assert.equal(t.igst, 599.99);
  assert.equal(t.grandTotal, 3933); // 3933.29 to the rupee
  assert.equal(t.roundOff, -0.29);
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

assert.equal(amountInWords(3933.29), 'Rupees Three Thousand Nine Hundred Thirty Three and Twenty Nine Paise Only');
assert.equal(amountInWords(1250000), 'Rupees Twelve Lakh Fifty Thousand Only');
assert.equal(amountInWords(105000000.5), 'Rupees Ten Crore Fifty Lakh and Fifty Paise Only');
assert.equal(amountInWords(0), 'Rupees Zero Only');

assert.equal(formatProformaNumber('HM', '26-27', 3), 'HMPI/26-27/0003');

// Cartage as a charge line: Tally invoice 13167 to the paisa (tiles 7,874.60 + cartage 600 @18%).
{
  const box = (qty, rate) => ({ itemId: String(rate), itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: qty, ratePerUnit: rate, gstRate: 18 });
  const tiles = [box(4, 495.2), { ...box(4, 495.2), itemId: 'b' }, { ...box(4, 495.2), itemId: 'c' }, box(1, 1932.2)];
  const cartage = { itemCategory: 'charge', itemId: '', itemLabel: 'Cartage', hsnCode: '996511', ratePerUnit: 600, gstRate: 18 };
  const t = computeInvoiceTotals([...tiles, cartage], '09', '09');
  assert.equal(t.taxableTotal, 8474.6);
  assert.equal(t.cgst, 762.71);
  assert.equal(t.sgst, 762.71);
  assert.equal(t.roundOff, -0.02);
  assert.equal(t.grandTotal, 10000);
  assert.equal(isCharge(cartage), true);
  // Billed, never loaded: the dispatch matches on the goods alone.
  assert.equal(dispatchMatchesInvoice([...tiles, cartage], tiles), true);
  assert.equal(dispatchMatchesInvoice([...tiles, cartage], [...tiles, cartage]), false);
}

// An approver's correction, as the estimate's timeline shows it.
{
  const line = (itemId, label, qty, rate) => ({ itemId, itemLabel: label, itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: qty, ratePerUnit: rate, gstRate: 18, hsnCode: '69072200' });
  const before = {
    bill_to_name: 'Saroj', bill_to_city: 'Kanpur', referred_by_name: null, notes: '', salesperson_name: 'Dinesh',
    items: [line('1', 'GRAVIA AZUL', 4, 495.2), line('2', 'WHITE LILY', 4, 495.2)],
  };
  const after = {
    ...before, bill_to_city: 'Lucknow', referred_by_name: 'Ramesh', notes: null,
    items: [line('1', 'GRAVIA AZUL', '4', '480'), line('3', 'K-12651', 1, 1932.2)],
  };
  assert.deepEqual(estimateChanges(before, after), [
    'City: Kanpur → Lucknow',
    'Referred by: — → Ramesh',
    'GRAVIA AZUL: 4 box @ 495.2, GST 18%, HSN 69072200 → 4 box @ 480, GST 18%, HSN 69072200',
    'Added K-12651: 1 box @ 1932.2, GST 18%, HSN 69072200',
    'Removed WHITE LILY',
  ]);
  // Form strings vs stored numbers, '' vs null: not a change.
  assert.deepEqual(estimateChanges(before, { ...before, notes: null, items: before.items.map((row) => ({ ...row, loadedWholeQty: String(row.loadedWholeQty) })) }), []);
}

// Rates typed GST-inclusive bill exactly what was quoted.
{
  const tile = (incl, qty) => ({ itemId: '1', itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: qty, ratePerUnit: exclusiveRate(incl, 18), gstRate: 18 });
  const stone = (incl, sqft) => ({ itemId: '2', itemCategory: 'stone', qtySqft: sqft, ratePerUnit: exclusiveRate(incl, 18), gstRate: 18 });
  assert.equal(computeInvoiceTotals([tile(500, 10)], '08', '08').grandTotal, 5000);
  assert.equal(computeInvoiceTotals([stone(60, 1000)], '08', '08').grandTotal, 60000);
  assert.equal(computeInvoiceTotals([stone(87.5, 2345.5)], '08', '27').grandTotal, Math.round(87.5 * 2345.5));
  assert.equal(computeInvoiceTotals([{ itemCategory: 'charge', ratePerUnit: exclusiveRate(600, 18), gstRate: 18 }], '08', '08').grandTotal, 600);
  for (const x of [1, 60, 99.99, 495.2, 584.34, 12345.67]) assert.equal(inclusiveRate(exclusiveRate(x, 18), 18), x);
  assert.equal(exclusiveRate(105, 5), 100);
  assert.equal(exclusiveRate(100, 0), 100);
}

// Advance: DB text '0.00' and no advance are the same; a new one is logged.
{
  const base = { items: [], advance_amount: '0.00', advance_date_text: null, advance_mode: null };
  assert.deepEqual(estimateChanges(base, { ...base, advance_amount: 0 }), []);
  assert.deepEqual(estimateChanges(base, { ...base, advance_amount: 2000, advance_mode: 'upi' }), ['Advance: — → 2000', 'Advance mode: — → upi']);
}

console.log('gst-invoice: all checks passed');
