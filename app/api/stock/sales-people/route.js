import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ salesPeople: [], message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const salesPeople = await sql('SELECT * FROM stock_sales_people ORDER BY created_at DESC', []);
    return NextResponse.json({ salesPeople });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load sales people', detail: error.message }, { status: 500 });
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

  const body = await request.json();

  try {
    const rows = await sql(
      `INSERT INTO stock_sales_people (name, phone, email, whatsapp_phone, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [body.name, body.phone, body.email || null, body.whatsappPhone || body.phone || null, body.notes || null]
    );

    return NextResponse.json({ salesPerson: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save sales person', detail: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
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

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const rows = await sql(
      `UPDATE stock_sales_people
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return NextResponse.json({ salesPerson: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to remove sales person', detail: error.message }, { status: 500 });
  }
}