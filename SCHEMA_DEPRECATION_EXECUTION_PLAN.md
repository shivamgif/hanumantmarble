# Schema Deprecation Execution Plan (Operator-Safe)

Purpose: Safely deprecate and remove low-usage stock tables with strong guardrails, explicit rollback paths, and verification steps.

Audience: This is written so another agent (Gemini 3.1 Pro) can execute with minimal ambiguity.

Date baseline: 2026-04-18

## 1. Scope and decision matrix

### 1.1 Candidate tables

- Candidate A: stock_purchase_orders
- Candidate B: stock_purchase_order_items
- Candidate C: stock_sales_order_items
- Candidate D: stock_cost_entries
- Candidate E: stock_locations (defer by default)

### 1.2 Recommended action by candidate

- stock_purchase_orders: deprecate then drop (if no hidden usage)
- stock_purchase_order_items: deprecate then drop (paired with purchase_orders)
- stock_sales_order_items: deprecate then drop (if outbound uses shipment items only)
- stock_cost_entries: deprecate then drop (if costs are fully represented elsewhere)
- stock_locations: DO NOT DROP in first pass; it is linked to inventory/movement relations and should be handled in a separate redesign.

## 2. Hard safety rules

- Never combine deprecation and physical drop in one deployment.
- Take a logical backup before each destructive step.
- Maintain one full release cycle between write-disable and drop.
- Abort immediately if any runtime query references target tables during observation window.
- Do not change stock_locations in this plan.

## 3. Execution phases

## Phase 0: Preparation and baseline capture

### 0.1 Create branch

- Branch name: chore/schema-deprecation-phase-1

### 0.2 Capture schema and data baseline

Run and store outputs in docs/deprecation-artifacts/:

- Full schema snapshot
- Row counts for all candidate tables
- FK dependency inventory
- View dependency inventory
- Function/procedure dependency inventory

Suggested SQL bundle:

BEGIN;

-- Candidate row counts
SELECT 'stock_purchase_orders' AS table_name, COUNT(*) AS row_count FROM stock_purchase_orders
UNION ALL
SELECT 'stock_purchase_order_items', COUNT(*) FROM stock_purchase_order_items
UNION ALL
SELECT 'stock_sales_order_items', COUNT(*) FROM stock_sales_order_items
UNION ALL
SELECT 'stock_cost_entries', COUNT(*) FROM stock_cost_entries
UNION ALL
SELECT 'stock_locations', COUNT(*) FROM stock_locations;

-- Inbound FKs pointing to candidates
SELECT
  tc.table_name AS referencing_table,
  kcu.column_name AS referencing_column,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name IN ('stock_purchase_orders', 'stock_purchase_order_items', 'stock_sales_order_items', 'stock_cost_entries', 'stock_locations')
ORDER BY ccu.table_name, tc.table_name;

-- Outbound FKs owned by candidates
SELECT
  tc.table_name AS owning_table,
  kcu.column_name AS owning_column,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('stock_purchase_orders', 'stock_purchase_order_items', 'stock_sales_order_items', 'stock_cost_entries', 'stock_locations')
ORDER BY tc.table_name, tc.constraint_name;

-- Views depending on candidates
SELECT
  view_schema,
  view_name
FROM information_schema.view_table_usage
WHERE table_name IN ('stock_purchase_orders', 'stock_purchase_order_items', 'stock_sales_order_items', 'stock_cost_entries', 'stock_locations')
ORDER BY view_schema, view_name;

COMMIT;

### 0.3 Runtime code gate (must pass before phase 1)

Search application runtime code only (exclude seed/migration scripts) for any SQL reference to candidates.

Pass condition:

- No references in app/ and lib/ to:
  - stock_purchase_orders
  - stock_purchase_order_items
  - stock_sales_order_items
  - stock_cost_entries

If any reference exists, stop and remediate code first.

## Phase 1: Soft deprecation (non-destructive)

Goal: Keep reads possible for compatibility while making writes impossible and observable.

### 1.1 Add deprecation marker comments

Create migration file:

- scripts/migrations/2026-04-18-deprecate-orders-costs-phase1.sql

Contents:

BEGIN;

COMMENT ON TABLE stock_purchase_orders IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';
COMMENT ON TABLE stock_purchase_order_items IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';
COMMENT ON TABLE stock_sales_order_items IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';
COMMENT ON TABLE stock_cost_entries IS 'DEPRECATED_PHASE1_2026-04-18: read-only compatibility table';

COMMIT;

### 1.2 Revoke write privileges (preferred)

If your DB role model supports grants, revoke INSERT/UPDATE/DELETE for app role on these tables.

If grants are not used in your environment, create blockers using BEFORE triggers that raise exceptions on write operations.

Trigger-based write blocker template:

CREATE OR REPLACE FUNCTION forbid_deprecated_table_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Writes are blocked: deprecated table %', TG_TABLE_NAME;
END;
$$;

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

### 1.3 Observation window

Monitor at least 7 days of production traffic.

Required checks:

- No write attempts to blocked tables
- No SELECT errors from missing assumptions
- No background job failures related to candidates

Abort condition:

- Any write attempt or essential read dependence appears

## Phase 2: Data archival and contractual freeze

### 2.1 Export candidate data

Create CSV or SQL dumps per table:

- archive/stock_purchase_orders_YYYYMMDD.csv
- archive/stock_purchase_order_items_YYYYMMDD.csv
- archive/stock_sales_order_items_YYYYMMDD.csv
- archive/stock_cost_entries_YYYYMMDD.csv

### 2.2 Optional historical mirror

If business needs historical reporting, move data into archive tables:

- stock_purchase_orders_archive
- stock_purchase_order_items_archive
- stock_sales_order_items_archive
- stock_cost_entries_archive

Preserve identical columns plus:

- archived_at TIMESTAMP NOT NULL DEFAULT NOW()
- archive_reason TEXT

## Phase 3: Physical drop (destructive)

Create migration file:

- scripts/migrations/2026-04-XX-drop-orders-costs-phase3.sql

Order of operations (important):

1. Drop child tables first
2. Then parent tables
3. Keep stock_locations untouched

Suggested SQL:

BEGIN;

-- Remove write-blocker triggers first if present
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

Post-drop verification SQL:

SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('stock_purchase_orders', 'stock_purchase_order_items', 'stock_sales_order_items', 'stock_cost_entries')
ORDER BY tablename;

Expected result: zero rows.

## 4. Rollback strategy

## 4.1 Rollback during phase 1 or 2

- Drop blocker triggers
- Restore grants (if grants were changed)
- Keep tables intact

## 4.2 Rollback after phase 3 drop

- Recreate from backup or archive import
- Recreate indexes and constraints exactly as baseline snapshot
- Re-run smoke tests before reopening traffic

Minimum rollback artifact checklist:

- DDL snapshot file
- table-by-table data export file
- list of indexes and constraints for each dropped table

## 5. Validation checklist (must be green)

### 5.1 Runtime API smoke checks

- Stock dashboard endpoints still load
- Inbound shipment create/approve still works
- Outbound shipment create/approve still works
- Document upload and linkage still works
- Notifications and timeline still work

### 5.2 SQL integrity checks

- No invalid views
- No orphaned constraints
- No dependency errors during migrations

Suggested SQL:

-- invalid objects check (Postgres catalogs)
SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v','m')
ORDER BY c.relname;

-- candidate table existence check
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'stock_purchase_orders'
) AS purchase_orders_exists,
EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'stock_purchase_order_items'
) AS purchase_order_items_exists,
EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'stock_sales_order_items'
) AS sales_order_items_exists,
EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'stock_cost_entries'
) AS cost_entries_exists;

## 6. Explicit non-goals for this run

- Do not remove stock_locations
- Do not remove polymorphic link columns (entity_type/entity_id/source_table/source_id)
- Do not remove department yet unless all runtime code has migrated to division_id only

## 7. Known drift to fix separately before/after deprecation

- Seed scripts still insert dropped Hindi columns in stock master tables.
- Audit logger appears to use camelCase column names while schema is snake_case.

These are unrelated to deprecation but should be corrected in dedicated migrations/patches.

## 8. Handoff instructions for Gemini 3.1 Pro

Execute exactly in this order:

1. Phase 0 baseline capture and runtime gate
2. Phase 1 soft deprecation and write block
3. 7-day observation window
4. Phase 2 archive export
5. Phase 3 physical drop
6. Post-drop validation and report

Do not skip observation window unless explicitly approved by a human owner.
