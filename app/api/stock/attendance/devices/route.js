import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { logTimeline, wallClock } from '@/lib/attendance-db';

// Pairing a device hands out a punch-for-anyone capability, so this whole file
// is manager-only.
async function guard(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) {
    return { error: NextResponse.json({ error: 'Database not configured' }, { status: 503 }) };
  }
  if (!getRoleFlags(appUser?.role).canManageAttendance) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session, appUser };
}

export async function GET(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    // token_hash is deliberately not selected — nothing needs it outside the
    // kiosk's own comparison.
    const devices = await sql(
      `SELECT d.id, d.label, d.location_id, d.is_active, d.last_seen_at, d.created_at,
              l.name AS location_name
         FROM stock_kiosk_devices d
         LEFT JOIN stock_locations l ON l.id = d.location_id
        ORDER BY d.created_at DESC`,
      []
    );
    const locations = await sql(
      `SELECT id, name, latitude, longitude FROM stock_locations WHERE is_active ORDER BY name`,
      []
    );

    return NextResponse.json({
      devices: devices.map((d) => ({
        ...d,
        id: Number(d.id),
        last_seen_at: wallClock(d.last_seen_at),
        created_at: wallClock(d.created_at),
      })),
      locations: locations.map((l) => ({
        id: Number(l.id),
        name: l.name,
        latitude: l.latitude === null ? null : Number(l.latitude),
        longitude: l.longitude === null ? null : Number(l.longitude),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load devices', detail: error.message }, { status: 500 });
  }
}

/** Pair a tablet. The plaintext token is returned ONCE and never stored. */
export async function POST(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const label = String(body?.label || '').trim();
    if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 });

    const locationId = body?.locationId ? Number(body.locationId) : null;
    if (locationId !== null && (!Number.isInteger(locationId) || locationId <= 0)) {
      return NextResponse.json({ error: 'Invalid locationId' }, { status: 400 });
    }

    // 256 bits from a CSPRNG. This is the device's only credential, so it must
    // not be guessable and must not be derived from the label or the clock.
    const secret = crypto.randomBytes(32).toString('base64url');
    const tokenHash = await bcrypt.hash(secret, 10);

    const rows = await sql(
      `INSERT INTO stock_kiosk_devices (label, token_hash, location_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, label, location_id, is_active, created_at`,
      [label, tokenHash, locationId, gate.appUser.id]
    );

    // The token the device holds is "<id>.<secret>". bcrypt hashes are salted,
    // so they cannot be looked up by value — without a public id prefix the
    // kiosk would have to bcrypt-compare against EVERY device on every punch,
    // which is ~100 ms each. The id half is not a secret; the other half is.
    const token = `${rows[0].id}.${secret}`;

    await logTimeline({
      eventType: 'other',
      entityType: 'kiosk_device',
      entityId: rows[0].id,
      summary: `${gate.appUser.name} paired kiosk "${label}"`,
      userId: gate.appUser.id,
    });

    return NextResponse.json(
      {
        device: { ...rows[0], id: Number(rows[0].id), created_at: wallClock(rows[0].created_at) },
        // Shown once. Losing it means re-pairing, which is the intended
        // failure mode — there is no way to recover it from the hash.
        token,
        pairingPath: `/attendance/kiosk?pair=${encodeURIComponent(token)}`,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Failed to pair device', detail: error.message }, { status: 500 });
  }
}

/** Revoke a device. Hard delete: a revoked tablet must stop working now. */
export async function DELETE(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const rows = await sql('DELETE FROM stock_kiosk_devices WHERE id = $1 RETURNING id, label', [id]);
    if (!rows[0]) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

    await logTimeline({
      eventType: 'other',
      entityType: 'kiosk_device',
      entityId: id,
      summary: `${gate.appUser.name} revoked kiosk "${rows[0].label}"`,
      userId: gate.appUser.id,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to revoke device', detail: error.message }, { status: 500 });
  }
}
