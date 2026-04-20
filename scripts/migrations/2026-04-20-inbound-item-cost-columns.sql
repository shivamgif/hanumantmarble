-- Migration: 2026-04-20-inbound-item-cost-columns.sql
-- Purpose: Ensure cost_per_sqm, thickness_mm_snapshot, and hsn_code columns
-- exist on stock_inbound_shipment_items. Referenced by POST
-- /api/stock/inbound-shipments but missing from the April-19 migration,
-- causing item inserts to 500 after the shipment row was created.
-- Idempotent.

BEGIN;

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS cost_per_sqm NUMERIC(12, 2);

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS thickness_mm_snapshot NUMERIC(10, 2);

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS hsn_code TEXT;

COMMIT;
