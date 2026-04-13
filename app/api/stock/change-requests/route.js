import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, generateReference, getStockContext, hasAnyStockRole, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ requests: [], message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const requests = await sql(
      `SELECT *
       FROM stock_change_requests
       ORDER BY created_at DESC
       LIMIT 100`,
      []
    );

    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load change requests', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
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
    const body = await request.json();

    if (!body.sourceEntityType || !body.sourceEntityId || !body.reason) {
      return NextResponse.json({ error: 'sourceEntityType, sourceEntityId, and reason are required' }, { status: 400 });
    }

    const rows = await sql(
      `INSERT INTO stock_change_requests (
        request_number,
        source_entity_type,
        source_entity_id,
        request_type,
        status,
        requested_changes,
        original_snapshot,
        reason,
        requested_by_user_id,
        requested_by_name,
        priority,
        requires_higher_level_approval
      ) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,TRUE)
      RETURNING *`,
      [
        generateReference('CHR'),
        body.sourceEntityType,
        body.sourceEntityId,
        body.requestType || 'correct',
        JSON.stringify(body.requestedChanges || {}),
        JSON.stringify(body.originalSnapshot || {}),
        body.reason,
        appUser?.id || null,
        appUser?.name || session.user.name || session.user.email,
        body.priority || 'normal',
      ]
    );

    await recordTimelineEvent({
      eventType: 'change_requested',
      entityType: body.sourceEntityType,
      entityId: body.sourceEntityId,
      summary: `Change request ${rows[0].request_number} submitted`,
      details: rows[0],
      userId: appUser?.id || null,
    });

    return NextResponse.json({ request: rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Failed to create change request:', error);
    return NextResponse.json({ error: 'Failed to submit change request', detail: error.message }, { status: 500 });
  }
}
