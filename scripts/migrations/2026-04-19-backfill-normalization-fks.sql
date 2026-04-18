-- ============================================================
-- Migration: 2026-04-19 — Backfill FK columns from text data
-- Phase 2 of the schema denormalization fix.
--
-- PREREQUISITES:
--   1. Run 2026-04-19-add-normalization-fk-columns.sql first.
--   2. Review: stock_customers has no UNIQUE(name) constraint.
--      This migration does case-insensitive deduplication manually.
--      A subsequent migration should add UNIQUE(lower(name)) after cleanup.
--
-- SAFE: only INSERTs new master records and UPDATEs FK columns
-- that are currently NULL. Does not modify existing data.
-- ============================================================

BEGIN;

-- ── STEP 1: Deduplicate and upsert customers from outbound shipments ──
-- Insert only names not yet in stock_customers (case-insensitive match)
INSERT INTO stock_customers (name, phone, is_active)
SELECT DISTINCT ON (lower(trim(customer_name)))
  trim(customer_name) AS name,
  trim(customer_phone) AS phone,
  TRUE
FROM stock_outbound_shipments
WHERE customer_name IS NOT NULL
  AND trim(customer_name) <> ''
  AND customer_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_customers c
    WHERE lower(trim(c.name)) = lower(trim(stock_outbound_shipments.customer_name))
  )
ORDER BY lower(trim(customer_name)), id ASC;

-- Set customer_id FK on outbound shipments via name match
UPDATE stock_outbound_shipments sos
SET customer_id = c.id
FROM stock_customers c
WHERE lower(trim(c.name)) = lower(trim(sos.customer_name))
  AND sos.customer_id IS NULL
  AND sos.customer_name IS NOT NULL
  AND trim(sos.customer_name) <> '';

-- ── STEP 2: Deduplicate and upsert customers from inbound shipments ───
INSERT INTO stock_customers (name, phone, is_active)
SELECT DISTINCT ON (lower(trim(customer_name)))
  trim(customer_name) AS name,
  trim(customer_phone) AS phone,
  TRUE
FROM stock_inbound_shipments
WHERE customer_name IS NOT NULL
  AND trim(customer_name) <> ''
  AND customer_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_customers c
    WHERE lower(trim(c.name)) = lower(trim(stock_inbound_shipments.customer_name))
  )
ORDER BY lower(trim(customer_name)), id ASC;

UPDATE stock_inbound_shipments s
SET customer_id = c.id
FROM stock_customers c
WHERE lower(trim(c.name)) = lower(trim(s.customer_name))
  AND s.customer_id IS NULL
  AND s.customer_name IS NOT NULL
  AND trim(s.customer_name) <> '';

-- ── STEP 3: Upsert salespeople from outbound shipments ────────────────
INSERT INTO stock_sales_people (name, phone, is_active)
SELECT DISTINCT ON (lower(trim(salesperson_name)))
  trim(salesperson_name) AS name,
  trim(salesperson_phone) AS phone,
  TRUE
FROM stock_outbound_shipments
WHERE salesperson_name IS NOT NULL
  AND trim(salesperson_name) <> ''
  AND salesperson_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_sales_people sp
    WHERE lower(trim(sp.name)) = lower(trim(stock_outbound_shipments.salesperson_name))
  )
ORDER BY lower(trim(salesperson_name)), id ASC;

UPDATE stock_outbound_shipments sos
SET salesperson_id = sp.id
FROM stock_sales_people sp
WHERE lower(trim(sp.name)) = lower(trim(sos.salesperson_name))
  AND sos.salesperson_id IS NULL
  AND sos.salesperson_name IS NOT NULL
  AND trim(sos.salesperson_name) <> '';

-- ── STEP 4: Upsert salespeople from inbound shipments ─────────────────
INSERT INTO stock_sales_people (name, phone, is_active)
SELECT DISTINCT ON (lower(trim(salesperson_name)))
  trim(salesperson_name) AS name,
  trim(salesperson_phone) AS phone,
  TRUE
FROM stock_inbound_shipments
WHERE salesperson_name IS NOT NULL
  AND trim(salesperson_name) <> ''
  AND salesperson_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_sales_people sp
    WHERE lower(trim(sp.name)) = lower(trim(stock_inbound_shipments.salesperson_name))
  )
ORDER BY lower(trim(salesperson_name)), id ASC;

UPDATE stock_inbound_shipments s
SET salesperson_id = sp.id
FROM stock_sales_people sp
WHERE lower(trim(sp.name)) = lower(trim(s.salesperson_name))
  AND s.salesperson_id IS NULL
  AND s.salesperson_name IS NOT NULL
  AND trim(s.salesperson_name) <> '';

-- ── STEP 5: Upsert salespeople from sales orders (sales_person TEXT) ──
INSERT INTO stock_sales_people (name, is_active)
SELECT DISTINCT ON (lower(trim(sales_person)))
  trim(sales_person) AS name,
  TRUE
FROM stock_sales_orders
WHERE sales_person IS NOT NULL
  AND trim(sales_person) <> ''
  AND salesperson_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_sales_people sp
    WHERE lower(trim(sp.name)) = lower(trim(stock_sales_orders.sales_person))
  )
ORDER BY lower(trim(sales_person)), id ASC;

UPDATE stock_sales_orders so
SET salesperson_id = sp.id
FROM stock_sales_people sp
WHERE lower(trim(sp.name)) = lower(trim(so.sales_person))
  AND so.salesperson_id IS NULL
  AND so.sales_person IS NOT NULL
  AND trim(so.sales_person) <> '';

-- ── STEP 6: Upsert warehouse locations from inbound shipments ─────────
INSERT INTO stock_locations (name, location_type, is_active)
SELECT DISTINCT ON (lower(trim(destination_warehouse_name)))
  trim(destination_warehouse_name) AS name,
  'warehouse' AS location_type,
  TRUE
FROM stock_inbound_shipments
WHERE destination_warehouse_name IS NOT NULL
  AND trim(destination_warehouse_name) <> ''
  AND destination_location_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_locations l
    WHERE lower(trim(l.name)) = lower(trim(stock_inbound_shipments.destination_warehouse_name))
  )
ORDER BY lower(trim(destination_warehouse_name)), id ASC;

UPDATE stock_inbound_shipments s
SET destination_location_id = l.id
FROM stock_locations l
WHERE lower(trim(l.name)) = lower(trim(s.destination_warehouse_name))
  AND s.destination_location_id IS NULL
  AND s.destination_warehouse_name IS NOT NULL
  AND trim(s.destination_warehouse_name) <> '';

COMMIT;

-- ── POST-MIGRATION VERIFICATION QUERIES ──────────────────────────────
-- Run these manually to verify coverage. Un-matched rows mean new master
-- records need to be created manually or the text was blank/inconsistent.

-- Outbound shipments: rows still missing customer_id but had text
-- SELECT id, shipment_number, customer_name FROM stock_outbound_shipments
-- WHERE customer_name IS NOT NULL AND trim(customer_name) <> '' AND customer_id IS NULL;

-- Outbound shipments: rows still missing salesperson_id but had text
-- SELECT id, shipment_number, salesperson_name FROM stock_outbound_shipments
-- WHERE salesperson_name IS NOT NULL AND trim(salesperson_name) <> '' AND salesperson_id IS NULL;

-- Inbound shipments: rows missing destination_location_id but had text
-- SELECT id, shipment_number, destination_warehouse_name FROM stock_inbound_shipments
-- WHERE destination_warehouse_name IS NOT NULL AND trim(destination_warehouse_name) <> '' AND destination_location_id IS NULL;
