import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { IST_NOW, logTimeline, serializeLeave } from '@/lib/attendance-db';

/** Approve or reject. Approved paid leave earns a day in payroll, so it is
 *  manager-only and the decision is stamped with who made it. */
export async function PATCH(request, { params }) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!getRoleFlags(appUser?.role).canManageAttendance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = Number((await params)?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const status = String(body?.status || '');
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'status must be approved, rejected or pending' }, { status: 400 });
    }

    const rows = await sql(
      `UPDATE stock_leave_requests
          SET status = $1,
              decided_by = $2,
              decided_at = ${IST_NOW},
              decision_note = $3,
              updated_at = ${IST_NOW}
        WHERE id = $4
        RETURNING *`,
      [status, appUser.id, body?.note ? String(body.note) : null, id]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });

    await logTimeline({
      eventType: 'other',
      entityType: 'leave_request',
      entityId: id,
      summary: `${appUser.name} ${status} a leave request`,
      details: { status, note: body?.note || null },
      userId: appUser.id,
    });

    return NextResponse.json({ leaveRequest: serializeLeave(rows[0]) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update leave request', detail: error.message }, { status: 500 });
  }
}
