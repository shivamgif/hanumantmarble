import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { DATE_RE, serializeLeave } from '@/lib/attendance-db';

const LEAVE_TYPES = ['paid', 'unpaid', 'sick', 'casual'];

/** Own requests always; everyone's only with canViewAllAttendance. */
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  const flags = getRoleFlags(appUser.role);
  const { searchParams } = new URL(request.url);
  const wantsAll = searchParams.get('scope') === 'all';
  const status = searchParams.get('status');

  if (wantsAll && !flags.canViewAllAttendance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const params = [];
    const where = [];
    if (!wantsAll) {
      params.push(appUser.id);
      where.push(`r.user_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}`);
    }

    const rows = await sql(
      `SELECT r.*, u.name AS user_name, d.name AS decided_by_name
         FROM stock_leave_requests r
         JOIN stock_app_users u ON u.id = r.user_id
         LEFT JOIN stock_app_users d ON d.id = r.decided_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.created_at DESC
        LIMIT 500`,
      params
    );

    return NextResponse.json({
      leaveRequests: rows.map(serializeLeave),
      canManage: flags.canManageAttendance,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load leave requests', detail: error.message }, { status: 500 });
  }
}

/**
 * Request leave. Employees request for themselves; a manager may file one on
 * behalf of someone else (the non-login staff have no way to ask otherwise).
 */
export async function POST(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const flags = getRoleFlags(appUser.role);

    let userId = Number(appUser.id);
    if (body?.userId && Number(body.userId) !== userId) {
      if (!flags.canManageAttendance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      userId = Number(body.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
      }
    }

    const fromDate = String(body?.fromDate || '');
    const toDate = String(body?.toDate || fromDate);
    const leaveType = String(body?.leaveType || 'paid');

    if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
      return NextResponse.json({ error: 'fromDate and toDate must be YYYY-MM-DD' }, { status: 400 });
    }
    if (toDate < fromDate) {
      return NextResponse.json({ error: 'toDate must not be before fromDate' }, { status: 400 });
    }
    if (!LEAVE_TYPES.includes(leaveType)) {
      return NextResponse.json({ error: `leaveType must be one of ${LEAVE_TYPES.join(', ')}` }, { status: 400 });
    }

    // A manager filing on someone's behalf has already made the decision, so
    // don't make them approve their own entry afterwards.
    const selfFiled = userId === Number(appUser.id);
    const status = selfFiled ? 'pending' : 'approved';

    const rows = await sql(
      `INSERT INTO stock_leave_requests
         (user_id, from_date, to_date, leave_type, reason, status, decided_by, decided_at)
       VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        fromDate,
        toDate,
        leaveType,
        body?.reason ? String(body.reason) : null,
        status,
        selfFiled ? null : appUser.id,
        selfFiled ? null : new Date(),
      ]
    );

    return NextResponse.json({ leaveRequest: serializeLeave(rows[0]) }, { status: 201 });
  } catch (error) {
    if (error?.code === '23503') return NextResponse.json({ error: 'Unknown employee' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to create leave request', detail: error.message }, { status: 500 });
  }
}
