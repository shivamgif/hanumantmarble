import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

function isMissingExternalAuthColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('external_auth_provider') || message.includes('external_auth_id');
}

async function fetchDashboardUsers() {
  try {
    return await sql(
      `SELECT
         id,
         auth0_sub,
         external_auth_provider,
         external_auth_id,
         email,
         name AS full_name,
         phone AS phone_number,
         role,
         department,
         status,
         can_manage_users,
         can_approve_changes,
         can_view_dashboard,
         (status = 'active') AS is_active,
         last_login_at
       FROM stock_app_users
       ORDER BY created_at DESC`,
      []
    );
  } catch (error) {
    if (!isMissingExternalAuthColumnError(error)) {
      throw error;
    }

    return sql(
      `SELECT
         id,
         auth0_sub,
         NULL::TEXT AS external_auth_provider,
         NULL::TEXT AS external_auth_id,
         email,
         name AS full_name,
         phone AS phone_number,
         role,
         department,
         status,
         can_manage_users,
         can_approve_changes,
         can_view_dashboard,
         (status = 'active') AS is_active,
         last_login_at
       FROM stock_app_users
       ORDER BY created_at DESC`,
      []
    );
  }
}

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  const userRole = normalizeStockRole(appUser?.role);

  if (!session || (userRole !== 'admin' && userRole !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const [pendingArrivals, pendingDispatches, cancelledArrivals, users] = await Promise.all([
      sql(
        `SELECT
           s.id,
           s.shipment_number,
           s.truck_license_plate_snapshot AS truck_license_plate,
           s.driver_name_snapshot AS driver_name,
           s.arrival_date,
           s.status,
           s.total_whole_qty,
           s.total_broken_qty,
           s.created_at,
           COALESCE(u.name, u.email, s.created_by) AS maintainer_name
         FROM stock_inbound_shipments s
         LEFT JOIN stock_app_users u ON u.id = s.submitted_by_user_id
         WHERE approval_status = 'pending'
         ORDER BY s.created_at DESC`,
        []
      ),
      sql(
        `SELECT sos.id, sos.shipment_number, sos.truck_license_plate_snapshot AS truck_license_plate, sos.driver_name_snapshot AS driver_name, sos.created_at AS dispatch_date, sos.status,
                COALESCE(SUM(soi.loaded_whole_qty), 0) as total_whole_qty, COALESCE(SUM(soi.loaded_broken_qty), 0) as total_broken_qty,
                COALESCE(SUM(soi.loaded_whole_qty * soi.rate_per_unit), 0) as total_selling_price_excl
         FROM stock_outbound_shipments sos
         LEFT JOIN stock_outbound_shipment_items soi ON sos.id = soi.outbound_shipment_id
         WHERE sos.approval_status = 'pending'
         GROUP BY sos.id
         ORDER BY sos.created_at DESC`,
        []
      ),
      sql(
        `SELECT
           s.id,
           s.shipment_number,
           s.truck_license_plate_snapshot AS truck_license_plate,
           s.driver_name_snapshot AS driver_name,
           s.arrival_date,
           s.status,
           s.total_whole_qty,
           s.total_broken_qty,
           s.created_at,
           COALESCE(u.name, u.email, s.created_by) AS maintainer_name
         FROM stock_inbound_shipments s
         LEFT JOIN stock_app_users u ON u.id = s.submitted_by_user_id
         WHERE s.status = 'cancelled'
         ORDER BY s.created_at DESC`,
        []
      ),
      fetchDashboardUsers(),
    ]);

    return NextResponse.json({
      pendingPurchases: pendingArrivals,
      pendingArrivals,
      pendingDispatches,
      cancelledArrivals,
      users,
    });
  } catch (error) {
    console.error('Failed to load admin dashboard:', error);
    return NextResponse.json({ error: 'Failed to load admin dashboard', detail: error.message }, { status: 500 });
  }
}
