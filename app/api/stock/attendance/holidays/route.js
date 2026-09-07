import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { DATE_RE } from '@/lib/attendance-db';

// Holidays change the payroll denominator, so only a manager touches them.
// Reading them is on /api/stock/attendance/settings alongside the work rules.
async function guard(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) {
    return { error: NextResponse.json({ error: 'Database not configured' }, { status: 503 }) };
  }
  if (!getRoleFlags(appUser?.role).canManageAttendance) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { appUser };
}

export async function POST(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || '');
    const name = String(body?.name || '').trim();

    if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const rows = await sql(
      `INSERT INTO stock_holidays (holiday_date, name, created_by)
       VALUES ($1::date, $2, $3)
       ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, holiday_date, name`,
      [date, name, gate.appUser.id]
    );

    return NextResponse.json(
      { holiday: { id: Number(rows[0].id), holiday_date: date, name: rows[0].name } },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save holiday', detail: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const rows = await sql('DELETE FROM stock_holidays WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete holiday', detail: error.message }, { status: 500 });
  }
}
