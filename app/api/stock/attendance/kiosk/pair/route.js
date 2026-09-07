import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { IST_NOW, KIOSK_COOKIE, KIOSK_COOKIE_MAX_AGE } from '@/lib/attendance-db';

/**
 * Exchange a pairing token for the device cookie. Unauthenticated by design:
 * the manager who created the token opens this link on the tablet, which has no
 * session of its own. Holding the token IS the authorisation — which is why the
 * token is 256 CSPRNG bits and is shown exactly once.
 */
export async function POST(request) {
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const raw = String(body?.token || '');
    const separator = raw.indexOf('.');
    if (separator <= 0) {
      return NextResponse.json({ error: 'Invalid pairing token' }, { status: 400 });
    }

    const deviceId = Number(raw.slice(0, separator));
    const secret = raw.slice(separator + 1);
    if (!Number.isInteger(deviceId) || deviceId <= 0 || !secret) {
      return NextResponse.json({ error: 'Invalid pairing token' }, { status: 400 });
    }

    const rows = await sql(
      `SELECT d.id, d.label, d.token_hash, l.name AS location_name
         FROM stock_kiosk_devices d
         LEFT JOIN stock_locations l ON l.id = d.location_id
        WHERE d.id = $1 AND d.is_active`,
      [deviceId]
    );
    const device = rows[0];

    // Same message whether the device is unknown or the secret is wrong.
    if (!device || !(await bcrypt.compare(secret, device.token_hash))) {
      return NextResponse.json({ error: 'Invalid pairing token' }, { status: 403 });
    }

    await sql(`UPDATE stock_kiosk_devices SET last_seen_at = ${IST_NOW} WHERE id = $1`, [device.id]);

    const response = NextResponse.json({
      device: { id: Number(device.id), label: device.label, locationName: device.location_name },
    });
    response.cookies.set(KIOSK_COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: KIOSK_COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to pair device', detail: error.message }, { status: 500 });
  }
}

/** Unpair this tablet — the local half of revoking a device. */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(KIOSK_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
