import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { IST_NOW, logTimeline } from '@/lib/attendance-db';

const PIN_RE = /^\d{4,8}$/;

// Sequences a person picks first and an attacker guesses first.
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1122', '1212', '2580', '0123',
]);

/**
 * Set a kiosk PIN. Anyone may set their own; a manager may set anyone's, which
 * is the only way non-login staff get one at all.
 *
 * The PIN is a kiosk credential, never a login. It is stored bcrypt-hashed and
 * is never read back — a lost PIN is reset, not recovered.
 */
export async function PUT(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const flags = getRoleFlags(appUser.role);

    let targetId = Number(appUser.id);
    if (body?.userId && Number(body.userId) !== targetId) {
      if (!flags.canManageAttendance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      targetId = Number(body.userId);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
      }
    }

    // Clearing a PIN removes that person from the kiosk roster entirely.
    if (body?.pin === null || body?.pin === '') {
      const cleared = await sql(
        `UPDATE stock_app_users SET attendance_pin_hash = NULL, updated_at = ${IST_NOW}
          WHERE id = $1 RETURNING id`,
        [targetId]
      );
      if (!cleared[0]) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
      return NextResponse.json({ success: true, hasPin: false });
    }

    const pin = String(body?.pin || '');
    if (!PIN_RE.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4 to 8 digits' }, { status: 400 });
    }
    if (WEAK_PINS.has(pin)) {
      return NextResponse.json({ error: 'That PIN is too easy to guess. Pick another.' }, { status: 400 });
    }

    const hash = await bcrypt.hash(pin, 10);
    const rows = await sql(
      `UPDATE stock_app_users SET attendance_pin_hash = $1, updated_at = ${IST_NOW}
        WHERE id = $2 RETURNING id, name`,
      [hash, targetId]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    await logTimeline({
      eventType: 'other',
      entityType: 'attendance_pin',
      entityId: targetId,
      summary:
        targetId === Number(appUser.id)
          ? `${appUser.name} changed their kiosk PIN`
          : `${appUser.name} set a kiosk PIN for ${rows[0].name}`,
      userId: appUser.id,
    });

    return NextResponse.json({ success: true, hasPin: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to set PIN', detail: error.message }, { status: 500 });
  }
}
