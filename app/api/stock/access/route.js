import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext, normalizeStockRole, normalizeText, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

const superAdminEmails = (process.env.STOCK_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const GET = stockRoute(async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  try {
    const currentEmail = normalizeText(session.user.email).toLowerCase();
    // Verified only: otherwise signing up with this address would grant manager.
    const isSuperAdmin = session.user.emailVerified === true && superAdminEmails.includes(currentEmail);
    let userRecord = appUser;

    if (!userRecord && !isSuperAdmin) {
      const roleFlags = getRoleFlags('stock_maintainer');
      const rows = await sql(
          `INSERT INTO stock_app_users (
            auth0_sub,
            name,
            phone,
            email,
            role,
            status,
            can_manage_users,
            can_approve_changes,
            can_view_dashboard,
            created_by
          ) VALUES ($1,$2,$3,$4,$5,'inactive',$6,$7,FALSE,$8)
          -- A row with this email that getStockContext did not match belongs to
          -- someone else (or to this person before they verify their email):
          -- never re-link it from here.
          ON CONFLICT (tenant_id, email) DO NOTHING
          RETURNING *`,
          [
            session.user.sub || null,
            normalizeText(session.user.name) || session.user.email || 'Pending User',
            normalizeText(session.user.phone_number) || 'Not provided',
            normalizeText(session.user.email) || null,
            roleFlags.role,
            roleFlags.canManageUsers,
            roleFlags.canApproveChanges,
            session.user.email || 'system',
          ]
      );

      userRecord = rows[0] || null;
    }

    if (isSuperAdmin) {
      // 'manager', not 'admin': manager is the only role that can manage users, so an
      // admin bootstrap account could never create the first real account.
      const roleFlags = getRoleFlags('manager');
      const rows = await sql(
          `INSERT INTO stock_app_users (
            auth0_sub,
            name,
            phone,
            email,
            role,
            status,
            can_manage_users,
            can_approve_changes,
            can_view_dashboard,
            created_by
          ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)
          ON CONFLICT (tenant_id, email) DO UPDATE SET
            auth0_sub = EXCLUDED.auth0_sub,
            name = COALESCE(NULLIF(EXCLUDED.name, ''), stock_app_users.name),
            role = EXCLUDED.role,
            status = 'active',
            can_manage_users = EXCLUDED.can_manage_users,
            can_approve_changes = EXCLUDED.can_approve_changes,
            can_view_dashboard = EXCLUDED.can_view_dashboard,
            updated_at = NOW()
          RETURNING *`,
          [
            session.user.sub || null,
            normalizeText(session.user.name) || session.user.email || 'Admin User',
            normalizeText(session.user.phone_number) || 'Not provided',
            currentEmail,
            roleFlags.role,
            roleFlags.canManageUsers,
            roleFlags.canApproveChanges,
            roleFlags.canViewDashboard,
            currentEmail,
          ]
      );

      userRecord = rows[0] || userRecord;
    }

    const isApproved = Boolean(
      userRecord &&
      userRecord.status === 'active' &&
      userRecord.can_view_dashboard
    );

    return NextResponse.json({
      approved: isApproved,
      status: userRecord?.status || 'inactive',
      role: normalizeStockRole(userRecord?.role),
      user: userRecord,
      message: isApproved
        ? 'Access granted.'
        : 'Access pending admin approval. Ask admin to activate your stock user and dashboard permission.',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to resolve stock access', detail: error.message }, { status: 500 });
  }
});