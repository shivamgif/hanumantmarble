// Run: node lib/tds.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { isValidPan, panHolder, tdsDueDate, tdsFor, tdsLedger, tdsQuarter, tdsRate } from './tds.mjs';

assert.equal(isValidPan('ABCPK1234L'), true);
assert.equal(isValidPan('abc'), false);
assert.equal(panHolder('ABCPK1234L'), 'individual');
assert.equal(panHolder('ABCHK1234L'), 'individual'); // HUF
assert.equal(panHolder('ABCCK1234L'), 'other');      // company
assert.equal(tdsRate('194C', 'ABCPK1234L'), 1);
assert.equal(tdsRate('194C', 'ABCFK1234L'), 2);       // firm
assert.equal(tdsRate('194C', null), 20);              // no PAN
assert.equal(tdsRate('194Q', null), 5);

// 194C: ₹25,000 bills to a transporter (individual). Under both limits: nothing.
assert.deepEqual(tdsFor({ section: '194C', pan: 'ABCPK1234L', amount: 25000 }), { tds: 0, rate: 1, base: 25000 });
// A single bill above ₹30,000: deduct on it.
assert.equal(tdsFor({ section: '194C', pan: 'ABCPK1234L', amount: 40000 }).tds, 400);
// The year's total crosses ₹1 lakh on a small bill: catch up on the whole year.
assert.equal(tdsFor({ section: '194C', pan: 'ABCPK1234L', amount: 20000, priorBase: 90000, priorTds: 0 }).tds, 1100);
// …after which every bill is taxed.
assert.equal(tdsFor({ section: '194C', pan: 'ABCPK1234L', amount: 5000, priorBase: 110000, priorTds: 1100 }).tds, 50);

// 194J(b) professional fees ₹60,000 to a firm: 10%.
assert.equal(tdsFor({ section: '194J(b)', pan: 'ABCFK1234L', amount: 60000 }).tds, 6000);
// 194I(b) rent: only a month's rent above ₹50,000.
assert.equal(tdsFor({ section: '194I(b)', pan: 'ABCPK1234L', amount: 45000 }).tds, 0);
assert.equal(tdsFor({ section: '194I(b)', pan: 'ABCPK1234L', amount: 60000 }).tds, 6000);

// 194Q: 0.1% only on purchases from one seller beyond ₹50 lakh in the year.
assert.equal(tdsFor({ section: '194Q', pan: 'ABCCK1234L', amount: 1000000, priorBase: 4500000 }).tds, 500); // 5,00,000 over × 0.1%
assert.equal(tdsFor({ section: '194Q', pan: 'ABCCK1234L', amount: 1000000, priorBase: 1000000 }).tds, 0);
assert.equal(tdsFor({ section: '194Q', pan: 'ABCCK1234L', amount: 200000, priorBase: 6000000 }).tds, 200);
assert.equal(tdsFor({ section: '194Q', pan: null, amount: 200000, priorBase: 6000000 }).tds, 10000); // 5% without PAN

assert.equal(tdsFor({ section: 'nope', amount: 100 }).tds, 0);
assert.equal(tdsDueDate('2026-11'), '2026-12-07');
assert.equal(tdsDueDate('2026-12'), '2027-01-07');
assert.equal(tdsDueDate('2027-03'), '2027-04-30');
assert.deepEqual(['2026-04-01', '2026-07-15', '2026-12-31', '2027-03-31'].map(tdsQuarter), [1, 2, 3, 4]);
assert.deepEqual(tdsLedger('194I(b)'), { key: 'tds_194ib', name: 'TDS Payable 194I(b)' });

console.log('tds: all checks passed');
