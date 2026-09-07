#!/usr/bin/env node
/**
 * Punch selfies.
 *
 * A geofence proves a PHONE was near the branch. It does not prove the person
 * was, and it does nothing at all for a shared kiosk PIN. A photo taken at the
 * moment of the punch closes that gap.
 *
 * The columns added here hold a blob KEY, not the image. The bytes go to a
 * Netlify blob store (lib/attendance-selfie.js) because every hot query on this
 * table is `SELECT *` — a bytea column would ride along on every punch, every
 * timesheet row, every backup, forever. TEXT keys are ~40 bytes and harmless.
 *
 * require_selfie is OFF by default. Turn it on in Attendance -> Settings when
 * you actually want it; existing punches and existing installs are unaffected.
 *
 * Runs as ONE transaction and every statement is idempotent, so re-running is
 * safe. Run: npm run db:migrate-attendance-selfie
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
  const [entries] = await sql`SELECT to_regclass('stock_attendance_entries') AS t`;
  if (!entries?.t) {
    console.error('✗ stock_attendance_entries is missing. Run db:migrate-attendance first.');
    process.exit(1);
  }

  const [target] = await sql`
    SELECT current_database() AS db,
           (SELECT COUNT(*) FROM stock_attendance_entries) AS punches
  `;
  console.log(`→ Target database: ${target.db} (${target.punches} attendance rows)`);

  await sql.transaction([
    // The blob key for the clock-in / clock-out photo. NULL is the normal
    // state: selfies are off by default, the camera can be declined, and the
    // blob store can be unreachable — none of those may block a punch.
    sql`ALTER TABLE stock_attendance_entries
          ADD COLUMN IF NOT EXISTS in_selfie_key TEXT`,
    sql`ALTER TABLE stock_attendance_entries
          ADD COLUMN IF NOT EXISTS out_selfie_key TEXT`,

    // The nightly purge scans "old rows that still hold a key". Partial index
    // so it stays small — the overwhelming majority of rows have no key.
    sql`CREATE INDEX IF NOT EXISTS idx_attendance_selfie_purge
          ON stock_attendance_entries(work_date)
          WHERE in_selfie_key IS NOT NULL OR out_selfie_key IS NOT NULL`,

    // Company-wide switch, same singleton row as every other work rule.
    sql`ALTER TABLE stock_attendance_settings
          ADD COLUMN IF NOT EXISTS require_selfie BOOLEAN NOT NULL DEFAULT FALSE`,
  ]);

  // --- Verify ---------------------------------------------------------------
  const [check] = await sql`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'stock_attendance_entries'
           AND column_name IN ('in_selfie_key', 'out_selfie_key')) AS entry_cols,
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'stock_attendance_settings'
           AND column_name = 'require_selfie') AS settings_col,
      (SELECT COUNT(*) FROM pg_indexes
         WHERE indexname = 'idx_attendance_selfie_purge') AS idx,
      (SELECT require_selfie FROM stock_attendance_settings WHERE id = 1) AS enabled
  `;
  console.log('✓ Punch selfie migration complete.');
  console.log(`  entry key columns (2):  ${check.entry_cols}`);
  console.log(`  require_selfie column:  ${Number(check.settings_col) ? 'yes' : 'NO'}`);
  console.log(`  purge index:            ${Number(check.idx) ? 'yes' : 'NO'}`);
  console.log(`  selfies currently:      ${check.enabled ? 'REQUIRED' : 'off (turn on in Attendance → Settings)'}`);
  console.log('  Images are stored in Netlify Blobs, not Postgres, and purged after 90 days.');
}

run().catch((err) => {
  console.error('✗ Migration failed (rolled back, database unchanged):', err.message);
  process.exit(1);
});
