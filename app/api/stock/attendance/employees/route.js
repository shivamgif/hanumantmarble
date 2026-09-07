import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { IST_NOW } from '@/lib/attendance-db';

/**
 * The employee picker for the attendance screens. Separate from
 * /api/stock/users because that route is manager-only, while an admin or a
 * read_only_admin also needs to pick a name to view a timesheet.
 *
 * Salary is included only for canManageAttendance — the same pattern as the
 * canSeeRevenue flag in /api/stock/product-sales.
 */
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  const flags = getRoleFlags(appUser.role);
  if (!flags.canViewAllAttendance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const rows = await sql(
      `SELECT u.id, u.name, u.role, u.department, u.status, u.has_login,
              u.tracks_attendance, u.salary,
              (u.attendance_pin_hash IS NOT NULL) AS has_pin,
              (e.id IS NOT NULL) AS is_clocked_in,
              e.clock_in_at
         FROM stock_app_users u
         LEFT JOIN stock_attendance_entries e
           ON e.user_id = u.id AND e.clock_out_at IS NULL AND e.is_active
        WHERE u.status = 'active'
        ORDER BY u.name`,
      []
    );

    return NextResponse.json({
      employees: rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        role: r.role,
        department: r.department,
        hasLogin: r.has_login !== false,
        tracksAttendance: r.tracks_attendance !== false,
        hasPin: Boolean(r.has_pin),
        isClockedIn: Boolean(r.is_clocked_in),
        // Never expose a hash, and only expose pay to someone who manages pay.
        salary: flags.canManageAttendance && r.salary !== null ? Number(r.salary) : null,
      })),
      canManage: flags.canManageAttendance,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load employees', detail: error.message }, { status: 500 });
  }
}

/** Toggle whether someone is tracked, and set their monthly salary. */
export async function PATCH(request) {
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
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    const updates = [];
    const values = [];
    if (body.tracksAttendance !== undefined) {
      values.push(Boolean(body.tracksAttendance));
      updates.push(`tracks_attendance = $${values.length}`);
    }
    if (body.salary !== undefined) {
      const salary = body.salary === null || body.salary === '' ? null : Number(body.salary);
      if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
        return NextResponse.json({ error: 'Salary must be a positive number' }, { status: 400 });
      }
      values.push(salary);
      updates.push(`salary = $${values.length}`);
    }
    if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    values.push(userId);
    const rows = await sql(
      `UPDATE stock_app_users SET ${updates.join(', ')}, updated_at = ${IST_NOW}
        WHERE id = $${values.length}
        RETURNING id, name, tracks_attendance, salary`,
      values
    );
    if (!rows[0]) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    return NextResponse.json({
      employee: {
        id: Number(rows[0].id),
        name: rows[0].name,
        tracksAttendance: rows[0].tracks_attendance !== false,
        salary: rows[0].salary === null ? null : Number(rows[0].salary),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update employee', detail: error.message }, { status: 500 });
  }
}
