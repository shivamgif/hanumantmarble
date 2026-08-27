#!/usr/bin/env node
/**
 * Adds stone-item support (Kota stone, sandstone etc) to the stock schema.
 *
 * Stone differs from tiles and bags in three ways:
 *   1. Quantity is total SQUARE FEET, not countable pieces — each delivery has
 *      a fixed slab size but the size differs between deliveries, so pieces are
 *      not a stable unit. Needs a NUMERIC column; current_whole_qty is INTEGER.
 *   2. It is its own division ("Stone"), but EVERY salesperson may sell it —
 *      same arrangement as the Adhesive division.
 *   3. GST is 5% (tiles are 18%). GST is already per-shipment, so this only
 *      changes a form default, not the schema.
 *
 * Runs as ONE transaction: Postgres does DDL transactionally, so a failure
 * leaves the database untouched rather than half-migrated. Every statement is
 * also idempotent (IF NOT EXISTS / ON CONFLICT), so re-running is safe.
 *
 * Run: npm run db:migrate-stone-support
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
  // The Stone division grant needs the salesperson<->division junction table.
  const [junction] = await sql`SELECT to_regclass('stock_user_divisions') AS t`;
  if (!junction?.t) {
    console.error('✗ stock_user_divisions is missing. Run db:migrate-salesperson-multi-division first.');
    process.exit(1);
  }

  const [target] = await sql`
    SELECT current_database() AS db, (SELECT COUNT(*) FROM stock_items) AS items
  `;
  console.log(`→ Target database: ${target.db} (${target.items} stock items)`);

  await sql.transaction([
    // 1. Allow 'stone' as a stock_types category. The bag migration added an
    //    unnamed CHECK, which Postgres named stock_types_category_check.
    sql`ALTER TABLE stock_types DROP CONSTRAINT IF EXISTS stock_types_category_check`,
    sql`ALTER TABLE stock_types
          ADD CONSTRAINT stock_types_category_check
          CHECK (category IN ('tile', 'bag', 'stone'))`,

    // 2. Fractional sqft quantity + rate on stock_items. NOT NULL DEFAULT 0 is
    //    a metadata-only change on PG11+, so there is no table rewrite.
    sql`ALTER TABLE stock_items
          ADD COLUMN IF NOT EXISTS current_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS rate_per_sqft NUMERIC(12, 2)`,
    sql`ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_sqft_nonnegative`,
    sql`ALTER TABLE stock_items
          ADD CONSTRAINT stock_items_sqft_nonnegative CHECK (current_sqft >= 0)`,

    // 3. sqft on the shipment lines. Kept separate from received_whole_qty /
    //    loaded_whole_qty so existing aggregate queries that sum those keep
    //    returning piece counts and add 0 for stone instead of mixing units.
    //    slab_size_label is a per-consignment snapshot: the size changes next
    //    delivery, so it belongs on the line, not on the item.
    sql`ALTER TABLE stock_inbound_shipment_items
          ADD COLUMN IF NOT EXISTS received_qty_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS cost_per_sqft NUMERIC(12, 2),
          ADD COLUMN IF NOT EXISTS slab_size_label TEXT`,
    sql`ALTER TABLE stock_outbound_shipment_items
          ADD COLUMN IF NOT EXISTS qty_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS returned_qty_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0`,

    // 4. Audit trail. quantity_received and stock_movements.quantity are
    //    INTEGER; stone carries the fractional value alongside and leaves the
    //    integer column at 0 so existing sums are unaffected.
    sql`ALTER TABLE stock_inventory_lots
          ADD COLUMN IF NOT EXISTS quantity_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0`,
    sql`ALTER TABLE stock_movements
          ADD COLUMN IF NOT EXISTS quantity_sqft NUMERIC(14, 3) NOT NULL DEFAULT 0`,

    // 5. Stone division, sellable by every salesperson (same as Adhesive).
    sql`INSERT INTO stock_divisions (name, description)
        VALUES ('Stone', 'Natural stone (Kota, sandstone, granite) traded by square foot')
        ON CONFLICT (name) DO NOTHING`,
    sql`INSERT INTO stock_user_divisions (user_id, division_id)
        SELECT u.id, d.id
        FROM stock_app_users u
        CROSS JOIN stock_divisions d
        WHERE u.role = 'salesperson' AND d.name = 'Stone'
        ON CONFLICT (user_id, division_id) DO NOTHING`,

    // 6. Seed stone product types.
    sql`INSERT INTO stock_types (name, category, description) VALUES
          ('Kota Stone', 'stone', 'Kota limestone slabs, traded by square foot'),
          ('Sandstone',  'stone', 'Sandstone slabs, traded by square foot'),
          ('Granite',    'stone', 'Granite slabs, traded by square foot'),
          ('Slate',      'stone', 'Slate slabs, traded by square foot')
        ON CONFLICT (name) DO UPDATE
          SET category = EXCLUDED.category, description = EXCLUDED.description`,

    // 7. Backfill division on any stone items created before this ran.
    sql`UPDATE stock_items
        SET division_id = (SELECT id FROM stock_divisions WHERE name = 'Stone')
        WHERE unit_of_measure = 'sqft' AND division_id IS NULL`,

    sql`CREATE INDEX IF NOT EXISTS idx_stock_items_current_sqft ON stock_items(current_sqft)`,
  ]);

  // --- Verify ---------------------------------------------------------------
  const [check] = await sql`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'stock_items' AND column_name = 'current_sqft') AS has_sqft,
      (SELECT COUNT(*) FROM stock_divisions WHERE name = 'Stone') AS has_division,
      (SELECT COUNT(*) FROM stock_types WHERE category = 'stone') AS stone_types,
      (SELECT COUNT(*) FROM stock_user_divisions ud
         JOIN stock_divisions d ON d.id = ud.division_id
         WHERE d.name = 'Stone') AS salespeople_granted
  `;
  console.log('✓ Stone support migration complete.');
  console.log(`  current_sqft column: ${Number(check.has_sqft) ? 'yes' : 'NO'}`);
  console.log(`  Stone division:      ${check.has_division}`);
  console.log(`  stone types seeded:  ${check.stone_types}`);
  console.log(`  salespeople granted: ${check.salespeople_granted}`);
}

run().catch((err) => {
  console.error('✗ Migration failed (rolled back, database unchanged):', err.message);
  process.exit(1);
});
