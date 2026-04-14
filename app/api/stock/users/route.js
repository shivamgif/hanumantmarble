import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext, hasAnyStockRole, normalizeStockRole, recordTimelineEvent, STOCK_ROLES } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { upsertAuth0DatabaseUser, validateStockPassword } from '@/lib/auth0-management';

function normalizeDepartment(value, fallback = null) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ users: [], message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const users = await sql(
      `SELECT *
       FROM stock_app_users
       ORDER BY created_at DESC`,
      []
    );

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load users', detail: error.message }, { status: 500 });
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
  const normalizedRole = normalizeStockRole(body.role || 'stock_maintainer');
  const department = normalizeDepartment(body.department, normalizedRole === 'salesperson' ? 'General' : null);

  if (!STOCK_ROLES.includes(normalizedRole)) {
    return NextResponse.json({ error: 'Invalid role supplied' }, { status: 400 });
  }

  const roleFlags = getRoleFlags(normalizedRole);

  const passwordError = validateStockPassword(body.password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  try {
    const auth0User = await upsertAuth0DatabaseUser({
      email: body.email,
      password: body.password,
      name: body.name,
      phone: body.phone,
    });

    const rows = await sql(
      `INSERT INTO stock_app_users (
        auth0_sub,
        name,
        phone,
        email,
        role,
        department,
        status,
        can_manage_users,
        can_approve_changes,
        can_view_dashboard,
        created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (email) DO UPDATE SET
        auth0_sub = EXCLUDED.auth0_sub,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        department = COALESCE(EXCLUDED.department, stock_app_users.department),
        status = EXCLUDED.status,
        can_manage_users = EXCLUDED.can_manage_users,
        can_approve_changes = EXCLUDED.can_approve_changes,
        can_view_dashboard = EXCLUDED.can_view_dashboard,
        updated_at = NOW()
      RETURNING *`,
      [
        auth0User?.user_id || auth0User?.id || auth0User?._id || body.auth0Sub || null,
        body.name,
        body.phone,
        body.email || null,
        roleFlags.role,
        department,
        body.status || 'active',
        roleFlags.canManageUsers,
        roleFlags.canApproveChanges,
        body.canViewDashboard !== false,
        session.user.email,
      ]
    );

    await recordTimelineEvent({
      eventType: 'user_created',
      entityType: 'user',
      entityId: rows[0].id,
      summary: `User ${rows[0].name} saved`,
      details: rows[0],
      userId: appUser?.id || null,
    });

    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Failed to save user:', error);

    if (String(error.message || '').includes('stock_app_users_role_check')) {
      return NextResponse.json(
        {
          error: 'Role constraint is not updated for salesperson yet. Run: npm run db:migrate-salesperson-role',
          detail: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Failed to save user', detail: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
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
  const hasRoleInPayload = Object.prototype.hasOwnProperty.call(body, 'role');
  const normalizedRole = hasRoleInPayload ? normalizeStockRole(body.role) : null;
  const roleFlags = hasRoleInPayload ? getRoleFlags(body.role) : null;
  const hasDepartmentInPayload = Object.prototype.hasOwnProperty.call(body, 'department');
  const department = hasDepartmentInPayload
    ? normalizeDepartment(body.department, normalizedRole === 'salesperson' ? 'General' : null)
    : null;

  try {
    const rows = await sql(
      `UPDATE stock_app_users
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           role = COALESCE($4, role),
           status = COALESCE($5, status),
           can_manage_users = COALESCE($6, can_manage_users),
           can_approve_changes = COALESCE($7, can_approve_changes),
           can_view_dashboard = COALESCE($8, can_view_dashboard),
           department = COALESCE($9, department),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        body.name || null,
        body.phone || null,
        body.email || null,
        normalizedRole,
        body.status || null,
        hasRoleInPayload ? roleFlags.canManageUsers : body.canManageUsers,
        hasRoleInPayload ? roleFlags.canApproveChanges : body.canApproveChanges,
        body.canViewDashboard,
        department,
        body.id,
      ]
    );

    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update user', detail: error.message }, { status: 500 });
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
      `UPDATE stock_app_users
       SET status = 'inactive',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to remove user', detail: error.message }, { status: 500 });
  }
}
