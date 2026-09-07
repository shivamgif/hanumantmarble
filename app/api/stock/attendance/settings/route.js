import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { normalizeSettings } from '@/lib/attendance.mjs';
import { IST_NOW, loadSettings } from '@/lib/attendance-db';

// Every employee reads these — the clock-in screen needs the shift times to say
// "you are 10 minutes late". Only a manager writes them.
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const [settings, holidays] = await Promise.all([
      loadSettings(),
      sql('SELECT id, holiday_date, name FROM stock_holidays ORDER BY holiday_date DESC LIMIT 200', []),
    ]);
    return NextResponse.json({
      settings,
      holidays: holidays.map((h) => ({
        id: Number(h.id),
        holiday_date: String(h.holiday_date instanceof Date ? h.holiday_date.toISOString() : h.holiday_date).slice(0, 10),
        name: h.name,
      })),
      canManage: getRoleFlags(appUser?.role).canManageAttendance,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load settings', detail: error.message }, { status: 500 });
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PUT(request) {
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
    const next = normalizeSettings({ ...(await loadSettings()), ...body });

    // These drive pay. A typo here silently misprices every payslip for the
    // month, so validate rather than clamp.
    if (!TIME_RE.test(next.shift_start) || !TIME_RE.test(next.shift_end)) {
      return NextResponse.json({ error: 'Shift times must be HH:MM' }, { status: 400 });
    }
    if (next.full_day_minutes < 1 || next.full_day_minutes > 1440) {
      return NextResponse.json({ error: 'Full day must be between 1 and 1440 minutes' }, { status: 400 });
    }
    if (next.half_day_minutes < 1 || next.half_day_minutes > next.full_day_minutes) {
      return NextResponse.json({ error: 'Half day must be between 1 minute and the full day' }, { status: 400 });
    }
    if (next.grace_minutes < 0 || next.grace_minutes > 240) {
      return NextResponse.json({ error: 'Grace must be between 0 and 240 minutes' }, { status: 400 });
    }
    if (!Number.isInteger(next.weekly_off_dow) || next.weekly_off_dow < 0 || next.weekly_off_dow > 6) {
      return NextResponse.json({ error: 'Weekly off must be a day 0-6' }, { status: 400 });
    }
    if (next.overtime_multiplier < 0 || next.overtime_multiplier > 10) {
      return NextResponse.json({ error: 'Overtime multiplier must be between 0 and 10' }, { status: 400 });
    }
    if (next.geofence_radius_m < 0 || next.geofence_radius_m > 100000) {
      return NextResponse.json({ error: 'Geofence radius must be between 0 and 100000 m' }, { status: 400 });
    }

    const rows = await sql(
      `UPDATE stock_attendance_settings
          SET shift_start = $1::time, shift_end = $2::time,
              full_day_minutes = $3, half_day_minutes = $4, grace_minutes = $5,
              weekly_off_dow = $6, overtime_multiplier = $7, geofence_radius_m = $8,
              updated_by = $9, updated_at = ${IST_NOW}
        WHERE id = 1
        RETURNING *`,
      [
        next.shift_start,
        next.shift_end,
        next.full_day_minutes,
        next.half_day_minutes,
        next.grace_minutes,
        next.weekly_off_dow,
        next.overtime_multiplier,
        next.geofence_radius_m,
        appUser.id,
      ]
    );

    return NextResponse.json({ settings: normalizeSettings(rows[0]) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save settings', detail: error.message }, { status: 500 });
  }
}
