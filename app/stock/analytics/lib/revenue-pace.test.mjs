// Run: node app/stock/analytics/lib/revenue-pace.test.mjs
import assert from 'node:assert/strict';
import { revenuePace } from './revenue-pace.mjs';

// NUMERIC columns arrive as strings.
const rows = [
  { revenue: '100000.00', costed_revenue: '100000.00', profit: '20000.00' },
  { revenue: '40000.00', costed_revenue: '32000.00', profit: '8000.00' },
];

// A third of the way through the month, 40k is on pace for 120k: +20%, not -60%.
const mid = revenuePace(rows, 1 / 3);
assert.equal(mid.revenue, 40000);
assert.equal(mid.previous, 100000);
assert.ok(Math.abs(mid.changePct - 20) < 1e-9);
// Margin is over the costed 32k, not all 40k.
assert.equal(mid.marginPct, 25);

// A finished month compares as-is.
assert.ok(Math.abs(revenuePace(rows, 1).changePct - -60) < 1e-9);

// No prior month, or a prior month with no sales: nothing to compare against.
assert.equal(revenuePace(rows.slice(1), 0.5).changePct, null);
assert.equal(revenuePace([{ revenue: '0' }, rows[1]], 0.5).changePct, null);
assert.equal(revenuePace([], 1), null);

console.log('revenue-pace: ok');
