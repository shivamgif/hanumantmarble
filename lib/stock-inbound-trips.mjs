// One truck's delivery, as its own record.
//
// A lorry often arrives carrying several supplier invoices, and each invoice is
// entered as its own inbound shipment. Freight used to live on the shipment, so
// whoever keyed the second invoice keyed the lorry charge again, and the books
// counted one truck two, four, six times over. A trip holds the truck, the
// driver, the date and the freight exactly once; every invoice on that truck
// points at it.
//
// stock_inbound_shipments.delivery_cost / unloading_labour_cost are left in
// place but written as 0 for any shipment on a trip. The trip is the only
// source of freight; nothing may read the shipment columns for money.

// Must agree with the plate_key generated column on stock_inbound_trips:
//   regexp_replace(upper(coalesce(truck_license_plate, '')), '[^A-Z0-9]', '', 'g')
// "RJ 14 GQ 2253", "rj14gq2253" and "RJ-14-GQ-2253" are one truck.
export function normalizePlate(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// Freight from a request body, in either naming convention the three entry
// forms use. null means "not sent", so an update can leave the trip's figure
// alone. Accepting laborCost here is also the fix for bag and stone edits
// silently dropping a changed labour cost: the old update path only fell back
// to the legacy name for transport.
export function parseFreight(body) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = body?.[key];
      if (value != null && value !== '') return toMoney(value);
    }
    return null;
  };
  return {
    deliveryCost: pick('deliveryCost', 'transportCost'),
    unloadingLabourCost: pick('unloadingLabourCost', 'laborCost'),
  };
}

// Groups existing shipments into trips for the one-off backfill.
//
// A trip is one plate, one driver, one arrival date. Within such a group:
//   - at most one distinct non-zero freight figure means the figure was copied
//     onto each invoice, so the group becomes one trip carrying it once;
//   - two or more distinct figures cannot be told apart from genuinely separate
//     charges, so every shipment keeps its own trip and its own freight.
// Cancelled shipments and shipments with no plate are never merged: there is
// nothing to say they shared a truck.
//
// Input rows: { id, plate, driver, arrivalDate: 'YYYY-MM-DD', status,
// deliveryCost, unloadingLabourCost }. Returns trips with the shipment ids that
// belong to each and the freight the merge removes from the books.
export function planTripBackfill(rows) {
  const trips = [];
  const single = (row) => ({
    arrivalDate: row.arrivalDate,
    plate: row.plate || null,
    driver: row.driver || null,
    transporterId: row.transporterId ?? null,
    deliveryCost: toMoney(row.deliveryCost),
    unloadingLabourCost: toMoney(row.unloadingLabourCost),
    shipmentIds: [row.id],
    removedFreight: 0,
  });

  const groups = new Map();
  for (const row of rows) {
    const plateKey = normalizePlate(row.plate);
    if (!plateKey || row.status === 'cancelled') {
      trips.push(single(row));
      continue;
    }
    const key = `${plateKey}|${String(row.driver ?? '').trim().toLowerCase()}|${row.arrivalDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  for (const members of groups.values()) {
    const charged = members.filter((m) => toMoney(m.deliveryCost) + toMoney(m.unloadingLabourCost) > 0);
    const figures = new Set(charged.map((m) => `${toMoney(m.deliveryCost)}|${toMoney(m.unloadingLabourCost)}`));

    if (members.length === 1 || figures.size > 1) {
      for (const m of members) trips.push(single(m));
      continue;
    }

    // Earliest shipment names the trip; its freight is the one kept.
    const ordered = [...members].sort((a, b) => Number(a.id) - Number(b.id));
    const carrier = charged.sort((a, b) => Number(a.id) - Number(b.id))[0] ?? ordered[0];
    const kept = toMoney(carrier.deliveryCost) + toMoney(carrier.unloadingLabourCost);
    const booked = members.reduce((sum, m) => sum + toMoney(m.deliveryCost) + toMoney(m.unloadingLabourCost), 0);
    trips.push({
      ...single(ordered[0]),
      transporterId: carrier.transporterId ?? ordered[0].transporterId ?? null,
      deliveryCost: toMoney(carrier.deliveryCost),
      unloadingLabourCost: toMoney(carrier.unloadingLabourCost),
      shipmentIds: ordered.map((m) => m.id),
      removedFreight: toMoney(booked - kept),
    });
  }

  return trips;
}

// --- Database -----------------------------------------------------------------
// Every helper takes `q`, the sql(query, params) function or a transaction's,
// so a route can run them inside withTransaction or without it.

export async function findTrip(q, tripId) {
  const rows = await q(`SELECT id FROM stock_inbound_trips WHERE id = $1`, [tripId]);
  return rows[0] || null;
}

async function insertTrip(q, identity, freight) {
  const rows = await q(
    `INSERT INTO stock_inbound_trips
       (arrival_date, truck_license_plate, driver_name, transporter_id, delivery_cost, unloading_labour_cost)
     VALUES (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      identity.arrivalDate || null,
      identity.plate || null,
      identity.driver || null,
      identity.transporterId || null,
      freight.deliveryCost ?? 0,
      freight.unloadingLabourCost ?? 0,
    ]
  );
  return rows[0].id;
}

async function updateTripFreight(q, tripId, freight) {
  const rows = await q(
    `UPDATE stock_inbound_trips
        SET delivery_cost = COALESCE($2::numeric, delivery_cost),
            unloading_labour_cost = COALESCE($3::numeric, unloading_labour_cost),
            updated_at = NOW()
      WHERE id = $1
      RETURNING id`,
    [tripId, freight.deliveryCost, freight.unloadingLabourCost]
  );
  if (!rows[0]) {
    const error = new Error('That truck trip no longer exists. Pick the trip again.');
    error.statusCode = 409;
    throw error;
  }
}

async function updateTripInPlace(q, tripId, identity, freight) {
  await q(
    `UPDATE stock_inbound_trips
        SET arrival_date = COALESCE($2::date, arrival_date),
            truck_license_plate = COALESCE($3, truck_license_plate),
            driver_name = COALESCE($4, driver_name),
            transporter_id = COALESCE($5, transporter_id),
            delivery_cost = COALESCE($6::numeric, delivery_cost),
            unloading_labour_cost = COALESCE($7::numeric, unloading_labour_cost),
            updated_at = NOW()
      WHERE id = $1`,
    [
      tripId,
      identity.arrivalDate || null,
      identity.plate || null,
      identity.driver || null,
      identity.transporterId || null,
      freight.deliveryCost,
      freight.unloadingLabourCost,
    ]
  );
}

// Decides which trip a shipment belongs to after a save, and puts it there.
//
//   hasTripKey && requestedTripId  join (or stay on) that trip; its freight
//                                  becomes what the form sent, for every
//                                  invoice on the truck
//   !hasTripKey && currentTripId   a caller that predates trips: stay put
//   no trip requested, and the     "separate trip" chosen while already alone
//   shipment is alone on its trip  on one: edit that trip rather than churn ids
//   otherwise                      start a new trip
//
// hasTripKey separates "the form said no trip" from "the caller never heard of
// trips", so an old client editing a purchase cannot split it off its truck.
export function chooseTripAction({ hasTripKey, requestedTripId, currentTripId, currentTripHasOthers }) {
  if (hasTripKey && requestedTripId) return { kind: 'join', tripId: requestedTripId };
  if (!hasTripKey && currentTripId) return { kind: 'join', tripId: currentTripId };
  if (currentTripId && !currentTripHasOthers) return { kind: 'edit', tripId: currentTripId };
  return { kind: 'new' };
}

// Call after the shipment row is saved. The truck, driver and date for a new
// trip are read back from that row in SQL, as text, rather than passed in: a
// JS Date from RETURNING * can land a day early once it is cast back to date.
export async function assignShipmentToTrip(q, { shipmentId, body }) {
  const hasTripKey = Object.prototype.hasOwnProperty.call(body ?? {}, 'tripId');
  const requestedTripId = hasTripKey && body.tripId ? Number(body.tripId) : null;
  const freight = parseFreight(body);

  const current = await q(
    `SELECT trip_id,
            arrival_date::date::text AS arrival_date,
            truck_license_plate_snapshot AS plate,
            driver_name_snapshot AS driver,
            transporter_id
       FROM stock_inbound_shipments
      WHERE id = $1`,
    [shipmentId]
  );
  const shipment = current[0];
  if (!shipment) throw new Error(`Inbound shipment ${shipmentId} not found`);
  const currentTripId = shipment.trip_id ? Number(shipment.trip_id) : null;
  const identity = {
    arrivalDate: shipment.arrival_date,
    plate: shipment.plate,
    driver: shipment.driver,
    transporterId: shipment.transporter_id,
  };
  const others = currentTripId
    ? await q(
        `SELECT 1 FROM stock_inbound_shipments WHERE trip_id = $1 AND id <> $2 LIMIT 1`,
        [currentTripId, shipmentId]
      )
    : [];

  const action = chooseTripAction({
    hasTripKey,
    requestedTripId,
    currentTripId,
    currentTripHasOthers: others.length > 0,
  });

  let tripId;
  if (action.kind === 'join') {
    tripId = action.tripId;
    await updateTripFreight(q, tripId, freight);
  } else if (action.kind === 'edit') {
    tripId = action.tripId;
    await updateTripInPlace(q, tripId, identity, freight);
  } else {
    tripId = await insertTrip(q, identity, freight);
  }

  await q(
    `UPDATE stock_inbound_shipments
        SET trip_id = $1, delivery_cost = 0, unloading_labour_cost = 0
      WHERE id = $2`,
    [tripId, shipmentId]
  );

  if (currentTripId && currentTripId !== tripId) {
    await deleteTripIfEmpty(q, currentTripId);
  }
  return tripId;
}

// A trip with no shipments is freight with nothing to charge it to.
export async function deleteTripIfEmpty(q, tripId) {
  if (!tripId) return;
  await q(
    `DELETE FROM stock_inbound_trips t
      WHERE t.id = $1
        AND NOT EXISTS (SELECT 1 FROM stock_inbound_shipments s WHERE s.trip_id = t.id)`,
    [tripId]
  );
}
