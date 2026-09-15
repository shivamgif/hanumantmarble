#!/usr/bin/env node
/**
 * Truck trips for inbound purchases, and the correction of freight counted
 * more than once.
 *
 * One lorry often carries several supplier invoices. Each invoice was entered
 * as its own inbound shipment with the lorry's freight keyed again, so the same
 * charge landed in the books once per invoice. This adds stock_inbound_trips,
 * which holds the truck, driver, date and freight exactly once, and points every
 * shipment at one.
 *
 * Existing shipments are grouped by plate + driver + arrival date. A group whose
 * shipments all carry the same freight figure (or zero) becomes one trip that
 * carries it once. A group with two or more different figures is left as one
 * trip per shipment, because two real charges look exactly like that. The rules
 * live in planTripBackfill() in lib/stock-inbound-trips.mjs and are tested there.
 *
 * Freight moves onto the trip and the shipment columns are set to 0. Before
 * that, every original figure is copied into stock_inbound_freight_backup, so
 * the correction can be reviewed and reversed shipment by shipment.
 *
 * DRY RUN BY DEFAULT: prints every merge and the rupees it would remove, writes
 * nothing. Pass --apply to write. Idempotent: only shipments with no trip are
 * processed, so a second run is a no-op, and a run after old code has created
 * more shipments picks up only those.
 *
 *   npm run db:migrate-inbound-trips             # dry run, local database
 *   npm run db:migrate-inbound-trips -- --apply  # write, local database
 *   npm run db:migrate:prod -- scripts/migrate-inbound-trips.mjs [--apply]
 *
 * Local and production are different Neon databases. The target host is
 * printed first; check it before passing --apply.
 */

import { Pool } from '@neondatabase/serverless';
import { planTripBackfill } from '../lib/stock-inbound-trips.mjs';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const inr = (n) => `Rs ${Math.round(Number(n)).toLocaleString('en-IN')}`;

const DDL = [
  `CREATE TABLE IF NOT EXISTS stock_inbound_trips (
     id BIGSERIAL PRIMARY KEY,
     arrival_date DATE NOT NULL DEFAULT CURRENT_DATE,
     truck_license_plate TEXT,
     -- Matching key: the same truck however its plate was typed. Kept in step
     -- with normalizePlate() in lib/stock-inbound-trips.mjs.
     plate_key TEXT GENERATED ALWAYS AS (
       regexp_replace(upper(coalesce(truck_license_plate, '')), '[^A-Z0-9]', '', 'g')
     ) STORED,
     driver_name TEXT,
     transporter_id BIGINT REFERENCES stock_transporters(id),
     delivery_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (delivery_cost >= 0),
     unloading_labour_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unloading_labour_cost >= 0),
     created_at TIMESTAMP NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMP NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_inbound_trips_plate_date
     ON stock_inbound_trips (plate_key, arrival_date)`,
  `ALTER TABLE stock_inbound_shipments
     ADD COLUMN IF NOT EXISTS trip_id BIGINT REFERENCES stock_inbound_trips(id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_trip_id
     ON stock_inbound_shipments (trip_id)`,
  `CREATE TABLE IF NOT EXISTS stock_inbound_freight_backup (
     shipment_id BIGINT PRIMARY KEY,
     delivery_cost NUMERIC(14, 2),
     unloading_labour_cost NUMERIC(14, 2),
     backed_up_at TIMESTAMP NOT NULL DEFAULT NOW()
   )`,
];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    const host = new URL(DATABASE_URL).host;
    const [{ db }] = (await client.query('SELECT current_database() AS db')).rows;
    console.log(`→ Target: ${host} / ${db}`);
    console.log(APPLY ? '→ Mode: APPLY (writes)' : '→ Mode: DRY RUN (no changes written; pass --apply to write)');

    const { rows: cols } = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stock_inbound_shipments' AND column_name = 'trip_id'`
    );
    const hasTripColumn = cols.length > 0;

    const { rows } = await client.query(
      `SELECT id,
              truck_license_plate_snapshot AS plate,
              driver_name_snapshot AS driver,
              transporter_id AS "transporterId",
              arrival_date::date::text AS "arrivalDate",
              status,
              COALESCE(delivery_cost, 0)::float8 AS "deliveryCost",
              COALESCE(unloading_labour_cost, 0)::float8 AS "unloadingLabourCost"
         FROM stock_inbound_shipments
        ${hasTripColumn ? 'WHERE trip_id IS NULL' : ''}
        ORDER BY id`
    );

    const trips = planTripBackfill(rows);
    const merged = trips.filter((t) => t.shipmentIds.length > 1);
    const removed = trips.reduce((sum, t) => sum + t.removedFreight, 0);
    const booked = rows.reduce((sum, r) => sum + r.deliveryCost + r.unloadingLabourCost, 0);

    console.log(`→ ${rows.length} shipment(s) without a trip → ${trips.length} trip(s), ${merged.length} of them carrying more than one invoice`);
    for (const t of merged.filter((t) => t.removedFreight > 0).sort((a, b) => b.removedFreight - a.removedFreight)) {
      console.log(
        `   ${String(t.plate).padEnd(16)} ${t.arrivalDate}  ${t.shipmentIds.length} invoices  ` +
        `keeps ${inr(t.deliveryCost + t.unloadingLabourCost)}  removes ${inr(t.removedFreight)}  [shipments ${t.shipmentIds.join(', ')}]`
      );
    }
    console.log(`→ Freight booked on these shipments: ${inr(booked)}`);
    console.log(`→ Repeated freight to remove:        ${inr(removed)}`);
    console.log(`→ Freight after correction:          ${inr(booked - removed)}`);

    if (!APPLY) return;
    if (rows.length === 0) {
      console.log('✓ Nothing to do.');
      return;
    }

    await client.query('BEGIN');
    for (const statement of DDL) await client.query(statement);

    await client.query(
      `INSERT INTO stock_inbound_freight_backup (shipment_id, delivery_cost, unloading_labour_cost)
       SELECT id, delivery_cost, unloading_labour_cost
         FROM stock_inbound_shipments
        WHERE id = ANY($1::bigint[])
       ON CONFLICT (shipment_id) DO NOTHING`,
      [rows.map((r) => r.id)]
    );

    for (const trip of trips) {
      const { rows: [inserted] } = await client.query(
        `INSERT INTO stock_inbound_trips
           (arrival_date, truck_license_plate, driver_name, transporter_id, delivery_cost, unloading_labour_cost)
         VALUES ($1::date, $2, $3, $4, $5, $6)
         RETURNING id`,
        [trip.arrivalDate, trip.plate, trip.driver, trip.transporterId, trip.deliveryCost, trip.unloadingLabourCost]
      );
      await client.query(
        `UPDATE stock_inbound_shipments
            SET trip_id = $1, delivery_cost = 0, unloading_labour_cost = 0
          WHERE id = ANY($2::bigint[]) AND trip_id IS NULL`,
        [inserted.id, trip.shipmentIds]
      );
    }

    // Conservation check, in the database rather than in JS: what the new trips
    // carry plus what was removed must equal what the backup holds.
    const { rows: [check] } = await client.query(
      `SELECT
         (SELECT COALESCE(SUM(delivery_cost + unloading_labour_cost), 0) FROM stock_inbound_freight_backup
           WHERE shipment_id = ANY($1::bigint[]))::float8 AS backed_up,
         (SELECT COALESCE(SUM(t.delivery_cost + t.unloading_labour_cost), 0) FROM stock_inbound_trips t
           WHERE EXISTS (SELECT 1 FROM stock_inbound_shipments s WHERE s.trip_id = t.id AND s.id = ANY($1::bigint[])))::float8 AS on_trips,
         (SELECT COUNT(*) FROM stock_inbound_shipments WHERE id = ANY($1::bigint[]) AND trip_id IS NULL)::int AS unassigned`,
      [rows.map((r) => r.id)]
    );
    const drift = Math.abs(check.backed_up - check.on_trips - removed);
    if (check.unassigned > 0 || drift > 0.5) {
      throw new Error(`Check failed: ${check.unassigned} unassigned, backup ${check.backed_up}, trips ${check.on_trips}, removed ${removed}`);
    }

    await client.query('COMMIT');
    console.log(`✓ Applied. ${trips.length} trip(s) created, ${inr(removed)} of repeated freight removed.`);
    console.log('  Original figures are in stock_inbound_freight_backup.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('✗ Migration failed, nothing was written:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
