-- Migration: 2026-04-19-inbound-purchase-adjustments.sql
-- Purpose: Add cost and measurement columns to inbound shipment and shipment items
-- tables to support detailed costing and quality tracking for marble/tile purchases.
--
-- Phase 1: Additive schema changes only. No drops, no data migrations.
-- Idempotent with ADD COLUMN IF NOT EXISTS.

BEGIN;

-- ====== ALTER stock_inbound_shipments ======
-- Add shipment-level cost percentages and grand total

ALTER TABLE IF EXISTS stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS handling_cost_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.0;

ALTER TABLE IF EXISTS stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS fuel_cost_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.0;

ALTER TABLE IF EXISTS stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 18.0;

ALTER TABLE IF EXISTS stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS freight_weight_kg NUMERIC(12, 3);

-- ====== ALTER stock_inbound_shipment_items ======
-- Add line-item level qty_sqm variants and total cost

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS whole_qty_sqm NUMERIC(14, 3);

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS broken_qty_sqm NUMERIC(14, 3);

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS ordered_qty_sqm NUMERIC(14, 3);

ALTER TABLE IF EXISTS stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMIT;
