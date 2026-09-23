// Run: node lib/stock-inbound-trips.test.mjs
//
// Guards the decisions that move money: which old shipments the backfill merges
// into one truck (and so how much freight it deletes from the books), which trip
// a purchase lands on when it is saved, and whether a save is allowed to charge
// a lorry that already has freight recorded for that day.
import assert from 'node:assert/strict';
import {
  assignShipmentToTrip,
  chooseTripAction,
  findDuplicateTripCandidates,
  normalizePlate,
  parseFreight,
  planTripBackfill,
  saysSeparateTrip,
} from './stock-inbound-trips.mjs';

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

// --- the duplicate guard --------------------------------------------------------
// The last gate before a lorry is charged twice. Every helper here takes `q`, so a
// fake one is enough to walk the branches without a database.
const SHIPMENT = {
  trip_id: null,
  arrival_date: '2026-09-15',
  plate: 'RJ 10 GC 0916',
  driver: 'UNKNOWN',
  transporter_id: 54,
};
const EXISTING_TRIP = {
  id: 179,
  arrival_date: '2026-09-15',
  truck_license_plate: 'RJ 10 GC 0916',
  driver_name: 'UNKNOWN',
  delivery_cost: 182160,
  unloading_labour_cost: 5500,
};

// `trips` is what the truck already has; the fake answers each query by shape and
// records the writes, so a test can assert that nothing was inserted.
function fakeQ({ shipment = SHIPMENT, trips = [] } = {}) {
  const calls = [];
  const q = async (text, params) => {
    calls.push({ text, params });
    if (text.includes('FROM stock_inbound_shipments\n      WHERE id =')) return [shipment];
    if (text.includes('FROM stock_inbound_trips t\n      WHERE t.plate_key =')) return trips;
    if (text.includes('WHERE trip_id = $1 AND id <> $2')) return [];
    if (text.includes('INSERT INTO stock_inbound_trips')) return [{ id: 999 }];
    if (text.includes('UPDATE stock_inbound_trips')) return [{ id: params[0] }];
    return [];
  };
  q.calls = calls;
  q.inserted = () => calls.some((c) => c.text.includes('INSERT INTO stock_inbound_trips'));
  return q;
}

// The case that cost Rs 1,87,660 twice: a second invoice off a truck that already
// has a trip, saved with no answer to the picker. Refused, and the refusal carries
// the trip so the form can name it.
const guarded = fakeQ({ trips: [EXISTING_TRIP] });
await assert.rejects(
  () => assignShipmentToTrip(guarded, { shipmentId: 312, body: { tripId: '' } }),
  (error) => {
    assert.equal(error.statusCode, 409);
    assert.deepEqual(error.trips, [EXISTING_TRIP]);
    return true;
  }
);
assert.equal(guarded.inserted(), false, 'a refused save must not leave a trip behind');

// Separate is still allowed - two real deliveries by one lorry happen - but only
// when the save says so. Both spellings of the acknowledgement work.
const viaChoice = fakeQ({ trips: [EXISTING_TRIP] });
assert.equal(await assignShipmentToTrip(viaChoice, { shipmentId: 312, body: { tripId: '', tripChoice: 'separate' } }), 999);
const viaFlag = fakeQ({ trips: [EXISTING_TRIP] });
assert.equal(await assignShipmentToTrip(viaFlag, { shipmentId: 312, body: { tripId: '', separateTripConfirmed: true } }), 999);
assert.equal(saysSeparateTrip({ tripChoice: 'none' }), false, 'no trip to share is not an acknowledgement');
assert.equal(saysSeparateTrip({}), false);

// A truck with nothing recorded that day is the ordinary case and must not be
// slowed down by the guard.
const firstOfTheDay = fakeQ({ trips: [] });
assert.equal(await assignShipmentToTrip(firstOfTheDay, { shipmentId: 312, body: { tripId: '' } }), 999);

// Joining a trip adds no charge, so it is never guarded - including for the old
// client that sends no tripId at all and must stay on its truck.
const joining = fakeQ({ trips: [EXISTING_TRIP] });
assert.equal(await assignShipmentToTrip(joining, { shipmentId: 312, body: { tripId: '179' } }), 179);
const oldClient = fakeQ({ shipment: { ...SHIPMENT, trip_id: 179 }, trips: [EXISTING_TRIP] });
assert.equal(await assignShipmentToTrip(oldClient, { shipmentId: 312, body: {} }), 179);
assert.equal(oldClient.inserted(), false);

// Editing the trip this purchase is alone on cannot double anything either.
const alone = fakeQ({ shipment: { ...SHIPMENT, trip_id: 179 }, trips: [EXISTING_TRIP] });
assert.equal(await assignShipmentToTrip(alone, { shipmentId: 312, body: { tripId: '' } }), 179);
assert.equal(alone.inserted(), false);

// A plate too short to identify a truck matches half the fleet: say nothing
// rather than block every save that has not got to the plate yet.
const noPlate = fakeQ({ shipment: { ...SHIPMENT, plate: 'RJ' }, trips: [EXISTING_TRIP] });
assert.equal(await assignShipmentToTrip(noPlate, { shipmentId: 312, body: { tripId: '' } }), 999);
assert.deepEqual(await findDuplicateTripCandidates(fakeQ({ trips: [EXISTING_TRIP] }), { plate: 'RJ 10 GC 0916', arrivalDate: null }), []);

console.log('stock-inbound-trips: ok');
