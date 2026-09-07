import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { logTimeline, readCoordinate } from '@/lib/attendance-db';

/**
 * Branches — the one place that writes stock_locations.
 *
 * This table is SHARED with inventory: stock_inventory_lots, stock_movements
 * and stock_inbound_shipments all reference it, alongside stock_app_users,
 * stock_attendance_entries and stock_kiosk_devices. Two consequences:
 *
 *   1. There is no DELETE. Retiring a branch sets is_active = FALSE, so the
 *      shipments and movements that point at it survive. (The kiosk *device*
 *      route does hard-delete, deliberately — that row is a credential and must
 *      stop working immediately. A branch is not.)
 *   2. This lives at /api/stock/locations, not under /attendance/. Attendance
 *      is one consumer of this table, not its owner.
 *
 * Coordinates are the geofence anchor: a branch with none has no fence at all
 * and cannot be auto-detected from a GPS fix.
 */

// Mirrors the CHECK on stock_locations.location_type. Keep in sync.
const LOCATION_TYPES = ['warehouse', 'yard', 'showroom', 'in_transit', 'customer_site', 'supplier_site', 'other'];

const COLUMNS = 'id, name, location_type, address, latitude, longitude, is_active';

function serializeLocation(row) {
  return {
    id: Number(row.id),
    name: row.name,
    locationType: row.location_type,
    address: row.address ?? null,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    isActive: row.is_active !== false,
  };
}

/**
 * Read coordinates off a request body.
 * Returns { latitude, longitude, error } — `error` set when exactly one axis
 * survives, because half a coordinate is not a location and storing it would
 * leave a branch looking configured while its fence silently does nothing.
 */
function readAnchor(body) {
  const provided = body?.latitude !== undefined || body?.longitude !== undefined;
  if (!provided) return { latitude: undefined, longitude: undefined };

  // Clearing both is an explicit, supported state: no fence here.
  const blank = (v) => v === null || v === '';
  if (blank(body.latitude) && blank(body.longitude)) return { latitude: null, longitude: null };

  const latitude = readCoordinate(body.latitude, 90);
  const longitude = readCoordinate(body.longitude, 180);
  if (latitude === null || longitude === null) {
    return { error: 'Latitude must be between -90 and 90, longitude between -180 and 180 — set both or neither.' };
  }
  return { latitude, longitude };
}

async function guard(request, { requireManage = true } = {}) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) {
    return { error: NextResponse.json({ error: 'Database not configured' }, { status: 503 }) };
  }
  if (!appUser) {
    return { error: NextResponse.json({ error: 'No employee record for this account' }, { status: 403 }) };
  }
  if (requireManage && !getRoleFlags(appUser.role).canManageAttendance) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { appUser };
}

/**
 * Any signed-in employee may read the list — the home-branch dropdown on the
 * user form needs it, and a branch name is not sensitive.
 */
export async function GET(request) {
  const gate = await guard(request, { requireManage: false });
  if (gate.error) return gate.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const rows = await sql(
      `SELECT ${COLUMNS} FROM stock_locations
        ${includeInactive ? '' : 'WHERE is_active'}
        ORDER BY is_active DESC, name`,
      []
    );

    return NextResponse.json({
      locations: rows.map(serializeLocation),
      locationTypes: LOCATION_TYPES,
      canManage: getRoleFlags(gate.appUser.role).canManageAttendance,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load branches', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const locationType = String(body?.locationType || 'warehouse');

    if (!name) return NextResponse.json({ error: 'Branch name is required' }, { status: 400 });
    if (!LOCATION_TYPES.includes(locationType)) {
      return NextResponse.json({ error: `Type must be one of ${LOCATION_TYPES.join(', ')}` }, { status: 400 });
    }

    const anchor = readAnchor(body);
    if (anchor.error) return NextResponse.json({ error: anchor.error }, { status: 400 });

    const rows = await sql(
      `INSERT INTO stock_locations (name, location_type, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        name,
        locationType,
        body?.address ? String(body.address).trim() : null,
        anchor.latitude ?? null,
        anchor.longitude ?? null,
      ]
    );

    await logTimeline({
      eventType: 'other',
      entityType: 'location',
      entityId: rows[0].id,
      summary: `${gate.appUser.name} added the branch "${name}"`,
      details: { locationType, latitude: anchor.latitude ?? null, longitude: anchor.longitude ?? null },
      userId: gate.appUser.id,
    });

    return NextResponse.json({ location: serializeLocation(rows[0]) }, { status: 201 });
  } catch (error) {
    // name is UNIQUE — a duplicate is the obvious user error, not a crash.
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'A branch with that name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to add branch', detail: error.message }, { status: 500 });
  }
}

/** Rename, retype, move the geofence anchor, or retire a branch. */
export async function PATCH(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const locationId = Number(body?.locationId);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return NextResponse.json({ error: 'Invalid locationId' }, { status: 400 });
    }

    const updates = [];
    const values = [];
    const push = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'Branch name cannot be empty' }, { status: 400 });
      push('name', name);
    }
    if (body.locationType !== undefined) {
      if (!LOCATION_TYPES.includes(String(body.locationType))) {
        return NextResponse.json({ error: `Type must be one of ${LOCATION_TYPES.join(', ')}` }, { status: 400 });
      }
      push('location_type', String(body.locationType));
    }
    if (body.address !== undefined) push('address', body.address ? String(body.address).trim() : null);
    if (body.isActive !== undefined) push('is_active', Boolean(body.isActive));

    const anchor = readAnchor(body);
    if (anchor.error) return NextResponse.json({ error: anchor.error }, { status: 400 });
    if (anchor.latitude !== undefined) {
      push('latitude', anchor.latitude);
      push('longitude', anchor.longitude);
    }

    if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    values.push(locationId);
    const rows = await sql(
      `UPDATE stock_locations SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING ${COLUMNS}`,
      values
    );
    if (!rows[0]) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });

    const location = serializeLocation(rows[0]);
    const summary =
      body.isActive === false
        ? `${gate.appUser.name} retired the branch "${location.name}"`
        : anchor.latitude !== undefined
          ? `${gate.appUser.name} ${anchor.latitude === null ? 'cleared' : 'set'} the geofence for ${location.name}`
          : `${gate.appUser.name} updated the branch "${location.name}"`;

    await logTimeline({
      eventType: 'other',
      entityType: 'location',
      entityId: locationId,
      summary,
      details: { changes: body },
      userId: gate.appUser.id,
    });

    return NextResponse.json({ location });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'A branch with that name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update branch', detail: error.message }, { status: 500 });
  }
}
