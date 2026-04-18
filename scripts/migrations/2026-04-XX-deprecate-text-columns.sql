-- ============================================================
-- Migration: Phase 6 — Mark deprecated text columns
-- SAFE: only adds comments. Does NOT drop anything.
--
-- Apply after:
--   - Phase 1 (add FK columns)
--   - Phase 2 (backfill FKs)
--   - Phase 3 (API write paths updated)
--   - Phase 4 (read paths updated)
--
-- After applying this, wait 7+ days before Phase 7 (drop).
-- ============================================================

BEGIN;

-- stock_inbound_shipments
COMMENT ON COLUMN stock_inbound_shipments.customer_name      IS 'DEPRECATED_2026-04-19: use customer_id FK → stock_customers';
COMMENT ON COLUMN stock_inbound_shipments.customer_phone     IS 'DEPRECATED_2026-04-19: use customer_id FK → stock_customers.phone';
COMMENT ON COLUMN stock_inbound_shipments.salesperson_name   IS 'DEPRECATED_2026-04-19: use salesperson_id FK → stock_sales_people';
COMMENT ON COLUMN stock_inbound_shipments.salesperson_phone  IS 'DEPRECATED_2026-04-19: use salesperson_id FK → stock_sales_people.phone';
COMMENT ON COLUMN stock_inbound_shipments.destination_warehouse_name IS 'DEPRECATED_2026-04-19: use destination_location_id FK → stock_locations';
COMMENT ON COLUMN stock_inbound_shipments.driver_name        IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_name (will be renamed to driver_name_snapshot)';
COMMENT ON COLUMN stock_inbound_shipments.driver_phone       IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_phone (will be renamed to driver_phone_snapshot)';
COMMENT ON COLUMN stock_inbound_shipments.truck_license_plate IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_license_plate_snapshot)';
COMMENT ON COLUMN stock_inbound_shipments.truck_number        IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_number_snapshot)';

-- stock_outbound_shipments
COMMENT ON COLUMN stock_outbound_shipments.customer_name     IS 'DEPRECATED_2026-04-19: use customer_id FK → stock_customers';
COMMENT ON COLUMN stock_outbound_shipments.customer_phone    IS 'DEPRECATED_2026-04-19: use customer_id FK → stock_customers.phone';
COMMENT ON COLUMN stock_outbound_shipments.salesperson_name  IS 'DEPRECATED_2026-04-19: use salesperson_id FK → stock_sales_people';
COMMENT ON COLUMN stock_outbound_shipments.salesperson_phone IS 'DEPRECATED_2026-04-19: use salesperson_id FK → stock_sales_people.phone';
COMMENT ON COLUMN stock_outbound_shipments.driver_name       IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_name (will be renamed to driver_name_snapshot)';
COMMENT ON COLUMN stock_outbound_shipments.driver_phone      IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.driver_phone (will be renamed to driver_phone_snapshot)';
COMMENT ON COLUMN stock_outbound_shipments.truck_license_plate IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_license_plate_snapshot)';
COMMENT ON COLUMN stock_outbound_shipments.truck_number       IS 'DEPRECATED_2026-04-19: use vehicle_id FK → stock_vehicles.vehicle_number (will be renamed to truck_number_snapshot)';

-- stock_sales_orders
COMMENT ON COLUMN stock_sales_orders.sales_person IS 'DEPRECATED_2026-04-19: use salesperson_id FK → stock_sales_people';

COMMIT;
