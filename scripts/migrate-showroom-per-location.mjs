#!/usr/bin/env node
/**
 * Per-location showroom display stock.
 *
 * Showroom stock shipped as four columns on stock_items — showroom_whole_qty,
 * showroom_sqft, showroom_installed_whole_qty, showroom_installed_sqft — with
 * one row per ITEM and no location. That was right when there was one showroom
 * (there is a `ponytail:` note in app/api/stock/movements/route.js saying to add
 * a location param when a second one opens). A second showroom now exists, so
 * "3 boxes on display" has nowhere to record WHICH showroom.
 *
 * This adds stock_showroom_stock, keyed (item_id, location_id).
 *
 * The four stock_items columns are DELIBERATELY KEPT, as a maintained rollup of
 * the whole company. Every existing reader wants exactly that question — "is any
 * of this on display anywhere, and how much of it is sellable":
 *
 *   app/api/stock/outbound-shipments/route.js  (dispatch availability hint)
 *   app/api/stock/outbound-shipments/[id]/route.js
 *   app/api/stock/dashboard/route.js
 *   app/stock/components/stock-items-table.js, app/stock/page.js
 *
 * Rewriting nine files — including the dispatch money path — to join a new table
 * for an answer they already have would be a large diff for no behaviour change.
 * Instead the rollup and the per-location rows are written in the SAME
 * transaction, under the advisory lock the move already takes, so they cannot
 * drift. scripts/check-showroom-reconcile.mjs asserts they agree.
 *
 * Idempotent, one transaction. Run: npm run db:migrate-showroom-per-location
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  // --- Pre-flight -----------------------------------------------------------
  const [caps] = await sql`
    SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_name = 'stock_items'
       AND column_name IN ('showroom_whole_qty', 'showroom_sqft',
                           'showroom_installed_whole_qty', 'showroom_installed_sqft')
  `;
  if (Number(caps.n) < 4) {
    console.error('✗ Showroom columns missing. Apply scripts/migrations/2026-09-0*-showroom-*.sql first.');
    process.exit(1);
  }

  // Everything currently on display belongs to the showroom the old code was
  // hard-wired to: `location_type='showroom' ORDER BY id LIMIT 1`.
  const [home] = await sql`
    SELECT id, name FROM stock_locations WHERE location_type = 'showroom' ORDER BY id LIMIT 1
  `;
  if (!home) {
    console.error('✗ No showroom-type location exists. Create one before migrating.');
    process.exit(1);
  }

  const [target] = await sql`
    SELECT current_database() AS db,
           (SELECT COUNT(*) FROM stock_items
             WHERE showroom_whole_qty > 0 OR showroom_sqft > 0) AS on_display
  `;
  console.log(`→ Target database: ${target.db}`);
  console.log(`→ Backfilling ${target.on_display} item(s) on display to "${home.name}" (id ${home.id})`);

  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS stock_showroom_stock (
          id BIGSERIAL PRIMARY KEY,
          item_id BIGINT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
          location_id BIGINT NOT NULL REFERENCES stock_locations(id),
          whole_qty INTEGER NOT NULL DEFAULT 0,
          sqft NUMERIC(14, 3) NOT NULL DEFAULT 0,
          installed_whole_qty INTEGER NOT NULL DEFAULT 0,
          installed_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (item_id, location_id)
        )`,

    // The same invariants the stock_items columns carry: nothing negative, and
    // installed is a SUBSET of what is at that showroom.
    sql`ALTER TABLE stock_showroom_stock DROP CONSTRAINT IF EXISTS stock_showroom_stock_nonnegative`,
    sql`ALTER TABLE stock_showroom_stock
          ADD CONSTRAINT stock_showroom_stock_nonnegative
          CHECK (whole_qty >= 0 AND sqft >= 0 AND installed_whole_qty >= 0 AND installed_sqft >= 0)`,
    sql`ALTER TABLE stock_showroom_stock DROP CONSTRAINT IF EXISTS stock_showroom_stock_installed_subset`,
    sql`ALTER TABLE stock_showroom_stock
          ADD CONSTRAINT stock_showroom_stock_installed_subset
          CHECK (installed_whole_qty <= whole_qty AND installed_sqft <= sqft)`,

    sql`CREATE INDEX IF NOT EXISTS idx_showroom_stock_location ON stock_showroom_stock(location_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_showroom_stock_item ON stock_showroom_stock(item_id)`,

    // Backfill. ON CONFLICT DO NOTHING makes a re-run a no-op rather than
    // doubling every balance.
    sql`INSERT INTO stock_showroom_stock (item_id, location_id, whole_qty, sqft, installed_whole_qty, installed_sqft)
        SELECT id, ${home.id}, showroom_whole_qty, showroom_sqft,
               showroom_installed_whole_qty, showroom_installed_sqft
          FROM stock_items
         WHERE showroom_whole_qty > 0 OR showroom_sqft > 0
        ON CONFLICT (item_id, location_id) DO NOTHING`,
  ]);

  // --- Verify ---------------------------------------------------------------
  // The rollup on stock_items must equal the sum of the per-location rows, or
  // the dispatch availability hint is lying about what is on display.
  const [check] = await sql`
    WITH rollup AS (
      SELECT i.id,
             i.showroom_whole_qty AS w, i.showroom_sqft AS s,
             COALESCE(SUM(ss.whole_qty), 0) AS sw,
             COALESCE(SUM(ss.sqft), 0) AS ss
        FROM stock_items i
        LEFT JOIN stock_showroom_stock ss ON ss.item_id = i.id
       GROUP BY i.id, i.showroom_whole_qty, i.showroom_sqft
    )
    SELECT (SELECT COUNT(*) FROM stock_showroom_stock) AS rows,
           (SELECT COUNT(*) FROM rollup WHERE w <> sw OR s <> ss) AS mismatched
  `;
  console.log('✓ Per-location showroom stock migration complete.');
  console.log(`  stock_showroom_stock rows: ${check.rows}`);
  console.log(`  rollup mismatches:         ${check.mismatched} ${Number(check.mismatched) === 0 ? '(consistent)' : '← INVESTIGATE'}`);
  if (Number(check.mismatched) > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('✗ Migration failed (rolled back, database unchanged):', err.message);
  process.exit(1);
});
