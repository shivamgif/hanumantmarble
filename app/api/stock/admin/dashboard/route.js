import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

function isMissingExternalAuthColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('external_auth_provider') || message.includes('external_auth_id');
}

async function fetchDashboardUsers() {
  try {
    const rows = await sql(
      `SELECT
         u.id,
         u.auth0_sub,
         u.external_auth_provider,
         u.external_auth_id,
         u.email,
         u.name AS full_name,
         u.phone AS phone_number,
         u.role,
         u.department,
         u.division_id,
         ARRAY_AGG(d.name ORDER BY d.name) FILTER (WHERE d.name IS NOT NULL) AS division_names,
         STRING_AGG(d.name, ', ' ORDER BY d.name) AS division_name,
         u.status,
         u.can_manage_users,
         u.can_approve_changes,
         u.can_view_dashboard,
         (u.status = 'active') AS is_active,
         u.salary,
         u.monthly_sales_goal,
         u.last_login_at
       FROM stock_app_users u
       LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
       LEFT JOIN stock_divisions d ON d.id = ud.division_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
      []
    );
    return rows;
  } catch (error) {
    if (!isMissingExternalAuthColumnError(error)) {
      throw error;
    }

    const rows = await sql(
      `SELECT
         u.id,
         u.auth0_sub,
         NULL::TEXT AS external_auth_provider,
         NULL::TEXT AS external_auth_id,
         u.email,
         u.name AS full_name,
         u.phone AS phone_number,
         u.role,
         u.department,
         u.division_id,
         ARRAY_AGG(d.name ORDER BY d.name) FILTER (WHERE d.name IS NOT NULL) AS division_names,
         STRING_AGG(d.name, ', ' ORDER BY d.name) AS division_name,
         u.status,
         u.can_manage_users,
         u.can_approve_changes,
         u.can_view_dashboard,
         (u.status = 'active') AS is_active,
         u.salary,
         u.monthly_sales_goal,
         u.last_login_at
       FROM stock_app_users u
       LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
       LEFT JOIN stock_divisions d ON d.id = ud.division_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
      []
    );
    return rows;
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
           sup.name AS supplier_name,
           s.arrival_date,
           s.status,
           s.total_whole_qty,
           s.total_broken_qty,
           COALESCE((
             SELECT SUM(isi.ordered_qty)
             FROM stock_inbound_shipment_items isi
             JOIN stock_items si ON si.id = isi.item_id
             WHERE isi.inbound_shipment_id = s.id AND si.unit_of_measure = 'bag'
           ), 0) AS total_bag_qty,
           s.created_at,
           COALESCE(u.name, u.email, s.created_by) AS maintainer_name
         FROM stock_inbound_shipments s
         LEFT JOIN stock_app_users u ON u.id = s.submitted_by_user_id
         LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
         WHERE approval_status = 'pending'
         ORDER BY s.created_at DESC`,
        []
      ),
      sql(
        `SELECT sos.id, sos.shipment_number, sos.truck_license_plate_snapshot AS truck_license_plate, sos.driver_name_snapshot AS driver_name,
                COALESCE(c_direct.name, c_so.name) AS customer_name,
                sos.created_at AS dispatch_date, sos.status,
                COALESCE(SUM(soi.loaded_whole_qty), 0) as total_whole_qty, COALESCE(SUM(soi.loaded_broken_qty), 0) as total_broken_qty,
                COALESCE(SUM(soi.loaded_whole_qty * soi.rate_per_unit), 0) as total_selling_price_excl
         FROM stock_outbound_shipments sos
         LEFT JOIN stock_outbound_shipment_items soi ON sos.id = soi.outbound_shipment_id
         LEFT JOIN stock_customers c_direct ON c_direct.id = sos.customer_id
         LEFT JOIN stock_sales_orders sso ON sos.sales_order_id = sso.id
         LEFT JOIN stock_customers c_so ON c_so.id = sso.customer_id
         WHERE sos.approval_status = 'pending'
         GROUP BY sos.id, c_direct.name, c_so.name
         ORDER BY sos.created_at DESC`,
        []
      ),
      sql(
        `SELECT
           s.id,
           s.shipment_number,
           s.truck_license_plate_snapshot AS truck_license_plate,
           s.driver_name_snapshot AS driver_name,
           sup.name AS supplier_name,
           s.arrival_date,
           s.status,
           s.total_whole_qty,
           s.total_broken_qty,
           s.created_at,
           COALESCE(u.name, u.email, s.created_by) AS maintainer_name
         FROM stock_inbound_shipments s
         LEFT JOIN stock_app_users u ON u.id = s.submitted_by_user_id
         LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
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
