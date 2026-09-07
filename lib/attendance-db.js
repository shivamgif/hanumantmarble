// Server-side attendance helpers. Everything that touches the database or the
// clock lives here; the arithmetic lives in lib/attendance.mjs (pure).
import { sql } from '@/lib/db';
import { recordTimelineEvent } from '@/lib/stock-workflow';
import { nearestLocation, normalizeSettings } from '@/lib/attendance.mjs';

/**
 * Timeline logging that cannot fail the request.
 *
 * Every attendance call site logs AFTER the punch has already committed, so
 * throwing here would tell an employee their punch failed when it did not —
 * and they would punch again. Log the failure loudly to the server console
 * (unlike lib/audit-logger.js, which swallows its errors and has therefore
 * been silently writing nothing) and let the request succeed.
 *
 * recorded_by_user_id is BIGINT: it takes stock_app_users.id, never
 * session.user.sub (a better-auth text id). Pass null for an actor that is not
 * an app user, such as a kiosk.
 */
export async function logTimeline(event) {
  try {
    return await recordTimelineEvent(event);
  } catch (error) {
    console.error('[attendance] timeline logging failed:', error.message, event?.summary);
    return null;
  }
}

// The business runs on IST and the columns are TIMESTAMP WITHOUT TIME ZONE, so
// every attendance timestamp is stored as IST wall-clock. That makes work_date
// the actual business day: a 21:00 IST punch belongs to that day, not to the
// next UTC one.
//
// ONE conversion, not two. NOW() is already timestamptz, so a single
// `AT TIME ZONE 'Asia/Kolkata'` yields the Kolkata wall clock as a plain
// timestamp. The two-step `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'` used
// in /api/stock/product-sales is correct only for a NAIVE column that already
// stores UTC — there, step one attaches the zone. Applying it to NOW() strips a
// real zone and then reinterprets, landing 9 hours off (16:15Z became 10:45
// instead of 19:45). Do not "restore" the product-sales form here.
export const IST_NOW = `(NOW() AT TIME ZONE 'Asia/Kolkata')`;

// The paired kiosk's device credential. httpOnly so page scripts on the tablet
// cannot read it, and long-lived because a showroom tablet is paired once.
export const KIOSK_COOKIE = 'hm-kiosk-token';
export const KIOSK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The singleton work-rule row, with defaults filled in for a fresh install. */
export async function loadSettings() {
  const rows = await sql('SELECT * FROM stock_attendance_settings WHERE id = 1', []);
  return normalizeSettings(rows[0] || null);
}

/**
 * Timestamps cross to the client as JSON. A TIMESTAMP WITHOUT TIME ZONE comes
 * back from the driver as a Date built in the server's local zone, and
 * JSON.stringify would then stamp a Z on it — so a 09:30 IST punch would read
 * as 15:00 in an IST browser. Serialize the wall-clock reading instead, with no
 * zone designator, and let the client treat it as already-local.
 */
export function wallClock(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Shape one entry row for the wire. */
export function serializeEntry(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    user_id: Number(row.user_id),
    work_date: String(row.work_date instanceof Date ? wallClock(row.work_date) : row.work_date).slice(0, 10),
    clock_in_at: wallClock(row.clock_in_at),
    clock_out_at: wallClock(row.clock_out_at),
    break_started_at: wallClock(row.break_started_at),
    break_seconds: Number(row.break_seconds || 0),
  };
}

/**
 * The employee's currently-open session, or null. The is_active filter must
 * match the predicate on idx_attendance_one_open — a soft-deleted punch-in is
 * not an open session and must not block the next one.
 */
export async function getOpenEntry(userId, runner = sql) {
  const rows = await runner(
    `SELECT * FROM stock_attendance_entries
     WHERE user_id = $1 AND clock_out_at IS NULL AND is_active
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

const LOCATION_COLUMNS = 'id, name, location_type, latitude, longitude';

async function locationById(id) {
  const rows = await sql(`SELECT ${LOCATION_COLUMNS} FROM stock_locations WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Which site a punch belongs to, in priority order:
 *
 *   1. An explicit location — a kiosk is bolted to a known branch, so its
 *      device row is the truth and GPS is irrelevant.
 *   2. The anchored location NEAREST the GPS fix. This is what makes multiple
 *      branches work: a salesperson covering another showroom is recorded
 *      there, not at their usual one.
 *   3. The employee's home branch, for a punch with no usable fix (indoors,
 *      permission denied). Attributed, but distance is unknown so it cannot be
 *      flagged either way.
 *   4. The only active location, if there is exactly one. With several and no
 *      other signal, return null rather than guess — a wrong branch is worse
 *      than a blank one, and guessing is exactly the bug this replaced
 *      (every punch landing on `ORDER BY id LIMIT 1`).
 */
export async function resolvePunchLocation({ locationId = null, lat = null, lng = null, appUser = null } = {}) {
  if (locationId) return locationById(locationId);

  if (lat !== null && lng !== null) {
    const anchored = await sql(
      `SELECT ${LOCATION_COLUMNS} FROM stock_locations
        WHERE is_active AND latitude IS NOT NULL AND longitude IS NOT NULL`,
      []
    );
    const nearest = nearestLocation(lat, lng, anchored);
    if (nearest) return nearest.location;
  }

  if (appUser?.default_location_id) return locationById(appUser.default_location_id);

  const active = await sql(
    `SELECT ${LOCATION_COLUMNS} FROM stock_locations WHERE is_active ORDER BY id LIMIT 2`,
    []
  );
  return active.length === 1 ? active[0] : null;
}

// readCoordinate is pure, so it lives in lib/attendance.mjs where the test
// suite can import it without the @/ alias. Re-exported here so route files
// keep a single attendance-db import.
export { readCoordinate, readLatLng } from '@/lib/attendance.mjs';

/** A DATE column, as a plain YYYY-MM-DD string. */
export function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return wallClock(value).slice(0, 10);
  return String(value).slice(0, 10);
}

export function serializeLeave(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    user_id: Number(row.user_id),
    from_date: isoDate(row.from_date),
    to_date: isoDate(row.to_date),
  };
}

/** Employees included in attendance reporting and payroll. */
export const TRACKED_USER_FILTER = `status = 'active' AND tracks_attendance`;
