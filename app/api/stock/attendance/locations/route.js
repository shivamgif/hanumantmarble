import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { logTimeline, readCoordinate } from '@/lib/attendance-db';

/**
 * Set the geofence anchor for a location.
 *
 * Coordinates are the only thing standing between "geofencing is configured"
 * and "geofencing silently does nothing", because a NULL anchor makes every
 * punch count as inside. Manager-only: moving the anchor changes whose punches
 * get flagged.
 *
 * The device list on /api/stock/attendance/devices already returns locations
 * with their coordinates, so there is no GET here.
 */
export async function PATCH(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!getRoleFlags(appUser?.role).canManageAttendance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const locationId = Number(body?.locationId);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return NextResponse.json({ error: 'Invalid locationId' }, { status: 400 });
    }

    // Clearing both turns the fence off for this location — an explicit,
    // supported state, not an error.
    const clearing = body?.latitude === null && body?.longitude === null;

    const latitude = clearing ? null : readCoordinate(body?.latitude, 90);
    const longitude = clearing ? null : readCoordinate(body?.longitude, 180);

    // Half a coordinate is not a location. Rejecting this stops a typo from
    // quietly disabling the fence while the UI still looks configured.
    if (!clearing && (latitude === null || longitude === null)) {
      return NextResponse.json(
        { error: 'Latitude must be between -90 and 90, longitude between -180 and 180' },
        { status: 400 }
      );
    }

    const rows = await sql(
      `UPDATE stock_locations
          SET latitude = $1, longitude = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, name, latitude, longitude`,
      [latitude, longitude, locationId]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    await logTimeline({
      eventType: 'other',
      entityType: 'location',
      entityId: locationId,
      summary: clearing
        ? `${appUser.name} cleared the geofence for ${rows[0].name}`
        : `${appUser.name} set the geofence for ${rows[0].name}`,
      details: { latitude, longitude },
      userId: appUser.id,
    });

    return NextResponse.json({
      location: {
        id: Number(rows[0].id),
        name: rows[0].name,
        latitude: rows[0].latitude === null ? null : Number(rows[0].latitude),
        longitude: rows[0].longitude === null ? null : Number(rows[0].longitude),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save geofence', detail: error.message }, { status: 500 });
  }
}
