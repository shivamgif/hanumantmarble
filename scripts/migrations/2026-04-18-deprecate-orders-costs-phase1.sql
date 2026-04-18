-- Phase 1: Soft deprecation and write block for deprecated stock tables
-- Created: 2026-04-18
-- See SCHEMA_DEPRECATION_EXECUTION_PLAN.md for full context and rollback

BEGIN;

-- Mark tables as deprecated (for operator visibility)
COMMENT ON TABLE stock_purchase_orders IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';
COMMENT ON TABLE stock_purchase_order_items IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';
COMMENT ON TABLE stock_sales_order_items IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';
COMMENT ON TABLE stock_cost_entries IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';

-- Write-blocker trigger function (idempotent)
CREATE OR REPLACE FUNCTION forbid_deprecated_table_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Writes are blocked: deprecated table %', TG_TABLE_NAME;
END;
$$;

-- Block all writes to deprecated tables
CREATE TRIGGER trg_block_stock_purchase_orders_writes
BEFORE INSERT OR UPDATE OR DELETE ON stock_purchase_orders
FOR EACH ROW EXECUTE FUNCTION forbid_deprecated_table_writes();

CREATE TRIGGER trg_block_stock_purchase_order_items_writes
BEFORE INSERT OR UPDATE OR DELETE ON stock_purchase_order_items
FOR EACH ROW EXECUTE FUNCTION forbid_deprecated_table_writes();

CREATE TRIGGER trg_block_stock_sales_order_items_writes
BEFORE INSERT OR UPDATE OR DELETE ON stock_sales_order_items
FOR EACH ROW EXECUTE FUNCTION forbid_deprecated_table_writes();

CREATE TRIGGER trg_block_stock_cost_entries_writes
BEFORE INSERT OR UPDATE OR DELETE ON stock_cost_entries
FOR EACH ROW EXECUTE FUNCTION forbid_deprecated_table_writes();

COMMIT;

-- Rollback: To remove blockers, run the following (in a new migration if needed):
-- DROP TRIGGER IF EXISTS trg_block_stock_purchase_orders_writes ON stock_purchase_orders;
-- DROP TRIGGER IF EXISTS trg_block_stock_purchase_order_items_writes ON stock_purchase_order_items;
-- DROP TRIGGER IF EXISTS trg_block_stock_sales_order_items_writes ON stock_sales_order_items;
-- DROP TRIGGER IF EXISTS trg_block_stock_cost_entries_writes ON stock_cost_entries;
