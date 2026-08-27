// Run: node lib/stock-returns.test.mjs
//
// Guards the "loaded whole, returned broken" case: a tile leaves the warehouse
// whole, breaks in transit, and the customer sends it back broken. Both the
// return cap and the billed-qty formula used to get this wrong.
import assert from 'node:assert/strict';

// Mirrors the cap in app/api/stock/outbound-shipments/[id]/route.js.
const returnAllowed = (loadedW, loadedB, retW, retB) =>
  retW <= loadedW && retW + retB <= loadedW + loadedB;

// The formula that was in 20 SQL sites: nets each condition against its own
// loaded column, so a cross-condition return lands in a clamped GREATEST and
// silently vanishes from the deduction.
const billedOld = (lw, lb, rw, rb) =>
  Math.max(lw - rw, 0) + Math.max(lb - rb, 0);
// The formula now in those sites. rate_per_unit is one rate per line, so the
// per-condition split bought nothing and only broke the cross case.
const billedNew = (lw, lb, rw, rb) =>
  Math.max((lw + lb) - (rw + rb), 0);

// The reported case: 10 whole out, 2 arrive broken and come back.
assert.equal(returnAllowed(10, 0, 0, 2), true, 'broken return must be loggable against a whole-only dispatch');
assert.equal(billedOld(10, 0, 0, 2), 10, 'old formula overbilled the returned tiles');
assert.equal(billedNew(10, 0, 0, 2), 8);

// Broken cannot come back whole — the one direction still rejected.
assert.equal(returnAllowed(0, 5, 3, 0), false);
// Total is still capped: 10 out, 11 back is not a return.
assert.equal(returnAllowed(10, 0, 8, 3), false);
assert.equal(returnAllowed(6, 4, 6, 4), true, 'a full return of both conditions is allowed');

// The swap must be a no-op everywhere else, or the 20-site rewrite changed
// historical revenue. Exhaustive over the whole non-cross domain.
for (let lw = 0; lw <= 6; lw++) {
  for (let lb = 0; lb <= 6; lb++) {
    for (let rw = 0; rw <= lw; rw++) {
      for (let rb = 0; rb <= lb; rb++) {
        assert.equal(billedNew(lw, lb, rw, rb), billedOld(lw, lb, rw, rb),
          `formulas diverged on ${lw}/${lb} loaded, ${rw}/${rb} returned`);
      }
    }
  }
}

console.log('stock-returns: ok');
