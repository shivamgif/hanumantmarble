import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { IST_NOW, logTimeline, serializeEntry } from '@/lib/attendance-db';

async function guard(request, params) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) {
    return { error: NextResponse.json({ error: 'Database not configured' }, { status: 503 }) };
  }
  if (!getRoleFlags(appUser?.role).canManageAttendance) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const id = Number((await params)?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  return { session, appUser, id };
}

/** Correct an entry: times, break, or note. Every edit stamps edited_by. */
export async function PATCH(request, { params }) {
  const gate = await guard(request, params);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const updates = [];
    const values = [];

    const push = (column, value, cast = '') => {
      values.push(value);
      updates.push(`${column} = $${values.length}${cast}`);
    };

    if (body.clockInAt !== undefined) push('clock_in_at', String(body.clockInAt), '::timestamp');
    if (body.clockOutAt !== undefined) {
      push('clock_out_at', body.clockOutAt ? String(body.clockOutAt) : null, '::timestamp');
    }
    if (body.breakMinutes !== undefined) {
      push('break_seconds', Math.max(0, Math.round(Number(body.breakMinutes || 0) * 60)));
    }
    if (body.note !== undefined) push('note', body.note ? String(body.note) : null);

    if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    values.push(gate.appUser.id);
    updates.push(`edited_by = $${values.length}`);
    updates.push(`updated_at = ${IST_NOW}`);

    values.push(gate.id);
    const rows = await sql(
      `UPDATE stock_attendance_entries SET ${updates.join(', ')}
        WHERE id = $${values.length} AND is_active
        RETURNING *`,
      values
    );
    if (!rows[0]) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    await logTimeline({
      eventType: 'other',
      entityType: 'attendance',
      entityId: gate.id,
      summary: `${gate.appUser.name} corrected an attendance entry`,
      details: { changes: body },
      userId: gate.appUser.id,
    });

    return NextResponse.json({ entry: serializeEntry(rows[0]) });
  } catch (error) {
    // The span/break CHECK constraints reject an incoherent correction.
    if (error?.code === '23514') {
      return NextResponse.json({ error: 'Clock-out must be after clock-in' }, { status: 400 });
    }
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'That employee already has an open punch' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update entry', detail: error.message }, { status: 500 });
  }
}

/** Soft delete, matching the house convention for every other stock resource. */
export async function DELETE(request, { params }) {
  const gate = await guard(request, params);
  if (gate.error) return gate.error;

  try {
    const rows = await sql(
      `UPDATE stock_attendance_entries
          SET is_active = FALSE, edited_by = $1, updated_at = ${IST_NOW}
        WHERE id = $2 AND is_active
        RETURNING id`,
      [gate.appUser.id, gate.id]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    await logTimeline({
      eventType: 'other',
      entityType: 'attendance',
      entityId: gate.id,
      summary: `${gate.appUser.name} removed an attendance entry`,
      userId: gate.appUser.id,
    });

    return NextResponse.json({ success: true, id: gate.id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete entry', detail: error.message }, { status: 500 });
  }
}
