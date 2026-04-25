-- ============================================================
-- Migration: 2026-04-25 — Backfill outbound salesperson_user_id
--
-- Purpose:
--   Populate stock_outbound_shipments.salesperson_user_id from
--   legacy salesperson fields for historical rows.
--
-- Safety:
--   - Only updates rows where salesperson_user_id IS NULL
--   - Only matches active app users with role = 'salesperson'
--   - Skips ambiguous names (more than one active salesperson user
--     with the same normalized name)
-- ============================================================

BEGIN;

WITH shipment_names AS (
  SELECT
    s.id AS shipment_id,
    lower(trim(COALESCE(sp.name, to_jsonb(s)->>'salesperson_name', ''))) AS normalized_salesperson_name
  FROM stock_outbound_shipments s
  LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
  WHERE s.salesperson_user_id IS NULL
),
unique_salesperson_users AS (
  SELECT
    lower(trim(u.name)) AS normalized_salesperson_name,
    MIN(u.id) AS salesperson_user_id
  FROM stock_app_users u
  WHERE u.role = 'salesperson'
    AND u.status = 'active'
    AND trim(COALESCE(u.name, '')) <> ''
  GROUP BY lower(trim(u.name))
  HAVING COUNT(*) = 1
),
matches AS (
  SELECT
    sn.shipment_id,
    usu.salesperson_user_id
  FROM shipment_names sn
  JOIN unique_salesperson_users usu
    ON usu.normalized_salesperson_name = sn.normalized_salesperson_name
  WHERE sn.normalized_salesperson_name <> ''
)
UPDATE stock_outbound_shipments s
SET salesperson_user_id = m.salesperson_user_id,
    updated_at = NOW()
FROM matches m
WHERE s.id = m.shipment_id
  AND s.salesperson_user_id IS NULL;

COMMIT;

-- Optional verification:
-- 1) Remaining rows missing salesperson_user_id where some legacy salesperson text exists:
-- SELECT s.id, s.shipment_number, COALESCE(sp.name, s.salesperson_name) AS legacy_salesperson
-- SELECT s.id, s.shipment_number, COALESCE(sp.name, to_jsonb(s)->>'salesperson_name') AS legacy_salesperson
-- FROM stock_outbound_shipments s
-- LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
-- WHERE s.salesperson_user_id IS NULL
--   AND trim(COALESCE(sp.name, s.salesperson_name, '')) <> ''
-- ORDER BY s.id DESC;
--
-- 2) Spot-check mapped rows:
-- SELECT s.id, s.shipment_number, s.salesperson_user_id, u.name, d.name AS division
-- FROM stock_outbound_shipments s
-- JOIN stock_app_users u ON u.id = s.salesperson_user_id
-- LEFT JOIN stock_divisions d ON d.id = u.division_id
-- ORDER BY s.id DESC
-- LIMIT 100;
