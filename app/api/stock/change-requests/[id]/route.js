import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

export async function PATCH(request, context) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const id = context.params.id;
    const body = await request.json();
    const action = body.action || 'review';

    let newStatus = 'reviewed';

    if (action === 'approve') {
      newStatus = 'approved';
    } else if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'implement') {
      newStatus = 'implemented';
    }

    const rows = await sql(
      `UPDATE stock_change_requests
       SET status = $1,
           reviewed_by_user_id = COALESCE($2, reviewed_by_user_id),
           reviewed_at = COALESCE(reviewed_at, NOW()),
           reviewed_notes = COALESCE($3, reviewed_notes),
           approved_by_user_id = CASE WHEN $4 = 'approved' OR $4 = 'implemented' THEN COALESCE($2, approved_by_user_id) ELSE approved_by_user_id END,
           approved_at = CASE WHEN $4 = 'approved' OR $4 = 'implemented' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
           approval_notes = CASE WHEN $4 = 'approved' OR $4 = 'implemented' THEN COALESCE($3, approval_notes) ELSE approval_notes END,
           implemented_by_user_id = CASE WHEN $4 = 'implemented' THEN COALESCE($2, implemented_by_user_id) ELSE implemented_by_user_id END,
           implemented_at = CASE WHEN $4 = 'implemented' THEN COALESCE(implemented_at, NOW()) ELSE implemented_at END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [newStatus, appUser?.id || null, body.notes || null, newStatus, id]
    );

    await recordTimelineEvent({
      eventType: newStatus === 'rejected' ? 'change_rejected' : newStatus === 'approved' ? 'change_approved' : 'other',
      entityType: 'change_request',
      entityId: Number(id),
      summary: `Change request ${newStatus}`,
      details: rows[0],
      userId: appUser?.id || null,
    });

    return NextResponse.json({ request: rows[0] });
  } catch (error) {
    console.error('Failed to update change request:', error);
    return NextResponse.json({ error: 'Failed to update change request', detail: error.message }, { status: 500 });
  }
}
