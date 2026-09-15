// Run: node lib/stock-inbound-trips.test.mjs
//
// Guards the two decisions that move money: which old shipments the backfill
// merges into one truck (and so how much freight it deletes from the books),
// and which trip a purchase lands on when it is saved.
import assert from 'node:assert/strict';
import { chooseTripAction, normalizePlate, parseFreight, planTripBackfill } from './stock-inbound-trips.mjs';

// --- plate matching -----------------------------------------------------------
// Same truck however it was typed. Must match the plate_key generated column.
assert.equal(normalizePlate('RJ 14 GQ 2253'), 'RJ14GQ2253');
assert.equal(normalizePlate('rj-14-gq-2253 '), 'RJ14GQ2253');
assert.equal(normalizePlate(null), '');

// --- freight parsing ----------------------------------------------------------
// Bag and stone forms send the legacy names. Labour must be read from laborCost,
// or a changed labour cost is silently dropped - the bug this replaced.
assert.deepEqual(parseFreight({ transportCost: '1500', laborCost: '200' }), { deliveryCost: 1500, unloadingLabourCost: 200 });
assert.deepEqual(parseFreight({ deliveryCost: 0, unloadingLabourCost: 0 }), { deliveryCost: 0, unloadingLabourCost: 0 });
// Absent is not zero: an update that never mentions freight must not wipe it.
assert.deepEqual(parseFreight({}), { deliveryCost: null, unloadingLabourCost: null });

// --- backfill -----------------------------------------------------------------
const row = (id, over = {}) => ({
  id, plate: 'RJ 14 GQ 2253', driver: 'Tinku', arrivalDate: '2026-04-25', status: 'submitted',
  deliveryCost: 156465, unloadingLabourCost: 6200, ...over,
});

// Four invoices, one lorry charge keyed on each: one trip, charge kept once,
// three copies removed.
{
  const trips = planTripBackfill([row(83), row(84), row(85), row(86)]);
  assert.equal(trips.length, 1);
  assert.deepEqual(trips[0].shipmentIds, [83, 84, 85, 86]);
  assert.equal(trips[0].deliveryCost, 156465);
  assert.equal(trips[0].removedFreight, 3 * (156465 + 6200));
}

// Plate typed differently on one invoice is still the same truck.
{
  const trips = planTripBackfill([row(1), row(2, { plate: 'rj14gq2253' })]);
  assert.equal(trips.length, 1);
}

// Freight keyed on the first invoice only, zero on the rest: already correct.
// Merge them, remove nothing.
{
  const trips = planTripBackfill([row(1), row(2, { deliveryCost: 0, unloadingLabourCost: 0 })]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].removedFreight, 0);
  assert.equal(trips[0].deliveryCost, 156465);
}

// Two different figures could be two real charges. Nothing is merged and
// nothing is removed.
{
  const trips = planTripBackfill([row(1), row(2, { deliveryCost: 42000 })]);
  assert.equal(trips.length, 2);
  assert.equal(trips.reduce((s, t) => s + t.removedFreight, 0), 0);
}

// Same plate on a different day, or a different driver, is a different trip.
assert.equal(planTripBackfill([row(1), row(2, { arrivalDate: '2026-04-26' })]).length, 2);
assert.equal(planTripBackfill([row(1), row(2, { driver: 'Sajeed' })]).length, 2);

// No plate: nothing says these shared a truck. Cancelled: not a real delivery.
assert.equal(planTripBackfill([row(1, { plate: '' }), row(2, { plate: '' })]).length, 2);
assert.equal(planTripBackfill([row(1), row(2, { status: 'cancelled' })]).length, 2);

// Every shipment lands on exactly one trip, and freight is conserved:
// what the trips carry plus what was removed equals what was booked.
{
  const input = [row(1), row(2), row(3, { deliveryCost: 9000 }), row(4, { plate: '' }), row(5, { arrivalDate: '2026-05-01' }), row(6, { arrivalDate: '2026-05-01' })];
  const trips = planTripBackfill(input);
  const ids = trips.flatMap((t) => t.shipmentIds).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6]);
  const booked = input.reduce((s, r) => s + r.deliveryCost + r.unloadingLabourCost, 0);
  const carried = trips.reduce((s, t) => s + t.deliveryCost + t.unloadingLabourCost + t.removedFreight, 0);
  assert.equal(carried, booked);
}

// --- trip choice on save --------------------------------------------------------
// Picked an existing trip: join it.
assert.deepEqual(chooseTripAction({ hasTripKey: true, requestedTripId: 7, currentTripId: null, currentTripHasOthers: false }), { kind: 'join', tripId: 7 });
// An old client that never sends tripId must not split a purchase off its truck.
assert.deepEqual(chooseTripAction({ hasTripKey: false, requestedTripId: null, currentTripId: 7, currentTripHasOthers: true }), { kind: 'join', tripId: 7 });
// "Separate trip" while sharing a truck: start a new one, leave the others alone.
assert.deepEqual(chooseTripAction({ hasTripKey: true, requestedTripId: null, currentTripId: 7, currentTripHasOthers: true }), { kind: 'new' });
// "Separate trip" while already alone: edit that trip instead of making another.
assert.deepEqual(chooseTripAction({ hasTripKey: true, requestedTripId: null, currentTripId: 7, currentTripHasOthers: false }), { kind: 'edit', tripId: 7 });
// A brand new purchase with no trip picked.
assert.deepEqual(chooseTripAction({ hasTripKey: true, requestedTripId: null, currentTripId: null, currentTripHasOthers: false }), { kind: 'new' });

console.log('stock-inbound-trips: ok');
