// Run: node lib/gst-returns.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { B2CL_LIMIT, buildGstr1, buildGstr3b, toCsv } from './gst-returns.mjs';

const tile = (qty, rate = 1000, gstRate = 18) => ({ itemId: '1', itemLabel: 'Tile', itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: qty, ratePerUnit: rate, gstRate, hsnCode: '690721' });
const bag = (qty, rate = 500) => ({ itemId: '2', itemLabel: 'Cement', itemCategory: 'bag', qtyBags: qty, ratePerUnit: rate, gstRate: 18, hsnCode: '252329' });
const stone = (qty) => ({ itemId: '3', itemLabel: 'Kota', itemCategory: 'stone', qtySqft: qty, ratePerUnit: 100, gstRate: 0, hsnCode: '680299' });

// Seller in Rajasthan (08).
const invoices = [
  // B2B, same state, e-invoiced: 10,000 + 900 + 900.
  { number: 'HM/26-27/0001', seq: 1, date: '2026-11-02', status: 'approved', gstin: '08AAACB1234F1Z5', name: 'Builder', pos: '08', value: 11800, irn: 'x', items: [tile(10)] },
  // B2C inter-state above ₹1 lakh → B2CL.
  { number: 'HM/26-27/0002', seq: 2, date: '2026-11-03', status: 'approved', gstin: null, name: 'Walk-in A', pos: '24', value: 118000, items: [tile(100)] },
  // B2C inter-state small → B2CS INTER.
  { number: 'HM/26-27/0003', seq: 3, date: '2026-11-04', status: 'approved', gstin: null, name: 'Walk-in B', pos: '24', value: 1180, items: [tile(1)] },
  // B2C same state, with a 0% line → B2CS INTRA and nil-rated.
  { number: 'HM/26-27/0004', seq: 4, date: '2026-11-05', status: 'approved', gstin: null, name: 'Walk-in C', pos: '08', value: 2180, items: [bag(2), stone(10)] },
  // Cancelled: only counted in documents issued.
  { number: 'HM/26-27/0005', seq: 5, date: '2026-11-06', status: 'cancelled', gstin: '08AAACB1234F1Z5', name: 'Builder', pos: '08', value: 1180, items: [tile(1)] },
];
const notes = [
  { kind: 'credit', number: 'HMC/26-27/0001', seq: 1, date: '2026-11-10', status: 'approved', gstin: '08AAACB1234F1Z5', name: 'Builder', pos: '08', value: 1180, irn: 'y', items: [tile(1)], originalNumber: 'HM/26-27/0001', originalDate: '2026-11-02', originalValue: 11800 },
  { kind: 'credit', number: 'HMC/26-27/0002', seq: 2, date: '2026-11-11', status: 'approved', gstin: null, name: 'Walk-in B', pos: '24', value: 1180, items: [tile(1)], originalNumber: 'HM/26-27/0003', originalValue: 1180 },
  { kind: 'credit', number: 'HMC/26-27/0003', seq: 3, date: '2026-11-12', status: 'approved', gstin: null, name: 'Walk-in A', pos: '24', value: 11800, items: [tile(10)], originalNumber: 'HM/26-27/0002', originalValue: 118000 },
  { kind: 'debit', number: 'HMD/26-27/0001', seq: 1, date: '2026-11-13', status: 'approved', gstin: '08AAACB1234F1Z5', name: 'Builder', pos: '08', value: 590, items: [tile(10, 50)], originalNumber: 'HM/26-27/0001' },
  { kind: 'credit', number: 'HMC/26-27/0004', seq: 4, date: '2026-11-14', status: 'cancelled', gstin: null, name: 'Walk-in C', pos: '08', value: 590, items: [bag(1)] },
];
const g1 = buildGstr1({ sellerState: '08', invoices, notes });

// Sections.
assert.equal(B2CL_LIMIT, 100000);
assert.deepEqual(g1.b2b.map((d) => d.number), ['HM/26-27/0001']);
assert.deepEqual(g1.b2b[0].rows, [{ rate: 18, taxable: 10000, igst: 0, cgst: 900, sgst: 900 }]);
assert.equal(g1.b2b[0].einvoiced, true);
assert.deepEqual(g1.b2cl.map((d) => d.number), ['HM/26-27/0002']);
assert.deepEqual(g1.cdnr.map((d) => [d.type, d.number]), [['C', 'HMC/26-27/0001'], ['D', 'HMD/26-27/0001']]);
assert.deepEqual(g1.cdnur.map((d) => [d.type, d.number, d.noteType]), [['C', 'HMC/26-27/0003', 'B2CL']]);
// B2CS: the small inter-state sale and its credit note cancel out (no row); the intra sale stays, nil line too.
assert.deepEqual(g1.b2cs, [
  { pos: '08', rate: 0, supply: 'INTRA', taxable: 1000, igst: 0, cgst: 0, sgst: 0 },
  { pos: '08', rate: 18, supply: 'INTRA', taxable: 1000, igst: 0, cgst: 90, sgst: 90 },
]);

// HSN: split B2B / B2C, notes netted, quantities with them.
const hsn = (side, code) => g1.hsn.find((r) => r.side === side && r.hsn === code);
assert.deepEqual(hsn('b2b', '690721'), { side: 'b2b', hsn: '690721', rate: 18, uqc: 'BOX', qty: 19, taxable: 9500, igst: 0, cgst: 855, sgst: 855 });
assert.equal(hsn('b2c', '690721').qty, 90); // 100 + 1 − 1 − 10
assert.equal(hsn('b2c', '680299').rate, 0);
// Cartage is a service: its SAC row carries UQC NA and no quantity.
{
  const cartage = { itemCategory: 'charge', itemId: '', itemLabel: 'Cartage', hsnCode: '996511', ratePerUnit: 600, gstRate: 18 };
  const { hsn: rows } = buildGstr1({ sellerState: '08', invoices: [{ ...invoices[0], items: [tile(10), cartage] }] });
  assert.deepEqual(rows.find((r) => r.hsn === '996511'), { side: 'b2b', hsn: '996511', rate: 18, uqc: 'NA', qty: 0, taxable: 600, igst: 0, cgst: 54, sgst: 54 });
  assert.equal(rows.find((r) => r.hsn === '690721').qty, 10);
}

// Documents issued: each series with its cancellations.
assert.deepEqual(g1.documents, [
  { nature: 'Invoices for outward supply', from: 'HM/26-27/0001', to: 'HM/26-27/0005', total: 5, cancelled: 1, net: 4 },
  { nature: 'Credit Note', from: 'HMC/26-27/0001', to: 'HMC/26-27/0004', total: 4, cancelled: 1, net: 3 },
  { nature: 'Debit Note', from: 'HMD/26-27/0001', to: 'HMD/26-27/0001', total: 1, cancelled: 0, net: 1 },
]);

// The sections reconcile: every approved document counted once, notes signed.
// Taxable: 10,000 + 100,000 + 1,000 + 2,000 − 1,000 − 1,000 − 10,000 + 500 = 101,500.
assert.equal(g1.total.taxable, 101500);
assert.equal(g1.total.igst, 18000 + 180 - 180 - 1800);
assert.equal(g1.total.cgst, 900 + 90 - 90 + 45);
assert.equal(g1.summary.cdnr.taxable, -1000 + 500);

// GSTR-3B.
const g3 = buildGstr3b({
  businessState: '08',
  gstr1: g1,
  purchases: [
    { number: 'S-1', date: '2026-11-01', supplier: 'Local', gstin: '08AAACS1111A1Z5', grandTotal: 1180, gstPercent: 18 },
    { number: 'S-2', date: '2026-11-02', supplier: 'Gujarat', gstin: '24AAACS2222A1Z5', grandTotal: 2360, gstPercent: 18 },
    { number: 'S-3', date: '2026-11-03', supplier: 'No GSTIN', gstin: null, grandTotal: 500, gstPercent: 18 },
  ],
  supplierNotes: [{ number: 'HMPD/26-27/0001', gstin: '08AAACS1111A1Z5', items: [bag(1, 100)] }],
  expenseItc: { taxable: 0, igst: 18, cgst: 0, sgst: 0 },
});
assert.deepEqual(g3.outward, { taxable: 100500, igst: 16200, cgst: 945, sgst: 945 });
assert.deepEqual(g3.nilRated, { taxable: 1000 });
assert.deepEqual(g3.interStateUnregistered, [{ pos: '24', taxable: 90000, igst: 16200 }]);
assert.deepEqual(g3.itc.purchases, { igst: 360, cgst: 90, sgst: 90 });
assert.deepEqual(g3.itc.available, { igst: 378, cgst: 90, sgst: 90 });
assert.deepEqual(g3.itc.reversals, { igst: 0, cgst: 9, sgst: 9 });
assert.deepEqual(g3.itc.net, { igst: 378, cgst: 81, sgst: 81 });
assert.deepEqual(g3.purchasesWithoutGstin, { count: 1, value: 500 });
assert.deepEqual(g3.payable, { igst: 15822, cgst: 864, sgst: 864 });

// CSV: quoting and order.
assert.equal(
  toCsv([{ label: 'Name', get: 'name' }, { label: 'Value', get: (r) => r.value.toFixed(2) }], [{ name: 'A, "B"', value: 1 }]),
  'Name,Value\n"A, ""B""",1.00\n'
);

console.log('gst-returns: all checks passed');

// GSTR-2B: parse the portal file, match against purchases.
{
  const { matchGstr2b, normaliseBillNo, parseGstr2b } = await import('./gst-returns.mjs');
  const file = { data: { gstin: '08AAACH1111A1Z5', rtnprd: '112026', docdata: {
    b2b: [
      { ctin: '08AAACS1111A1Z5', trdnm: 'Stone Co', inv: [
        { inum: 'SC/001', dt: '03-11-2026', val: 1180, itcavl: 'Y', items: [{ txval: 1000, cgst: 90, sgst: 90 }] },
        { inum: 'SC-2', dt: '04-11-2026', val: 2360, itcavl: 'Y', items: [{ txval: 2000, cgst: 180, sgst: 180 }] },
      ] },
      { ctin: '24AAACT2222A1Z5', trdnm: 'Tile Works', inv: [
        { inum: '77', dt: '05-11-2026', val: 590, itcavl: 'Y', items: [{ txval: 500, igst: 90 }] },
        { inum: '78', dt: '06-11-2026', val: 118, itcavl: 'N', items: [{ txval: 100, igst: 18 }] },
      ] },
    ],
    cdnr: [{ ctin: '08AAACS1111A1Z5', trdnm: 'Stone Co', nt: [{ ntnum: 'CN1', typ: 'C', dt: '10-11-2026', val: 118, itcavl: 'Y', items: [{ txval: 100, cgst: 9, sgst: 9 }] }] }],
  } } };
  const parsed = parseGstr2b(file);
  assert.equal(parsed.period, '2026-11');
  assert.equal(parsed.rows.length, 5);
  assert.deepEqual(parsed.rows[0], { kind: 'invoice', gstin: '08AAACS1111A1Z5', tradeName: 'Stone Co', number: 'SC/001', date: '2026-11-03', value: 1180, taxable: 1000, igst: 0, cgst: 90, sgst: 90, itcAvailable: true });
  assert.throws(() => parseGstr2b({ hello: 1 }), /not a GSTR-2B/);
  assert.equal(normaliseBillNo(' sc/0001 '), normaliseBillNo('SC-001'));

  const purchases = [
    { id: 1, number: 'sc 001', date: '2026-11-02', gstin: '08AAACS1111A1Z5', supplier: 'Stone Co', grandTotal: 1180.4 }, // matches (bill no typed differently, within ₹1)
    { id: 2, number: 'SC-2', date: '2026-11-04', gstin: '08AAACS1111A1Z5', supplier: 'Stone Co', grandTotal: 2000 },   // value differs
    { id: 3, number: '77', date: '2026-11-05', gstin: null, supplierId: 9, supplier: 'Tile Works', grandTotal: 590 },  // supplier without GSTIN
    { id: 4, number: 'X-9', date: '2026-11-07', gstin: '08AAACS1111A1Z5', supplier: 'Stone Co', grandTotal: 500 },     // not filed by supplier
  ];
  const m = matchGstr2b({ rows: parsed.rows, purchases, monthPurchases: purchases });
  assert.deepEqual(m.matched.map((x) => x.purchase.id), [1]);
  assert.deepEqual(m.mismatched.map((x) => [x.purchase.id, x.diff]), [[2, 360]]);
  assert.deepEqual(m.only2b.map((x) => [x.row.number, x.proposal?.supplierId ?? null]), [['77', 9], ['78', null]]);
  assert.deepEqual(m.onlyBooks.map((p) => p.id), [4]);
  // ITC per 2B: available invoices less the credit note; the ITC-not-available bill left out.
  assert.deepEqual(m.itc, { igst: 90, cgst: 90 + 180 - 9, sgst: 90 + 180 - 9 });
  // A bill already in an earlier month's 2B is not "missing".
  assert.deepEqual(matchGstr2b({ rows: [], allRows: parsed.rows, purchases, monthPurchases: [purchases[0]] }).onlyBooks, []);
  console.log('gstr-2b: all checks passed');
}
