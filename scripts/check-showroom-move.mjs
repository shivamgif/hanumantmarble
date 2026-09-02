// Asserts the warehouse <-> showroom move arithmetic, the cassette/installed
// state split, and the shortage hint.
// Run: node scripts/check-showroom-move.mjs
//
// No DB: the SQL side is protected by its own `WHERE col >= $1` guards and a
// subset CHECK constraint, so what is worth checking here is which column each
// move touches, in which direction, and how quantity is coerced per unit.
import assert from 'node:assert/strict';
import {
  resolveShowroomMove, showroomMoveKey, showroomSplit, showroomHint, SHOWROOM_MOVES,
} from '../lib/stock-showroom.js';

const move = (key, unit = 'box', qty = 1) =>
  resolveShowroomMove({ move: key, unitOfMeasure: unit, qty });

// ---- the radio collapses to a move key ----
assert.equal(showroomMoveKey('to_showroom', 'cassette'), 'to_cassette');
assert.equal(showroomMoveKey('to_showroom', 'installed'), 'to_installed');
assert.equal(showroomMoveKey('reclassify', 'installed'), 'reclassify_installed');
assert.equal(showroomMoveKey('reclassify', 'cassette'), 'reclassify_cassette');
assert.equal(showroomMoveKey('to_warehouse'), 'to_warehouse');
// An unknown state must not silently fall through to a valid move.
assert.equal(SHOWROOM_MOVES[showroomMoveKey('to_showroom', 'nonsense')], SHOWROOM_MOVES.to_cassette,
  'unknown state defaults to cassette, the safe/sellable one');
assert.equal(move('nonsense'), null);

// ---- sending to the showroom leaves the warehouse either way ----
const cassette = move('to_cassette', 'box', 5);
assert.equal(cassette.warehouseSign, -1);
assert.equal(cassette.showroomSign, +1);
assert.equal(cassette.installedSign, 0, 'cassette stock is not installed');
assert.equal(cassette.qty, 5);
assert.equal(cassette.sourceType, 'showroom_to_cassette');

const installedOut = move('to_installed', 'box', 5);
assert.equal(installedOut.warehouseSign, -1);
assert.equal(installedOut.showroomSign, +1);
assert.equal(installedOut.installedSign, +1, 'also lands in the installed subset');
assert.equal(installedOut.sourceType, 'showroom_to_installed');

// ---- reclassify moves between states without changing the showroom total ----
for (const key of ['reclassify_installed', 'reclassify_cassette']) {
  const m = move(key);
  assert.equal(m.warehouseSign, 0, `${key} must not touch the warehouse`);
  assert.equal(m.showroomSign, 0, `${key} must not change the showroom total`);
}
assert.equal(move('reclassify_installed').installedSign, +1);
assert.equal(move('reclassify_cassette').installedSign, -1, 'installed is reversible — the whole point');

// ---- coming back only affects the total ----
const back = move('to_warehouse', 'box', 2);
assert.equal(back.warehouseSign, +1);
assert.equal(back.showroomSign, -1);
assert.equal(back.installedSign, 0);

// ---- stone is fractional and rides the sqft columns ----
const stone = move('to_cassette', 'sqft', '12.5');
assert.equal(stone.isStone, true);
assert.equal(stone.warehouseColumn, 'current_sqft');
assert.equal(stone.showroomColumn, 'showroom_sqft');
assert.equal(stone.installedColumn, 'showroom_installed_sqft');
assert.equal(stone.qty, 12.5, 'sqft must stay fractional');
// NUMERIC(14,3): rounded on write so repeated sums cannot drift.
assert.equal(move('to_installed', 'sqft', '0.12345').qty, 0.123);

// ---- bags reuse the whole-qty columns but read as bags ----
assert.equal(move('to_cassette', 'bag', 4).warehouseColumn, 'current_whole_qty');
assert.equal(move('to_cassette', 'bag', 4).unit, 'bags');

// ---- bad input yields qty 0, which the route rejects before touching stock ----
// Called directly, not through the `move` helper — its default parameter would
// swallow an `undefined` qty and hide the case being tested.
for (const bad of ['', null, undefined, 0, -3, 'abc', NaN, {}]) {
  const resolved = resolveShowroomMove({ move: 'to_cassette', unitOfMeasure: 'box', qty: bad });
  assert.equal(resolved.qty, 0, `rejects ${String(bad)}`);
}
assert.equal(move('to_cassette', 'box', 2.5).qty, 0, 'no half boxes');

// Every declared move must resolve — a typo in the table is a silent 400.
for (const key of Object.keys(SHOWROOM_MOVES)) {
  assert.ok(move(key), key);
}

// ---- the read-side split ----
const tiles = showroomSplit({ unit_of_measure: 'box', showroom_whole_qty: 20, showroom_installed_whole_qty: 8 });
assert.deepEqual([tiles.total, tiles.cassette, tiles.installed], [20, 12, 8]);
assert.equal(tiles.unit, 'box');
// NUMERIC comes back from pg as a string — it must not be concatenated as one.
const slabs = showroomSplit({ unit_of_measure: 'sqft', showroom_sqft: '30.500', showroom_installed_sqft: '10.250' });
assert.deepEqual([slabs.total, slabs.cassette, slabs.installed], [30.5, 20.25, 10.25]);
assert.equal(showroomSplit({}).total, 0, 'missing columns read as zero, not NaN');
assert.equal(showroomSplit(null).cassette, 0);

// ---- the shortage hint counts only sellable (cassette) stock ----
assert.equal(showroomHint(null), '');
assert.equal(showroomHint({ unit_of_measure: 'box', showroom_whole_qty: 0 }), '', 'silent when nothing is on display');
assert.match(showroomHint({ unit_of_measure: 'box', showroom_whole_qty: 4 }), /4 box is on display/);
assert.match(showroomHint({ unit_of_measure: 'bag', showroom_whole_qty: 2 }), /2 bags/);
assert.match(showroomHint({ unit_of_measure: 'sqft', showroom_sqft: '30.500' }), /30\.5 sqft/);
// Stock that is entirely stuck to a floor is not an option for a dispatch.
assert.equal(
  showroomHint({ unit_of_measure: 'box', showroom_whole_qty: 6, showroom_installed_whole_qty: 6 }),
  '',
  'fully installed stock must not be offered as available'
);
assert.match(
  showroomHint({ unit_of_measure: 'box', showroom_whole_qty: 6, showroom_installed_whole_qty: 4 }),
  /2 box is on display/,
  'only the cassette portion is offered'
);

console.log('check-showroom-move: all assertions passed');
