#!/usr/bin/env node
/**
 * Adds time tracking / attendance to the stock schema.
 *
 * Three design decisions worth stating up front:
 *
 *   1. stock_app_users IS the employee directory. Staff with no app login
 *      (loaders, drivers, helpers) are rows with email/external_auth_id NULL.
 *      That is safe against getStockContext(), whose lookup is
 *        (external_auth_provider = $1 AND external_auth_id = $2)
 *         OR auth0_sub = $3 OR email = $4
 *      and `NULL = 'x'` is never true in SQL, so a no-login row can never be
 *      matched to a session. Postgres also allows many NULLs in a UNIQUE column.
 *      No parallel staff table, no duplicated salary.
 *
 *   2. One row per WORK SESSION, not one row per punch event. Duration is then
 *      a subtraction instead of a pairing algorithm in every report. An open
 *      session is clock_out_at IS NULL, and a partial unique index makes "at
 *      most one open session per person" a database guarantee rather than an
 *      application convention — two rapid taps on a flaky phone connection
 *      cannot produce two open rows.
 *
 *   3. Work rules live in a singleton settings TABLE, not in constants, so a
 *      manager can change the grace period without a redeploy.
 *
 * Runs as ONE transaction: Postgres does DDL transactionally, so a failure
 * leaves the database untouched rather than half-migrated. Every statement is
 * also idempotent (IF NOT EXISTS / ON CONFLICT), so re-running is safe.
 *
 * Run: npm run db:migrate-attendance
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
  // Every attendance row hangs off an employee and (optionally) a location.
  const [users] = await sql`SELECT to_regclass('stock_app_users') AS t`;
  if (!users?.t) {
    console.error('✗ stock_app_users is missing. Apply schema-stock.sql first.');
    process.exit(1);
  }
  const [locations] = await sql`SELECT to_regclass('stock_locations') AS t`;
  if (!locations?.t) {
    console.error('✗ stock_locations is missing. Apply schema-stock.sql first.');
    process.exit(1);
  }

  const [target] = await sql`
    SELECT current_database() AS db, (SELECT COUNT(*) FROM stock_app_users) AS users
  `;
  console.log(`→ Target database: ${target.db} (${target.users} app users)`);

  await sql.transaction([
    // 1. Employee columns. attendance_pin_hash is bcrypt and is ONLY ever used
    //    at the shared kiosk — it is not a login credential and must never be
    //    accepted by the session auth path. has_login=FALSE marks staff who
    //    exist for attendance and payroll but have no better-auth account.
    sql`ALTER TABLE stock_app_users
          ADD COLUMN IF NOT EXISTS attendance_pin_hash TEXT,
          ADD COLUMN IF NOT EXISTS tracks_attendance BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS has_login BOOLEAN NOT NULL DEFAULT TRUE`,

    // No backfill: has_login is NOT NULL DEFAULT TRUE and every existing row
    // came from the login path, so the default is already correct. (An earlier
    // draft backfilled from external_auth_id — that column does not exist on
    // every deployment, which is the same drift getStockContext works around
    // in lib/stock-workflow.js. Do not reference it here.)

    // 2. Geofence anchor on locations. A punch is compared against the
    //    coordinates of the location it is attributed to; NULL coordinates mean
    //    "no geofence configured", which is treated as always-inside.
    sql`ALTER TABLE stock_locations
          ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
          ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6)`,

    // 3. The work sessions themselves.
    //    break_started_at is an OPEN break; when it closes, the elapsed seconds
    //    fold into break_seconds and it goes back to NULL. Keeping the running
    //    break as a timestamp rather than a second table means a phone that
    //    dies mid-break loses nothing — the clock-out closes it.
    sql`CREATE TABLE IF NOT EXISTS stock_attendance_entries (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES stock_app_users(id) ON DELETE CASCADE,
          work_date DATE NOT NULL,
          clock_in_at TIMESTAMP NOT NULL,
          clock_out_at TIMESTAMP,
          break_seconds INTEGER NOT NULL DEFAULT 0,
          break_started_at TIMESTAMP,
          source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'kiosk', 'manual')),
          location_id BIGINT REFERENCES stock_locations(id),
          in_lat NUMERIC(9, 6),
          in_lng NUMERIC(9, 6),
          out_lat NUMERIC(9, 6),
          out_lng NUMERIC(9, 6),
          is_outside_geofence BOOLEAN NOT NULL DEFAULT FALSE,
          note TEXT,
          edited_by BIGINT REFERENCES stock_app_users(id),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

    sql`ALTER TABLE stock_attendance_entries DROP CONSTRAINT IF EXISTS stock_attendance_entries_span_valid`,
    sql`ALTER TABLE stock_attendance_entries
          ADD CONSTRAINT stock_attendance_entries_span_valid
          CHECK (clock_out_at IS NULL OR clock_out_at > clock_in_at)`,
    sql`ALTER TABLE stock_attendance_entries DROP CONSTRAINT IF EXISTS stock_attendance_entries_break_valid`,
    sql`ALTER TABLE stock_attendance_entries
          ADD CONSTRAINT stock_attendance_entries_break_valid
          CHECK (break_seconds >= 0)`,

    //    THE guard: at most one open session per person. A partial unique index
    //    is the whole double-punch defence — the API's SELECT ... FOR UPDATE is
    //    the polite path, this is the one that cannot be raced.
    //    is_active is in the predicate so that soft-deleting a mistaken punch-in
    //    frees the slot instead of locking that person out of punching again.
    //    Every query for "the open entry" must filter is_active to match.
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_open
          ON stock_attendance_entries(user_id)
          WHERE clock_out_at IS NULL AND is_active`,
    sql`CREATE INDEX IF NOT EXISTS idx_attendance_date_user
          ON stock_attendance_entries(work_date DESC, user_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_attendance_user_date
          ON stock_attendance_entries(user_id, work_date DESC)`,

    // 4. Singleton work-rule config. The id = 1 CHECK is what makes it a
    //    singleton: a second row is rejected by the database, so no caller has
    //    to wonder which row is "the" settings row.
    sql`CREATE TABLE IF NOT EXISTS stock_attendance_settings (
          id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          shift_start TIME NOT NULL DEFAULT '09:30',
          shift_end TIME NOT NULL DEFAULT '19:00',
          full_day_minutes INT NOT NULL DEFAULT 480,
          half_day_minutes INT NOT NULL DEFAULT 240,
          grace_minutes INT NOT NULL DEFAULT 15,
          weekly_off_dow INT NOT NULL DEFAULT 0 CHECK (weekly_off_dow BETWEEN 0 AND 6),
          overtime_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.5,
          geofence_radius_m INT NOT NULL DEFAULT 200,
          updated_by BIGINT REFERENCES stock_app_users(id),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
    sql`INSERT INTO stock_attendance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,

    // 5. Holidays. Without these the payroll denominator (working days in the
    //    month) is wrong, and every present day is silently underpaid.
    sql`CREATE TABLE IF NOT EXISTS stock_holidays (
          id BIGSERIAL PRIMARY KEY,
          holiday_date DATE NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_by BIGINT REFERENCES stock_app_users(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

    // 6. Leave. Approved 'paid' leave counts as a present day for payroll;
    //    'unpaid' does not. The other types are reporting labels.
    sql`CREATE TABLE IF NOT EXISTS stock_leave_requests (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES stock_app_users(id) ON DELETE CASCADE,
          from_date DATE NOT NULL,
          to_date DATE NOT NULL,
          leave_type TEXT NOT NULL DEFAULT 'paid' CHECK (leave_type IN ('paid', 'unpaid', 'sick', 'casual')),
          reason TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          decided_by BIGINT REFERENCES stock_app_users(id),
          decided_at TIMESTAMP,
          decision_note TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
    sql`ALTER TABLE stock_leave_requests DROP CONSTRAINT IF EXISTS stock_leave_requests_range_valid`,
    sql`ALTER TABLE stock_leave_requests
          ADD CONSTRAINT stock_leave_requests_range_valid CHECK (to_date >= from_date)`,
    sql`CREATE INDEX IF NOT EXISTS idx_leave_user_range
          ON stock_leave_requests(user_id, from_date, to_date)`,
    sql`CREATE INDEX IF NOT EXISTS idx_leave_status
          ON stock_leave_requests(status, created_at DESC)`,

    // 7. Paired kiosk devices. Only the bcrypt hash of the device token is
    //    stored — the plaintext is shown once at pairing and then lives only in
    //    the tablet's httpOnly cookie. A stolen database dump does not let you
    //    punch for anyone.
    sql`CREATE TABLE IF NOT EXISTS stock_kiosk_devices (
          id BIGSERIAL PRIMARY KEY,
          label TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          location_id BIGINT REFERENCES stock_locations(id),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMP,
          created_by BIGINT REFERENCES stock_app_users(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
    sql`CREATE INDEX IF NOT EXISTS idx_kiosk_devices_active
          ON stock_kiosk_devices(is_active) WHERE is_active`,
  ]);

  // --- Verify ---------------------------------------------------------------
  const [check] = await sql`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'stock_app_users'
           AND column_name IN ('attendance_pin_hash', 'tracks_attendance', 'has_login')) AS user_cols,
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'stock_locations'
           AND column_name IN ('latitude', 'longitude')) AS location_cols,
      (SELECT COUNT(*) FROM information_schema.tables
         WHERE table_name IN ('stock_attendance_entries', 'stock_attendance_settings',
                              'stock_holidays', 'stock_leave_requests', 'stock_kiosk_devices')) AS tables,
      (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_attendance_one_open') AS open_guard,
      (SELECT COUNT(*) FROM stock_attendance_settings) AS settings_rows
  `;
  console.log('✓ Attendance migration complete.');
  console.log(`  stock_app_users columns (3): ${check.user_cols}`);
  console.log(`  stock_locations columns (2): ${check.location_cols}`);
  console.log(`  new tables (5):              ${check.tables}`);
  console.log(`  one-open-punch index:        ${Number(check.open_guard) ? 'yes' : 'NO'}`);
  console.log(`  settings row (1):            ${check.settings_rows}`);
}

run().catch((err) => {
  console.error('✗ Migration failed (rolled back, database unchanged):', err.message);
  process.exit(1);
});
