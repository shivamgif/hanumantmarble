-- ============================================================
-- Migration: 2026-04-19 — Add FK columns for normalization
-- Phase 1 of the schema denormalization fix.
--
-- SAFE: purely additive — only adds nullable columns and indexes.
-- Existing data is NOT touched in this migration.
-- Run AFTER this: 2026-04-19-backfill-normalization-fks.sql
-- ============================================================

BEGIN;

-- ── Group A: customer_id on inbound shipments ────────────────────────
-- stock_inbound_shipments had customer_name/customer_phone but no FK
ALTER TABLE stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES stock_customers(id);

-- ── Group A: customer_id on outbound shipments ───────────────────────
-- stock_outbound_shipments had customer_name/customer_phone but no FK at all
ALTER TABLE stock_outbound_shipments
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES stock_customers(id);

-- ── Group B: salesperson_id on inbound shipments ─────────────────────
ALTER TABLE stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS salesperson_id BIGINT REFERENCES stock_sales_people(id);

-- ── Group B: salesperson_id on outbound shipments ────────────────────
ALTER TABLE stock_outbound_shipments
  ADD COLUMN IF NOT EXISTS salesperson_id BIGINT REFERENCES stock_sales_people(id);

-- ── Group B: salesperson_id on sales orders ──────────────────────────
-- stock_sales_orders had sales_person TEXT but no FK
ALTER TABLE stock_sales_orders
  ADD COLUMN IF NOT EXISTS salesperson_id BIGINT REFERENCES stock_sales_people(id);

-- ── Group D: destination_location_id on inbound shipments ────────────
-- Replaces destination_warehouse_name TEXT
ALTER TABLE stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS destination_location_id BIGINT REFERENCES stock_locations(id);

-- ── Phase 8: Indexes on new FK columns ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_customer_id
  ON stock_inbound_shipments(customer_id);

CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_salesperson_id
  ON stock_inbound_shipments(salesperson_id);

CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_dest_loc_id
  ON stock_inbound_shipments(destination_location_id);

CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipments_customer_id
  ON stock_outbound_shipments(customer_id);

CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipments_salesperson_id
  ON stock_outbound_shipments(salesperson_id);

CREATE INDEX IF NOT EXISTS idx_stock_sales_orders_salesperson_id
  ON stock_sales_orders(salesperson_id);

COMMIT;
