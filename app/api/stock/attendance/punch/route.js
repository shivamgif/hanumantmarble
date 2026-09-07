import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { withTransaction } from '@/lib/db';
import { isOutsideGeofence, openEntryMinutes } from '@/lib/attendance.mjs';
import {
  IST_NOW,
  getOpenEntry,
  logTimeline,
  loadSettings,
  readLatLng,
  resolvePunchLocation,
  serializeEntry,
} from '@/lib/attendance-db';

const ACTIONS = ['in', 'out', 'break_start', 'break_end'];

/**
 * Self-service punch. Unlike every other stock route this is NOT role-gated —
 * everybody who is tracked punches for themselves. The gate is "you have an
 * active app user record", and the row is always written for THAT user, never
 * for a user id supplied by the client. Punching for someone else goes through
 * the manager edit route or the kiosk.
 */
export async function POST(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) {
    return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });
  }
  if (appUser.status !== 'active' || appUser.tracks_attendance === false) {
    return NextResponse.json({ error: 'Attendance is not enabled for this account' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 });
    }

    const { lat, lng } = readLatLng(body);
    const settings = await loadSettings();
    const location = await resolvePunchLocation({ locationId: body?.locationId, lat, lng, appUser });
    const outsideFence = isOutsideGeofence(lat, lng, location, settings);

    const entry = await withTransaction(async (tx) => {
      // FOR UPDATE serialises two taps from the same person; the partial unique
      // index idx_attendance_one_open is the backstop that cannot be raced.
      const openRows = await tx(
        `SELECT * FROM stock_attendance_entries
         WHERE user_id = $1 AND clock_out_at IS NULL AND is_active
         LIMIT 1
         FOR UPDATE`,
        [appUser.id]
      );
      const open = openRows[0] || null;

      if (action === 'in') {
        if (open) throw Object.assign(new Error('Already clocked in'), { status: 409 });

        // work_date and clock_in_at both come from the SERVER clock. A client
        // could otherwise back-date a shift by lying about the time.
        const rows = await tx(
          `INSERT INTO stock_attendance_entries
             (user_id, work_date, clock_in_at, source, location_id, in_lat, in_lng, is_outside_geofence)
           VALUES ($1, ${IST_NOW}::date, ${IST_NOW}, 'web', $2, $3, $4, $5)
           RETURNING *`,
          [appUser.id, location?.id || null, lat, lng, outsideFence]
        );
        return rows[0];
      }

      if (!open) throw Object.assign(new Error('Not clocked in'), { status: 400 });

      if (action === 'break_start') {
        if (open.break_started_at) throw Object.assign(new Error('Break already running'), { status: 409 });
        const rows = await tx(
          `UPDATE stock_attendance_entries
             SET break_started_at = ${IST_NOW}, updated_at = ${IST_NOW}
           WHERE id = $1 RETURNING *`,
          [open.id]
        );
        return rows[0];
      }

      if (action === 'break_end') {
        if (!open.break_started_at) throw Object.assign(new Error('No break running'), { status: 400 });
        const rows = await tx(
          `UPDATE stock_attendance_entries
             SET break_seconds = break_seconds + GREATEST(0, EXTRACT(EPOCH FROM (${IST_NOW} - break_started_at))::int),
                 break_started_at = NULL,
                 updated_at = ${IST_NOW}
           WHERE id = $1 RETURNING *`,
          [open.id]
        );
        return rows[0];
      }

      // action === 'out'. An open break folds into break_seconds so a phone
      // that died mid-break still closes out with the right total.
      const rows = await tx(
        `UPDATE stock_attendance_entries
           SET clock_out_at = ${IST_NOW},
               break_seconds = break_seconds + CASE
                 WHEN break_started_at IS NULL THEN 0
                 ELSE GREATEST(0, EXTRACT(EPOCH FROM (${IST_NOW} - break_started_at))::int)
               END,
               break_started_at = NULL,
               out_lat = $2,
               out_lng = $3,
               is_outside_geofence = is_outside_geofence OR $4,
               updated_at = ${IST_NOW}
         WHERE id = $1 RETURNING *`,
        [open.id, lat, lng, outsideFence]
      );
      return rows[0];
    });

    await logTimeline({
      eventType: 'other',
      entityType: 'attendance',
      entityId: entry.id,
      summary: `${appUser.name} punched ${action.replace('_', ' ')}`,
      details: { action, source: 'web', outsideFence, locationId: location?.id || null },
      userId: appUser.id,
    });

    const serialized = serializeEntry(entry);
    return NextResponse.json(
      {
        entry: serialized,
        // The client ticks its own counter from here rather than re-deriving it
        // from timestamps, which keeps browser timezone out of the arithmetic.
        elapsedMinutes: openEntryMinutes(entry),
        outsideGeofence: outsideFence,
        location: location ? { id: Number(location.id), name: location.name } : null,
      },
      { status: action === 'in' ? 201 : 200 }
    );
  } catch (error) {
    // The partial unique index surfaces a race as 23505; report it as the
    // conflict it is rather than a 500.
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Already clocked in' }, { status: 409 });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to record punch', detail: error.detail },
      { status: error.status || 500 }
    );
  }
}

/** Current punch state for the signed-in employee. */
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  try {
    const open = await getOpenEntry(appUser.id);
    return NextResponse.json({
      entry: serializeEntry(open),
      elapsedMinutes: open ? openEntryMinutes(open) : 0,
      onBreak: Boolean(open?.break_started_at),
      tracksAttendance: appUser.tracks_attendance !== false,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load punch state', detail: error.message }, { status: 500 });
  }
}
