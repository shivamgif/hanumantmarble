import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';
import { openEntryMinutes } from '@/lib/attendance.mjs';
import { IST_NOW, KIOSK_COOKIE, logTimeline, serializeEntry } from '@/lib/attendance-db';

/**
 * Shared-tablet punching. This is the ONE route in the stock app that runs
 * without a session, so everything here is a trust boundary:
 *
 *   - The device must present a paired token cookie. No token, no roster —
 *     the employee list is not public.
 *   - The employee must present their PIN. PIN attempts are rate limited,
 *     because a 4-digit secret on a public URL is otherwise brute-forceable in
 *     minutes.
 *   - Failures never say WHICH half was wrong, so the roster cannot be used to
 *     enumerate valid PINs.
 *   - A kiosk can only punch; it can never read a timesheet, a salary or a
 *     phone number.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;

// ponytail: per-instance in-memory counter. Netlify runs several lambdas, so a
// determined attacker gets MAX_ATTEMPTS per instance rather than globally —
// still a hard cap on throughput, and the DB stays out of the hot path. Move
// to a stock_kiosk_attempts table if the kiosk is ever exposed beyond the LAN.
function attemptState() {
  if (!globalThis._kioskAttempts) globalThis._kioskAttempts = new Map();
  return globalThis._kioskAttempts;
}

function isLockedOut(key) {
  const entry = attemptState().get(key);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    attemptState().delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const state = attemptState();
  const entry = state.get(key);
  if (!entry || Date.now() > entry.until) {
    state.set(key, { count: 1, until: Date.now() + LOCKOUT_MS });
  } else {
    entry.count += 1;
    entry.until = Date.now() + LOCKOUT_MS;
  }
}

/** Resolve the paired device from the cookie, or null. */
async function resolveDevice(request) {
  const raw = request.cookies.get(KIOSK_COOKIE)?.value;
  if (!raw) return null;

  // Token is "<deviceId>.<secret>" — see the pairing route for why.
  const separator = raw.indexOf('.');
  if (separator <= 0) return null;

  const deviceId = Number(raw.slice(0, separator));
  const secret = raw.slice(separator + 1);
  if (!Number.isInteger(deviceId) || deviceId <= 0 || !secret) return null;

  const rows = await sql(
    `SELECT d.id, d.label, d.token_hash, d.location_id, l.name AS location_name
       FROM stock_kiosk_devices d
       LEFT JOIN stock_locations l ON l.id = d.location_id
      WHERE d.id = $1 AND d.is_active`,
    [deviceId]
  );
  const device = rows[0];
  if (!device) return null;

  const ok = await bcrypt.compare(secret, device.token_hash);
  if (!ok) return null;

  delete device.token_hash;
  return device;
}

/** Who can punch at this kiosk. Names and ids only — nothing else. */
export async function GET(request) {
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const device = await resolveDevice(request);
  if (!device) {
    return NextResponse.json({ error: 'This device is not paired' }, { status: 403 });
  }

  try {
    // Everyone with a PIN is returned, but this branch's own staff are marked
    // so the tablet can show them first. Staff cover other branches, so a hard
    // filter would leave a visitor unable to punch at all.
    const roster = await sql(
      `SELECT u.id, u.name, u.default_location_id, (e.id IS NOT NULL) AS is_clocked_in
         FROM stock_app_users u
         LEFT JOIN stock_attendance_entries e
           ON e.user_id = u.id AND e.clock_out_at IS NULL AND e.is_active
        WHERE u.status = 'active'
          AND u.tracks_attendance
          AND u.attendance_pin_hash IS NOT NULL
        ORDER BY (u.default_location_id IS DISTINCT FROM $1), u.name`,
      [device.location_id || null]
    );

    await sql(`UPDATE stock_kiosk_devices SET last_seen_at = ${IST_NOW} WHERE id = $1`, [device.id]);

    return NextResponse.json({
      device: { id: Number(device.id), label: device.label, locationName: device.location_name },
      // Deliberately no email, phone, role or salary: a kiosk is a public
      // screen in a showroom.
      employees: roster.map((r) => ({
        id: Number(r.id),
        name: r.name,
        isClockedIn: Boolean(r.is_clocked_in),
        // True when this is their usual branch. Still no email, phone, role or
        // salary — a kiosk is a public screen in a showroom.
        isHomeBranch: device.location_id != null && String(r.default_location_id) === String(device.location_id),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load roster', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const device = await resolveDevice(request);
  if (!device) {
    return NextResponse.json({ error: 'This device is not paired' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = Number(body?.userId);
    const pin = String(body?.pin || '');

    if (!Number.isInteger(userId) || userId <= 0 || !pin) {
      return NextResponse.json({ error: 'Select your name and enter your PIN' }, { status: 400 });
    }

    const lockKey = `${device.id}:${userId}`;
    if (isLockedOut(lockKey)) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in a few minutes or ask a manager.' },
        { status: 429 }
      );
    }

    const rows = await sql(
      `SELECT id, name, attendance_pin_hash
         FROM stock_app_users
        WHERE id = $1 AND status = 'active' AND tracks_attendance`,
      [userId]
    );
    const user = rows[0];

    // One message for "no such employee", "no PIN set" and "wrong PIN", so the
    // kiosk cannot be used to work out who exists or who has a PIN.
    const pinOk = user?.attendance_pin_hash ? await bcrypt.compare(pin, user.attendance_pin_hash) : false;
    if (!pinOk) {
      recordFailure(lockKey);
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }
    attemptState().delete(lockKey);

    // Toggle: whichever state they are in, do the other. A kiosk user should
    // not have to choose "in" or "out" — the system knows.
    const result = await withTransaction(async (tx) => {
      const openRows = await tx(
        `SELECT * FROM stock_attendance_entries
          WHERE user_id = $1 AND clock_out_at IS NULL AND is_active
          LIMIT 1
          FOR UPDATE`,
        [userId]
      );
      const open = openRows[0] || null;

      if (open) {
        const closed = await tx(
          `UPDATE stock_attendance_entries
              SET clock_out_at = ${IST_NOW},
                  break_seconds = break_seconds + CASE
                    WHEN break_started_at IS NULL THEN 0
                    ELSE GREATEST(0, EXTRACT(EPOCH FROM (${IST_NOW} - break_started_at))::int)
                  END,
                  break_started_at = NULL,
                  updated_at = ${IST_NOW}
            WHERE id = $1 RETURNING *`,
          [open.id]
        );
        return { action: 'out', entry: closed[0] };
      }

      const opened = await tx(
        `INSERT INTO stock_attendance_entries
           (user_id, work_date, clock_in_at, source, location_id)
         VALUES ($1, ${IST_NOW}::date, ${IST_NOW}, 'kiosk', $2)
         RETURNING *`,
        [userId, device.location_id || null]
      );
      return { action: 'in', entry: opened[0] };
    });

    await logTimeline({
      eventType: 'other',
      entityType: 'attendance',
      entityId: result.entry.id,
      summary: `${user.name} punched ${result.action} at kiosk "${device.label}"`,
      details: { source: 'kiosk', deviceId: Number(device.id) },
      // A kiosk is not an app user; recorded_by_user_id is BIGINT and the
      // acting device is already recorded in details above.
      userId: null,
    });

    return NextResponse.json({
      action: result.action,
      name: user.name,
      entry: serializeEntry(result.entry),
      elapsedMinutes: openEntryMinutes(result.entry),
    });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Already clocked in' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to record punch', detail: error.message }, { status: 500 });
  }
}
