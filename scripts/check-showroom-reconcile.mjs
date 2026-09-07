#!/usr/bin/env node
/**
 * Asserts the showroom rollup agrees with the per-branch rows.
 *
 * stock_items.showroom_* is a company-wide ROLLUP of stock_showroom_stock,
 * kept because every other reader — the dispatch availability hint most of all
 * — asks "is any of this on display anywhere". Two places holding one number is
 * a drift risk, so it is written in the same transaction as the branch row and
 * checked here.
 *
 * A mismatch means the dispatch hint is lying about what is on display, so this
 * exits non-zero and is worth running after any showroom-stock change.
 *
 * Run: npm run db:check-showroom-reconcile
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  const [exists] = await sql`SELECT to_regclass('stock_showroom_stock') AS t`;
  if (!exists?.t) {
    console.error('✗ stock_showroom_stock is missing. Run db:migrate-showroom-per-location first.');
    process.exit(1);
  }

  const mismatches = await sql`
    SELECT i.sku,
           i.showroom_whole_qty AS rollup_whole,
           COALESCE(SUM(ss.whole_qty), 0) AS branch_whole,
           i.showroom_sqft AS rollup_sqft,
           COALESCE(SUM(ss.sqft), 0) AS branch_sqft,
           i.showroom_installed_whole_qty AS rollup_inst_whole,
           COALESCE(SUM(ss.installed_whole_qty), 0) AS branch_inst_whole,
           i.showroom_installed_sqft AS rollup_inst_sqft,
           COALESCE(SUM(ss.installed_sqft), 0) AS branch_inst_sqft
      FROM stock_items i
      LEFT JOIN stock_showroom_stock ss ON ss.item_id = i.id
     GROUP BY i.id, i.sku, i.showroom_whole_qty, i.showroom_sqft,
              i.showroom_installed_whole_qty, i.showroom_installed_sqft
    HAVING i.showroom_whole_qty <> COALESCE(SUM(ss.whole_qty), 0)
        OR i.showroom_sqft <> COALESCE(SUM(ss.sqft), 0)
        OR i.showroom_installed_whole_qty <> COALESCE(SUM(ss.installed_whole_qty), 0)
        OR i.showroom_installed_sqft <> COALESCE(SUM(ss.installed_sqft), 0)
  `;

  // Independently: no branch may claim more installed than it holds, and
  // nothing may go negative. The CHECK constraints enforce this, so a hit here
  // means a constraint was dropped.
  const [invalid] = await sql`
    SELECT COUNT(*) AS n FROM stock_showroom_stock
     WHERE whole_qty < 0 OR sqft < 0
        OR installed_whole_qty > whole_qty OR installed_sqft > sqft
  `;

  const [totals] = await sql`
    SELECT COUNT(*) AS rows, COUNT(DISTINCT location_id) AS branches
      FROM stock_showroom_stock
  `;

  console.log(`  branch rows: ${totals.rows} across ${totals.branches} showroom(s)`);
  console.log(`  invalid rows: ${invalid.n}`);
  console.log(`  rollup mismatches: ${mismatches.length}`);

  for (const m of mismatches) {
    console.error(
      `  ✗ ${m.sku}: rollup ${m.rollup_whole}/${m.rollup_sqft} sqft vs branches ${m.branch_whole}/${m.branch_sqft} sqft`
    );
  }

  if (mismatches.length || Number(invalid.n) > 0) {
    console.error('✗ showroom stock is inconsistent — the dispatch availability hint cannot be trusted.');
    process.exit(1);
  }
  console.log('✓ showroom reconcile: rollup equals the sum of the branches');
}

run().catch((err) => {
  console.error('✗ Reconcile check failed:', err.message);
  process.exit(1);
});
