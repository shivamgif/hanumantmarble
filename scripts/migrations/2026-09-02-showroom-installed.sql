-- Showroom stock gets a STATE instead of a one-way write-off.
--
-- 2026-09-01 made "installed as flooring" a permanent decrement. That was
-- wrong: staff pick the state at the moment of the move, and sometimes pick it
-- wrong or only find out later. A write-off cannot be corrected, so installed
-- becomes a tracked subset of what is at the showroom, and the two states can
-- be flipped afterwards.
--
--   showroom_whole_qty / showroom_sqft            = TOTAL physically at showroom
--   showroom_installed_* (new)                    = the part stuck down as flooring
--   on a cassette (sellable) = total - installed
--
-- Installed stock stays on the books because it is still physically there and
-- still re-classifiable; it is simply not sellable until moved back to cassette.
--
-- Also drops showroom_broken_qty: broken stock was never allowed OUT to the
-- showroom, only back from it, so nothing could ever write that column. It is
-- all zeros. Verified before writing this migration.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- Self-sufficient: folds in the 2026-09-01 columns so this file can be applied
-- to a database that never saw that migration (production, a fresh Neon branch)
-- without an ordering trap. Running 09-01 first is still fine — everything here
-- is IF NOT EXISTS / ON CONFLICT and safe to re-run.
ALTER TABLE IF EXISTS stock_items
  ADD COLUMN IF NOT EXISTS showroom_whole_qty           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showroom_sqft                NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showroom_installed_whole_qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showroom_installed_sqft      NUMERIC(14, 3) NOT NULL DEFAULT 0;

-- The single showroom location every movement row points at. DO UPDATE rather
-- than DO NOTHING because inbound-shipments/route.js auto-creates locations
-- hardcoded to 'warehouse', so a row named Showroom may exist with the wrong type.
INSERT INTO stock_locations (name, location_type)
VALUES ('Showroom', 'showroom')
ON CONFLICT (name) DO UPDATE SET location_type = 'showroom', updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_stock_movements_location_created
  ON stock_movements(location_id, created_at DESC);

-- Guard the subset relationship in the database, not just in the route: an
-- installed count above the showroom total would silently produce negative
-- sellable stock everywhere it is displayed.
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_showroom_installed_valid;
ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_showroom_installed_valid CHECK (
    showroom_installed_whole_qty >= 0 AND
    showroom_installed_sqft >= 0 AND
    showroom_installed_whole_qty <= showroom_whole_qty AND
    showroom_installed_sqft <= showroom_sqft
  );

-- Rewritten without the broken column it used to reference.
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_showroom_nonnegative;
ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_showroom_nonnegative CHECK (
    showroom_whole_qty >= 0 AND showroom_sqft >= 0
  );

ALTER TABLE IF EXISTS stock_items DROP COLUMN IF EXISTS showroom_broken_qty;

-- The action now lives in source_type so the log can tell a cassette move from
-- an installed one (both are movement_type 'transfer_out'). Existing rows all
-- predate the state, and every one of them was a plain move to the showroom.
UPDATE stock_movements
   SET source_type = 'showroom_to_cassette'
 WHERE source_type = 'showroom'
   AND movement_type = 'transfer_out';

UPDATE stock_movements
   SET source_type = 'showroom_to_warehouse'
 WHERE source_type = 'showroom'
   AND movement_type = 'transfer_in';

COMMIT;
