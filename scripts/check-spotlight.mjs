// Asserts the per-salesperson analytics slice. Run: node scripts/check-spotlight.mjs
import assert from 'node:assert/strict';
import { deriveSpotlight } from '../app/stock/analytics/lib/spotlight.mjs';

const trend = [
  { bucket: '2026-06-01', salesperson: 'Bhavna S.', shipment_count: 2, total_qty: '100', total_revenue: '5000' },
  { bucket: '2026-05-01', salesperson: 'Bhavna S.', shipment_count: 3, total_qty: '150', total_revenue: '7000' },
  { bucket: '2026-06-01', salesperson: 'Ramesh K.', shipment_count: 5, total_qty: '400', total_revenue: '20000' },
  { bucket: '2026-06-01', salesperson: 'Zoya A.', shipment_count: 1, total_qty: '10', total_revenue: '900' },
];
const ranking = [
  { salesperson: 'Ramesh K.', revenue: '20000', growth_ratio: '0.18', consistency_score: '74' },
  { salesperson: 'Bhavna S.', revenue: '12000', growth_ratio: '-0.29', consistency_score: '61' },
];
const goals = [{ id: 7, name: 'Bhavna S.', goal: '20000', actual: '12000', shipments: 5 }];

// Roster is every salesperson in the trend rows, alphabetical - not just the ranked ones.
const top = deriveSpotlight(trend, ranking, goals, null);
assert.deepEqual(top.roster, ['Bhavna S.', 'Ramesh K.', 'Zoya A.']);
// No selection yet -> falls back to the #1 ranked person.
assert.equal(top.active, 'Ramesh K.');
assert.equal(top.rank, 1);
assert.equal(top.outOf, 2);
assert.equal(top.goalRow, null, 'Ramesh has no goal row; the goal block must hide, not crash');

// Selecting a person scopes the series and totals to them only.
const b = deriveSpotlight(trend, ranking, goals, 'Bhavna S.');
assert.equal(b.series.length, 2);
assert.deepEqual(b.series.map((r) => r.bucket), ['2026-05-01', '2026-06-01'], 'series must be chronological');
assert.deepEqual(b.totals, { revenue: 12000, qty: 250, shipments: 5 }, 'numeric strings from pg must sum as numbers');
assert.equal(b.rank, 2);
assert.equal(b.goalRow.id, 7, 'goal row is matched by name');
assert.equal(Number(b.rankRow.growth_ratio), -0.29);

// Someone present in the trend but outside the ranking: still selectable, no rank.
const z = deriveSpotlight(trend, ranking, goals, 'Zoya A.');
assert.equal(z.active, 'Zoya A.');
assert.equal(z.rank, null);
assert.equal(z.rankRow, null);
assert.deepEqual(z.totals, { revenue: 900, qty: 10, shipments: 1 });

// A stale/unknown selection must not blank the card.
assert.equal(deriveSpotlight(trend, ranking, goals, 'Nobody').active, 'Ramesh K.');

// Empty payload (no dispatches in range) must not throw.
const empty = deriveSpotlight([], [], [], null);
assert.deepEqual(empty.roster, []);
assert.equal(empty.active, null);
assert.deepEqual(empty.totals, { revenue: 0, qty: 0, shipments: 0 });
assert.deepEqual(deriveSpotlight(null, null, null, null).roster, []);

console.log('check-spotlight: all assertions passed');
