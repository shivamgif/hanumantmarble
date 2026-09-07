import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { classifyDay, entryMinutes } from '@/lib/attendance.mjs';
import { DATE_RE, IST_NOW, MONTH_RE, loadSettings, serializeEntry } from '@/lib/attendance-db';

/**
 * Timesheet rows. Everyone can read their own; only canViewAllAttendance can
 * read anyone else's. A userId in the query string is honoured ONLY after that
 * check — otherwise any salesperson could read a colleague's whole month.
 *
 * ?month=YYYY-MM (default: current) | ?date=YYYY-MM-DD | ?userId=<id>
 */
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  const flags = getRoleFlags(appUser.role);
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const requestedUserId = searchParams.get('userId');

  if (date && !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date, expected YYYY-MM-DD' }, { status: 400 });
  }
  if (!date && !MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid month, expected YYYY-MM' }, { status: 400 });
  }

  // Resolve scope BEFORE querying. 'all' is only reachable with the flag.
  let scopeUserId = Number(appUser.id);
  let scopeAll = false;
  if (requestedUserId === 'all') {
    if (!flags.canViewAllAttendance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    scopeAll = true;
  } else if (requestedUserId) {
    const parsed = Number(requestedUserId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }
    if (parsed !== Number(appUser.id) && !flags.canViewAllAttendance) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    scopeUserId = parsed;
  }

  try {
    const settings = await loadSettings();
    const params = [];
    const where = ['e.is_active'];

    if (!scopeAll) {
      params.push(scopeUserId);
      where.push(`e.user_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      where.push(`e.work_date = $${params.length}::date`);
    } else {
      params.push(`${month}-01`);
      where.push(`e.work_date >= $${params.length}::date`);
      where.push(`e.work_date < ($${params.length}::date + INTERVAL '1 month')`);
    }

    const rows = await sql(
      `SELECT e.*, u.name AS user_name, u.role AS user_role, u.department, l.name AS location_name
         FROM stock_attendance_entries e
         JOIN stock_app_users u ON u.id = e.user_id
         LEFT JOIN stock_locations l ON l.id = e.location_id
        WHERE ${where.join(' AND ')}
        ORDER BY e.work_date DESC, e.clock_in_at DESC`,
      params
    );

    const entries = rows.map((row) => {
      const minutes = entryMinutes(row);
      const verdict = classifyDay(minutes, row.clock_in_at, settings);
      return {
        ...serializeEntry(row),
        user_name: row.user_name,
        location_name: row.location_name,
        workedMinutes: minutes,
        isLate: verdict.isLate,
        lateMinutes: verdict.lateMinutes,
        isOpen: !row.clock_out_at,
      };
    });

    // "Who is in right now" for the team view — a single extra query rather
    // than making the client diff the list.
    let onDuty = [];
    if (scopeAll) {
      onDuty = (
        await sql(
          `SELECT e.id, e.user_id, u.name AS user_name, e.clock_in_at, e.break_started_at,
                  e.break_seconds, ${IST_NOW} AS server_now
             FROM stock_attendance_entries e
             JOIN stock_app_users u ON u.id = e.user_id
            WHERE e.clock_out_at IS NULL AND e.is_active
            ORDER BY e.clock_in_at`,
          []
        )
      ).map((row) => ({
        ...serializeEntry(row),
        user_name: row.user_name,
        onBreak: Boolean(row.break_started_at),
      }));
    }

    return NextResponse.json({
      entries,
      onDuty,
      settings,
      scope: scopeAll ? 'all' : String(scopeUserId),
      canViewAll: flags.canViewAllAttendance,
      canManage: flags.canManageAttendance,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load attendance', detail: error.message }, { status: 500 });
  }
}

/**
 * Manager-entered attendance (the "admin marks it manually" path), and
 * corrections for staff who forgot to punch out.
 */
export async function POST(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!getRoleFlags(appUser?.role).canManageAttendance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = Number(body?.userId);
    const workDate = String(body?.workDate || '');
    const clockIn = String(body?.clockInAt || '');
    const clockOut = body?.clockOutAt ? String(body.clockOutAt) : null;

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!DATE_RE.test(workDate)) {
      return NextResponse.json({ error: 'workDate must be YYYY-MM-DD' }, { status: 400 });
    }
    if (!clockIn) {
      return NextResponse.json({ error: 'clockInAt is required' }, { status: 400 });
    }
    if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
      return NextResponse.json({ error: 'clockOutAt must be after clockInAt' }, { status: 400 });
    }

    const breakSeconds = Math.max(0, Math.round(Number(body?.breakMinutes || 0) * 60));

    // A manual row with no clock-out would occupy the one-open-punch slot and
    // block the employee's next real punch, so require the pair.
    if (!clockOut) {
      return NextResponse.json({ error: 'clockOutAt is required for a manual entry' }, { status: 400 });
    }

    const rows = await sql(
      `INSERT INTO stock_attendance_entries
         (user_id, work_date, clock_in_at, clock_out_at, break_seconds, source, note, edited_by)
       VALUES ($1, $2::date, $3::timestamp, $4::timestamp, $5, 'manual', $6, $7)
       RETURNING *`,
      [userId, workDate, clockIn, clockOut, breakSeconds, body?.note || null, appUser.id]
    );

    return NextResponse.json({ entry: serializeEntry(rows[0]) }, { status: 201 });
  } catch (error) {
    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Unknown employee' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create entry', detail: error.message }, { status: 500 });
  }
}
