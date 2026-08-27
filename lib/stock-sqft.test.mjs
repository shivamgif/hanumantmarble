// Run: node lib/stock-sqft.test.mjs
import assert from 'node:assert/strict';
import {
  toSqft,
  sqftLineTotal,
  toPositiveSqft,
  assertSqftAvailable,
} from './stock-sqft.js';

// NUMERIC comes back from the driver as a string — the whole reason this file exists.
assert.equal(toSqft('1250.750'), 1250.75);
assert.equal(toSqft(1250.7504), 1250.75);
assert.equal(toSqft(null), 0);
assert.equal(toSqft('abc'), 0);

// Every value crossing into SQL is rounded first, so a raw float never reaches
// the NUMERIC column: 0.1 + 0.2 must not arrive as 0.30000000000000004.
assert.equal([0.1, 0.2].reduce((a, b) => a + b, 0) === 0.3, false);
assert.equal(toSqft(0.1 + 0.2), 0.3);

// Money: sqft x rate, to paise.
assert.equal(sqftLineTotal('1250.750', 45), 56283.75);
assert.equal(sqftLineTotal(0, 45), 0);

// Blank/negative reject via a single === 0 check.
assert.equal(toPositiveSqft(''), 0);
assert.equal(toPositiveSqft('-5'), 0);
assert.equal(toPositiveSqft('399.375'), 399.375);

// Issue guard: exact-balance issue is allowed, one thousandth over is not.
assert.equal(assertSqftAvailable({ requested: '400', available: '400.000', sku: 'K1' }), 400);
assert.throws(
  () => assertSqftAvailable({ requested: '400.001', available: '400.000', sku: 'K1' }),
  /Insufficient stock for K1: need 400.001 sqft, have 400/
);

console.log('stock-sqft: all assertions passed');

// Ledger invariant: the running balance is what answers "how many sqft are
// left". Receive -> issue -> partial return must land exactly, with no drift.
// Postgres accumulates the balance in NUMERIC (exact); this models the values
// each step hands it, which is what these helpers are responsible for.
let onHand = 0;
onHand = toSqft(onHand + toPositiveSqft('1250.750'));   // inbound approved
assert.equal(onHand, 1250.75);
onHand = toSqft(onHand - assertSqftAvailable({ requested: '400.375', available: onHand, sku: 'K1' }));
assert.equal(onHand, 850.375);
onHand = toSqft(onHand + toPositiveSqft('100.125'));    // customer returned some
assert.equal(onHand, 950.5);
// Repeated small issues must not drift the balance off a round number.
for (let i = 0; i < 10; i++) {
  onHand = toSqft(onHand - toPositiveSqft('0.1'));
}
assert.equal(onHand, 949.5);
assert.throws(() => assertSqftAvailable({ requested: onHand + 0.001, available: onHand, sku: 'K1' }));

console.log('stock-sqft: ledger invariant holds');
