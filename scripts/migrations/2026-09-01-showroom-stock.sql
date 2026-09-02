-- Showroom display stock.
--
-- Slabs/tiles/bags moved to the showroom for display were never recorded, so
-- stock_items.current_* stayed inflated and the warehouse count lied. Rather
-- than turning the whole app into a multi-location inventory (lots already have
-- an unused location_id), this adds exactly ONE second location as a parallel
-- set of counters on stock_items — mirroring the current_* / current_sqft split
-- so every read site reuses its existing unit_of_measure branch.
--
-- Material stuck down as flooring is NOT a bucket: it is decremented out of
-- showroom_* and survives only as a stock_movements row.
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE IF EXISTS stock_items
  ADD COLUMN IF NOT EXISTS showroom_whole_qty  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showroom_broken_qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showroom_sqft       NUMERIC(14, 3) NOT NULL DEFAULT 0;

ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_showroom_nonnegative;
ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_showroom_nonnegative CHECK (
    showroom_whole_qty >= 0 AND
    showroom_broken_qty >= 0 AND
    showroom_sqft >= 0
  );

-- The single showroom location every movement row points at. stock_locations
-- already allows location_type = 'showroom'; nothing had ever inserted one.
-- DO UPDATE rather than DO NOTHING because inbound-shipments/route.js
-- auto-creates locations hardcoded to 'warehouse', so a row named Showroom may
-- already exist with the wrong type.
INSERT INTO stock_locations (name, location_type)
VALUES ('Showroom', 'showroom')
ON CONFLICT (name) DO UPDATE SET location_type = 'showroom', updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_stock_movements_location_created
  ON stock_movements(location_id, created_at DESC);

COMMIT;
