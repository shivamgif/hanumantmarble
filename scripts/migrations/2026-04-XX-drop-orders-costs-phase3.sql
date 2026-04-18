-- Phase 3: Physical drop of deprecated stock tables
-- Created: 2026-04-XX (fill in actual date when ready)
-- See SCHEMA_DEPRECATION_EXECUTION_PLAN.md for full context and rollback

BEGIN;

-- Remove write-blocker triggers if present
DROP TRIGGER IF EXISTS trg_block_stock_purchase_order_items_writes ON stock_purchase_order_items;
DROP TRIGGER IF EXISTS trg_block_stock_purchase_orders_writes ON stock_purchase_orders;
DROP TRIGGER IF EXISTS trg_block_stock_sales_order_items_writes ON stock_sales_order_items;
DROP TRIGGER IF EXISTS trg_block_stock_cost_entries_writes ON stock_cost_entries;

-- Drop child tables before parents
DROP TABLE IF EXISTS stock_purchase_order_items;
DROP TABLE IF EXISTS stock_sales_order_items;
DROP TABLE IF EXISTS stock_cost_entries;
DROP TABLE IF EXISTS stock_purchase_orders;

COMMIT;

-- Rollback: To restore, re-import from backup and re-create indexes/constraints as per baseline snapshot.
