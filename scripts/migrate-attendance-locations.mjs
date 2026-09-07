#!/usr/bin/env node
/**
 * Multi-branch support for attendance.
 *
 * Attendance shipped assuming one site. Two things break as soon as a second
 * showroom or warehouse exists:
 *
 *   1. A phone punch carried no location, so resolvePunchLocation() fell back
 *      to `location_type = 'showroom' ORDER BY id LIMIT 1`. Everyone at the
 *      second branch was recorded at the FIRST one and geofenced against its
 *      coordinates — flagged out-of-fence every day. Location is now picked
 *      from the GPS fix (nearest anchored location), so this needs no column.
 *
 *   2. There was no way to say where a person normally works. That is needed
 *      for the GPS-denied fallback, to put a branch's own staff at the front of
 *      its kiosk, and to report attendance per branch. Hence this column.
 *
 * default_location_id is a SOFT default, never a restriction: anyone may punch
 * at any branch, and the punch records where they actually were.
 *
 * The geofence RADIUS stays global (stock_attendance_settings.geofence_radius_m)
 * — only the anchors are per-location.
 *
 * Runs as ONE transaction and every statement is idempotent, so re-running is
 * safe. Run: npm run db:migrate-attendance-locations
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
           (SELECT COUNT(*) FROM stock_locations WHERE is_active) AS locations,
           (SELECT COUNT(*) FROM stock_locations WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS anchored
  `;
  console.log(`→ Target database: ${target.db} (${target.locations} active locations, ${target.anchored} with coordinates)`);

  await sql.transaction([
    // Where this person normally works. ON DELETE SET NULL rather than CASCADE:
    // retiring a location must not delete employees.
    sql`ALTER TABLE stock_app_users
          ADD COLUMN IF NOT EXISTS default_location_id BIGINT
          REFERENCES stock_locations(id) ON DELETE SET NULL`,

    // The kiosk groups its roster by this, and reports filter on it.
    sql`CREATE INDEX IF NOT EXISTS idx_app_users_default_location
          ON stock_app_users(default_location_id)`,

    // Reporting "who was at this branch this month" scans by location + date.
    sql`CREATE INDEX IF NOT EXISTS idx_attendance_location_date
          ON stock_attendance_entries(location_id, work_date DESC)`,
  ]);

  // --- Verify ---------------------------------------------------------------
  const [check] = await sql`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'stock_app_users' AND column_name = 'default_location_id') AS col,
      (SELECT COUNT(*) FROM pg_indexes
         WHERE indexname IN ('idx_app_users_default_location', 'idx_attendance_location_date')) AS idx,
      (SELECT COUNT(*) FROM stock_app_users WHERE default_location_id IS NOT NULL) AS assigned
  `;
  console.log('✓ Multi-branch attendance migration complete.');
  console.log(`  default_location_id column: ${Number(check.col) ? 'yes' : 'NO'}`);
  console.log(`  indexes (2):                ${check.idx}`);
  console.log(`  employees assigned a branch: ${check.assigned}`);
  if (Number(target.anchored) < Number(target.locations)) {
    console.log(
      `  ⚠ ${Number(target.locations) - Number(target.anchored)} active location(s) have no coordinates —` +
        ' those have no geofence and cannot be auto-detected from a GPS fix.'
    );
  }
}

run().catch((err) => {
  console.error('✗ Migration failed (rolled back, database unchanged):', err.message);
  process.exit(1);
});
