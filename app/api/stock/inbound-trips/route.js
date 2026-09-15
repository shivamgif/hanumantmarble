import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { normalizePlate } from '@/lib/stock-inbound-trips.mjs';

// How far either side of the entered date a trip still counts as "this truck".
// Invoices on one lorry are not always dated the day it arrives, and bag and
// stone purchases are stamped with the entry date rather than the invoice date.
const TRIP_WINDOW_DAYS = 3;

// Trips this truck already made around a date, so the purchase form can offer
// "add this invoice to that trip" before a second freight figure is keyed.
//   GET /api/stock/inbound-trips?plate=RJ14GQ2253&date=2026-04-25
export async function GET(request) {
  const { session } = await getStockContext(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ trips: [] }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const plateKey = normalizePlate(searchParams.get('plate'));
  const date = searchParams.get('date');

  // A plate this short matches half the fleet; say nothing rather than guess.
  if (plateKey.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return NextResponse.json({ trips: [] });
  }

  const caps = await getStockSchemaCapabilities();
  if (!caps.hasInboundTrips) {
    return NextResponse.json({ trips: [] });
  }

  try {
    const trips = await sql(
      `SELECT
         t.id,
         t.arrival_date::text AS arrival_date,
         t.truck_license_plate,
         t.driver_name,
         t.delivery_cost,
         t.unloading_labour_cost,
         -- One lorry comes from one city to one warehouse, so joining its trip
         -- fills these too. Taken from the trip's earliest invoice that has them.
         (SELECT o.origin_city
            FROM stock_inbound_shipments o
           WHERE o.trip_id = t.id AND o.status <> 'cancelled'
             AND NULLIF(TRIM(o.origin_city), '') IS NOT NULL
           ORDER BY o.id LIMIT 1) AS origin_city,
         (SELECT COALESCE(loc.name, o.destination_warehouse_name)
            FROM stock_inbound_shipments o
            LEFT JOIN stock_locations loc ON loc.id = o.destination_location_id
           WHERE o.trip_id = t.id AND o.status <> 'cancelled'
             AND COALESCE(loc.name, NULLIF(TRIM(o.destination_warehouse_name), '')) IS NOT NULL
           ORDER BY o.id LIMIT 1) AS destination_warehouse_name,
         -- The lorry's weight, keyed on each of its invoices.
         (SELECT o.freight_weight_kg
            FROM stock_inbound_shipments o
           WHERE o.trip_id = t.id AND o.status <> 'cancelled'
             AND o.freight_weight_kg > 0
           ORDER BY o.id LIMIT 1) AS freight_weight_kg,
         JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'id', s.id,
             'shipment_number', s.shipment_number,
             'invoice_number', s.invoice_number,
             'supplier', sup.name
           ) ORDER BY s.id
         ) AS shipments
       FROM stock_inbound_trips t
       JOIN stock_inbound_shipments s ON s.trip_id = t.id AND s.status <> 'cancelled'
       LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
       WHERE t.plate_key = $1
         AND t.arrival_date BETWEEN $2::date - $3::int AND $2::date + $3::int
       GROUP BY t.id
       ORDER BY ABS(t.arrival_date - $2::date), t.id DESC
       LIMIT 5`,
      [plateKey, date, TRIP_WINDOW_DAYS]
    );
    return NextResponse.json({ trips });
  } catch (error) {
    console.error('Failed to load inbound trips:', error);
    return NextResponse.json({ error: 'Failed to load truck trips', detail: error.message }, { status: 500 });
  }
}
