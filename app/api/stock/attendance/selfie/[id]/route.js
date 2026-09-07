import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { selfieStore } from '@/lib/attendance-selfie.mjs';

/**
 * Serve one punch selfie.
 *
 * These are photographs of employees' faces, so the blob key is deliberately
 * NOT the address: the caller asks for an ENTRY id and the route looks the key
 * up after checking who is asking. That way a key leaking into a JSON response,
 * a log or a browser history grants nothing on its own, and revoking access is
 * a matter of role, not of rotating keys.
 *
 * You may see your own photo. Everyone else needs canViewAllAttendance — the
 * same flag that gates reading someone else's timesheet.
 *
 * GET /api/stock/attendance/selfie/<entryId>?which=in|out
 */
export async function GET(request, { params }) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  const id = Number((await params)?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const which = new URL(request.url).searchParams.get('which') || 'in';
  if (which !== 'in' && which !== 'out') {
    return NextResponse.json({ error: "which must be 'in' or 'out'" }, { status: 400 });
  }

  try {
    const rows = await sql(
      `SELECT user_id, in_selfie_key, out_selfie_key
         FROM stock_attendance_entries WHERE id = $1`,
      [id]
    );
    const entry = rows[0];
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwner = Number(entry.user_id) === Number(appUser.id);
    if (!isOwner && !getRoleFlags(appUser.role).canViewAllAttendance) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const key = which === 'in' ? entry.in_selfie_key : entry.out_selfie_key;
    if (!key) return NextResponse.json({ error: 'No selfie on this punch' }, { status: 404 });

    const store = selfieStore();
    // A key with no blob behind it is the normal state once the nightly purge
    // has run past the retention window, so it is a 404, not a 500.
    const bytes = store ? await store.get(key, { type: 'arrayBuffer' }) : null;
    if (!bytes) return NextResponse.json({ error: 'Selfie is no longer available' }, { status: 404 });

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'image/jpeg',
        // The bytes originated in a browser we do not control. Pin the type,
        // forbid sniffing, and never let a shared cache hold a staff photo.
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load selfie', detail: error.message }, { status: 500 });
  }
}
