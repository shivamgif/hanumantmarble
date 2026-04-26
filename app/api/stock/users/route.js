import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext, hasAnyStockRole, normalizeStockRole, recordTimelineEvent, STOCK_ROLES } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { validateStockPassword } from '@/lib/password-policy';
import { normalizeIdentity } from '@/lib/auth-server';
import { auth as betterAuth } from '@/lib/auth';
import { getAuthDatabase } from '@/lib/auth-db';

function normalizeDepartment(value, fallback = null) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function isMissingExternalAuthColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('external_auth_provider') || message.includes('external_auth_id');
}

function isExistingUserError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    message.includes('already exists') ||
    message.includes('user_exists') ||
    message.includes('duplicate') ||
    code.includes('user_exists')
  );
}

async function ensureCredentialIdentity({ email, password, name, role }) {
  async function markEmailVerified() {
    try {
      const authDb = getAuthDatabase();
      if (authDb?.db) {
        await authDb.db
          .updateTable('user')
          .set({
            emailVerified: true,
            updatedAt: new Date(),
          })
          .where('email', '=', email)
          .execute();
        return;
      }
    } catch {
      // Fallback to raw SQL variants below.
    }

    try {
      await sql(
        `UPDATE "user" SET "emailVerified" = true, "updatedAt" = NOW() WHERE email = $1`,
        [email]
      );
      return;
    } catch {
      // Last fallback for snake_case legacy schemas.
    }

    try {
      await sql(
        `UPDATE "user" SET email_verified = true, updated_at = NOW() WHERE email = $1`,
        [email]
      );
    } catch {
      // Do not block user creation if verify flag cannot be persisted.
    }
  }

  try {
    await betterAuth.api.createUser({
      body: {
        email,
        password,
        name: name || email,
        role,
      },
    });
    // Mark email as verified so the new user can log in without an email confirmation step.
    await markEmailVerified();
  } catch (error) {
    if (isExistingUserError(error)) {
      // Existing credential identity should also be verified for manager-created users.
      await markEmailVerified();
      return;
    }
    throw error;
  }
}

function extractErrorDetail(error) {
  if (!error) return '';
  const message = String(error?.message || '').trim();
  if (message) return message;
  const nestedMessage = String(error?.cause?.message || error?.body?.message || '').trim();
  if (nestedMessage) return nestedMessage;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error || '');
  }
}

async function resolveDivisionId(value) {
  const divisionName = String(value || '').trim();
  if (!divisionName) {
    return null;
  }

  const rows = await sql(
    `INSERT INTO stock_divisions (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [divisionName]
  );

  return rows[0]?.id || null;
}

async function resolveDivisionIds(names) {
  const unique = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  const ids = await Promise.all(unique.map(resolveDivisionId));
  return ids.filter((id) => id != null).map(Number);
}

async function resolveAndEnforceDivisions(body) {
  const hasDivisionsKey = Object.prototype.hasOwnProperty.call(body, 'divisions');
  const hasDivisionKey = Object.prototype.hasOwnProperty.call(body, 'division');

  let names = [];
  if (hasDivisionsKey) {
    names = Array.isArray(body.divisions) ? body.divisions : [body.divisions];
  } else if (hasDivisionKey) {
    names = body.division ? [body.division] : [];
  }

  // Always include Adhesive
  names = ['Adhesive', ...names];

  return resolveDivisionIds(names);
}

async function upsertUserDivisions(userId, divisionIds) {
  if (!divisionIds.length) return;
  // Delete existing and re-insert (clean replace)
  await sql(`DELETE FROM stock_user_divisions WHERE user_id = $1`, [userId]);
  for (const divId of divisionIds) {
    await sql(
      `INSERT INTO stock_user_divisions (user_id, division_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, division_id) DO NOTHING`,
      [userId, divId]
    );
  }
}

async function resolveDivisionIdFromPayload(body) {
  const rawDivisionId = body?.divisionId ?? body?.division_id ?? null;
  const divisionIdNumber = Number(rawDivisionId);
  if (Number.isFinite(divisionIdNumber) && divisionIdNumber > 0) {
    const rows = await sql(
      `SELECT id FROM stock_divisions WHERE id = $1 LIMIT 1`,
      [divisionIdNumber]
    );
    if (!rows[0]) {
      throw new Error('Invalid division id');
    }
    return rows[0].id;
  }

  const divisionName = normalizeDepartment(body?.division, null);
  if (!divisionName) {
    return null;
  }

  return resolveDivisionId(divisionName);
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
      `SELECT u.*,
         ARRAY_AGG(d.name ORDER BY d.name) FILTER (WHERE d.name IS NOT NULL) AS division_names,
         ARRAY_AGG(ud.division_id ORDER BY ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL) AS division_ids
       FROM stock_app_users u
       LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
       LEFT JOIN stock_divisions d ON d.id = ud.division_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
      []
    );

    const usersWithDivisionName = users.map((u) => ({
      ...u,
      division_name: Array.isArray(u.division_names) ? u.division_names.join(', ') : (u.division_names || ''),
    }));

    return NextResponse.json({ users: usersWithDivisionName });
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
  const department = normalizeDepartment(body.department, normalizedRole === 'salesperson' ? 'Adhesive' : null);

  if (!STOCK_ROLES.includes(normalizedRole)) {
    return NextResponse.json({ error: 'Invalid role supplied' }, { status: 400 });
  }

  const roleFlags = getRoleFlags(normalizedRole);

  const passwordError = validateStockPassword(body.password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  try {
    // Resolve divisions for salesperson (Adhesive always included)
    let divisionIds = [];
    let primaryDivisionId = null;
    if (normalizedRole === 'salesperson') {
      divisionIds = await resolveAndEnforceDivisions(body);
      // Primary division: first non-Adhesive, or Adhesive if only one
      const adhesiveRows = await sql(`SELECT id FROM stock_divisions WHERE name = 'Adhesive' LIMIT 1`, []);
      const adhesiveId = adhesiveRows[0]?.id ? Number(adhesiveRows[0].id) : null;
      primaryDivisionId = divisionIds.find((id) => id !== adhesiveId) ?? divisionIds[0] ?? null;
    } else {
      primaryDivisionId = await resolveDivisionIdFromPayload(body);
    }

    const autoApprovedStatus = 'active';
    const autoApprovedCanViewDashboard = true;

    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const externalAuthId = String(
      body.externalAuthId ||
      body.external_auth_id ||
      normalizedEmail
    ).trim();

    await ensureCredentialIdentity({
      email: normalizedEmail,
      password: String(body.password || ''),
      name: String(body.name || '').trim(),
      role: roleFlags.role,
    });

    const identity = normalizeIdentity({
      sub: externalAuthId || null,
      email: normalizedEmail,
      name: body.name || null,
      phone_number: body.phone || null,
      auth_provider: 'better-auth',
    });

    let rows = [];

    try {
      rows = await sql(
        `INSERT INTO stock_app_users (
          auth0_sub,
          external_auth_provider,
          external_auth_id,
          name,
          phone,
          email,
          role,
          department,
          division_id,
          status,
          can_manage_users,
          can_approve_changes,
          can_view_dashboard,
          created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (email) DO UPDATE SET
          auth0_sub = EXCLUDED.auth0_sub,
          external_auth_provider = EXCLUDED.external_auth_provider,
          external_auth_id = EXCLUDED.external_auth_id,
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          role = EXCLUDED.role,
          department = COALESCE(EXCLUDED.department, stock_app_users.department),
          division_id = COALESCE(EXCLUDED.division_id, stock_app_users.division_id),
          status = EXCLUDED.status,
          can_manage_users = EXCLUDED.can_manage_users,
          can_approve_changes = EXCLUDED.can_approve_changes,
          can_view_dashboard = EXCLUDED.can_view_dashboard,
          updated_at = NOW()
        RETURNING *`,
        [
          identity.externalAuthId,
          identity.provider,
          identity.externalAuthId,
          body.name,
          body.phone,
          body.email || null,
          roleFlags.role,
          department,
          primaryDivisionId,
          autoApprovedStatus,
          roleFlags.canManageUsers,
          roleFlags.canApproveChanges,
          autoApprovedCanViewDashboard,
          session.user.email,
        ]
      );
    } catch (insertError) {
      if (!isMissingExternalAuthColumnError(insertError)) {
        throw insertError;
      }

      rows = await sql(
        `INSERT INTO stock_app_users (
          auth0_sub,
          name,
          phone,
          email,
          role,
          department,
          division_id,
          status,
          can_manage_users,
          can_approve_changes,
          can_view_dashboard,
          created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (email) DO UPDATE SET
          auth0_sub = EXCLUDED.auth0_sub,
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          role = EXCLUDED.role,
          department = COALESCE(EXCLUDED.department, stock_app_users.department),
          division_id = COALESCE(EXCLUDED.division_id, stock_app_users.division_id),
          status = EXCLUDED.status,
          can_manage_users = EXCLUDED.can_manage_users,
          can_approve_changes = EXCLUDED.can_approve_changes,
          can_view_dashboard = EXCLUDED.can_view_dashboard,
          updated_at = NOW()
        RETURNING *`,
        [
          identity.externalAuthId,
          body.name,
          body.phone,
          body.email || null,
          roleFlags.role,
          department,
          primaryDivisionId,
          autoApprovedStatus,
          roleFlags.canManageUsers,
          roleFlags.canApproveChanges,
          autoApprovedCanViewDashboard,
          session.user.email,
        ]
      );
    }

    const savedUser = rows[0];

    // Upsert junction table for salesperson divisions
    if (normalizedRole === 'salesperson' && divisionIds.length) {
      await upsertUserDivisions(savedUser.id, divisionIds);
    }

    await recordTimelineEvent({
      eventType: 'user_created',
      entityType: 'user',
      entityId: savedUser.id,
      summary: `User ${savedUser.name} saved`,
      details: savedUser,
      userId: appUser?.id || null,
    });

    return NextResponse.json({ user: savedUser }, { status: 201 });
  } catch (error) {
    const errorDetail = extractErrorDetail(error);
    console.error('Failed to save user:', errorDetail || error);

    if (String(errorDetail || '').toLowerCase().includes('invalid division id')) {
      return NextResponse.json({ error: 'Invalid division selected' }, { status: 400 });
    }

    if (String(errorDetail || '').includes('stock_app_users_role_check')) {
      return NextResponse.json(
        {
          error: 'Role constraint is not updated for salesperson yet. Run: npm run db:migrate-salesperson-role',
          detail: errorDetail,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Failed to save user', detail: errorDetail }, { status: 500 });
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
  const hasCanManageUsersInPayload = Object.prototype.hasOwnProperty.call(body, 'canManageUsers');
  const hasCanApproveChangesInPayload = Object.prototype.hasOwnProperty.call(body, 'canApproveChanges');
  const hasCanViewDashboardInPayload = Object.prototype.hasOwnProperty.call(body, 'canViewDashboard');
  const hasDepartmentInPayload = Object.prototype.hasOwnProperty.call(body, 'department');
  const hasDivisionsInPayload = Object.prototype.hasOwnProperty.call(body, 'divisions');
  const hasDivisionInPayload = Object.prototype.hasOwnProperty.call(body, 'division');
  const hasSalaryInPayload = Object.prototype.hasOwnProperty.call(body, 'salary');
  const hasSalesGoalInPayload = Object.prototype.hasOwnProperty.call(body, 'monthlySalesGoal');
  const department = hasDepartmentInPayload
    ? normalizeDepartment(body.department, normalizedRole === 'salesperson' ? 'Adhesive' : null)
    : null;

  try {
    let divisionId = null;
    let divisionIds = null;

    if (hasDivisionsInPayload || hasDivisionInPayload) {
      divisionIds = await resolveAndEnforceDivisions(body);
      // Sync primary division_id: first non-Adhesive, or Adhesive fallback
      const adhesiveRows = await sql(`SELECT id FROM stock_divisions WHERE name = 'Adhesive' LIMIT 1`, []);
      const adhesiveId = adhesiveRows[0]?.id ? Number(adhesiveRows[0].id) : null;
      divisionId = divisionIds.find((id) => id !== adhesiveId) ?? divisionIds[0] ?? null;
    } else if (hasDepartmentInPayload && department) {
      divisionId = await resolveDivisionId(department);
    }

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
           division_id = COALESCE($10, division_id),
           salary = COALESCE($12, salary),
           monthly_sales_goal = COALESCE($13, monthly_sales_goal),
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        body.name || null,
        body.phone || null,
        body.email || null,
        normalizedRole,
        body.status || null,
        hasCanManageUsersInPayload ? body.canManageUsers : (hasRoleInPayload ? roleFlags.canManageUsers : null),
        hasCanApproveChangesInPayload ? body.canApproveChanges : (hasRoleInPayload ? roleFlags.canApproveChanges : null),
        hasCanViewDashboardInPayload ? body.canViewDashboard : (hasRoleInPayload ? roleFlags.canViewDashboard : null),
        department,
        divisionId,
        body.id,
        hasSalaryInPayload ? (body.salary != null ? Number(body.salary) : null) : null,
        hasSalesGoalInPayload ? (body.monthlySalesGoal != null ? Number(body.monthlySalesGoal) : null) : null,
      ]
    );

    const updatedUser = rows[0];

    // Replace junction table divisions when payload includes divisions
    if (divisionIds !== null && updatedUser) {
      await upsertUserDivisions(updatedUser.id, divisionIds);
    }

    // Attach division_names for response
    if (updatedUser) {
      const divRows = await sql(
        `SELECT d.name FROM stock_user_divisions ud
         JOIN stock_divisions d ON d.id = ud.division_id
         WHERE ud.user_id = $1 ORDER BY d.name`,
        [updatedUser.id]
      );
      updatedUser.division_names = divRows.map((r) => r.name);
      updatedUser.division_name = updatedUser.division_names.join(', ');
    }

    return NextResponse.json({ user: updatedUser });
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
