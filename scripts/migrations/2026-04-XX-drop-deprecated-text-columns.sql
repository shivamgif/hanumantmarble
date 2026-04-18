-- ============================================================
-- Migration: Phase 7 — Physical DROP of deprecated text columns
--
-- ⚠️  DO NOT APPLY UNTIL:
--   1. Phase 6 (deprecation comments) has been in prod for 7+ days
--   2. ALL application queries confirmed to use FK joins (not text cols)
--   3. No errors logged from missing text-column reads
--   4. A full logical backup exists (pg_dump or Neon branch)
--
-- NOTE: driver/truck columns are RENAMED (not dropped) to preserve
-- the dispatch-time snapshot for audit purposes.
-- ============================================================

BEGIN;

-- ── stock_inbound_shipments ───────────────────────────────────────────

-- Drop fully-replaced text columns
ALTER TABLE stock_inbound_shipments DROP COLUMN IF EXISTS customer_name;
ALTER TABLE stock_inbound_shipments DROP COLUMN IF EXISTS customer_phone;
ALTER TABLE stock_inbound_shipments DROP COLUMN IF EXISTS salesperson_name;
ALTER TABLE stock_inbound_shipments DROP COLUMN IF EXISTS salesperson_phone;
ALTER TABLE stock_inbound_shipments DROP COLUMN IF EXISTS destination_warehouse_name;

-- Rename vehicle snapshot columns (preserves audit value)
ALTER TABLE stock_inbound_shipments
  RENAME COLUMN driver_name TO driver_name_snapshot;
ALTER TABLE stock_inbound_shipments
  RENAME COLUMN driver_phone TO driver_phone_snapshot;
ALTER TABLE stock_inbound_shipments
  RENAME COLUMN truck_license_plate TO truck_license_plate_snapshot;
ALTER TABLE stock_inbound_shipments
  RENAME COLUMN truck_number TO truck_number_snapshot;

-- ── stock_outbound_shipments ──────────────────────────────────────────

ALTER TABLE stock_outbound_shipments DROP COLUMN IF EXISTS customer_name;
ALTER TABLE stock_outbound_shipments DROP COLUMN IF EXISTS customer_phone;
ALTER TABLE stock_outbound_shipments DROP COLUMN IF EXISTS salesperson_name;
ALTER TABLE stock_outbound_shipments DROP COLUMN IF EXISTS salesperson_phone;

ALTER TABLE stock_outbound_shipments
  RENAME COLUMN driver_name TO driver_name_snapshot;
ALTER TABLE stock_outbound_shipments
  RENAME COLUMN driver_phone TO driver_phone_snapshot;
ALTER TABLE stock_outbound_shipments
  RENAME COLUMN truck_license_plate TO truck_license_plate_snapshot;
ALTER TABLE stock_outbound_shipments
  RENAME COLUMN truck_number TO truck_number_snapshot;

-- ── stock_sales_orders ────────────────────────────────────────────────
ALTER TABLE stock_sales_orders DROP COLUMN IF EXISTS sales_person;

-- ── stock_items (legacy department column) ────────────────────────────
-- department is fully superseded by division_id → stock_divisions
ALTER TABLE stock_items DROP COLUMN IF EXISTS department;

COMMIT;

-- ── POST-DROP VERIFICATION ────────────────────────────────────────────
-- Run after applying — expected: none of these columns should appear

-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('stock_inbound_shipments','stock_outbound_shipments','stock_sales_orders','stock_items')
--   AND column_name IN (
--     'customer_name','customer_phone','salesperson_name','salesperson_phone',
--     'destination_warehouse_name','sales_person','department'
--   );
--
-- Expected result: 0 rows.
