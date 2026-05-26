import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  const userRole = normalizeStockRole(appUser?.role);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (userRole !== 'salesperson') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const schemaCaps = await getStockSchemaCapabilities();
    const ownershipFilter = schemaCaps.hasOutboundSalespersonUserId
      ? `(s.salesperson_user_id = $1 OR (s.salesperson_user_id IS NULL AND s.submitted_by_user_id = $1))`
      : `s.submitted_by_user_id = $1`;

    const [monthlyRows, currentMonthRows, recentRows] = await Promise.all([
      sql(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', s.dispatch_date), 'Mon YYYY') AS month_label,
           DATE_TRUNC('month', s.dispatch_date) AS month_start,
           COUNT(DISTINCT s.id) AS dispatch_count,
           COALESCE(SUM(GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) * COALESCE(soi.rate_per_unit, 0)), 0) AS total_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
         WHERE ${ownershipFilter}
           AND s.status != 'cancelled'
           AND s.dispatch_date >= NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', s.dispatch_date)
         ORDER BY month_start ASC`,
        [appUser.id]
      ),
      sql(
        `SELECT
           COUNT(DISTINCT s.id) AS this_month_count,
           COALESCE(SUM(GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) * COALESCE(soi.rate_per_unit, 0)), 0) AS this_month_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
         WHERE ${ownershipFilter}
           AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', CURRENT_DATE)
           AND s.status != 'cancelled'`,
        [appUser.id]
      ),
      sql(
        `SELECT
           s.id,
           s.shipment_number,
           s.dispatch_date,
           c.name AS customer_name,
           s.status,
           s.approval_status,
           COALESCE(SUM(GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) * COALESCE(soi.rate_per_unit, 0)), 0) AS total_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
         LEFT JOIN stock_customers c ON c.id = s.customer_id
         WHERE ${ownershipFilter}
           AND s.status != 'cancelled'
         GROUP BY s.id, s.shipment_number, s.dispatch_date, c.name, s.status, s.approval_status
         ORDER BY s.dispatch_date DESC
         LIMIT 10`,
        [appUser.id]
      ),
    ]);

    const lastMonthRows = await sql(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) * COALESCE(soi.rate_per_unit, 0)), 0) AS last_month_value,
              COUNT(DISTINCT s.id) AS last_month_count
       FROM stock_outbound_shipments s
       JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       WHERE ${ownershipFilter}
         AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
         AND s.status != 'cancelled'`,
      [appUser.id]
    );

    return NextResponse.json({
      monthlyTrend: monthlyRows.map((r) => ({
        month: r.month_label,
        dispatchCount: Number(r.dispatch_count),
        totalValue: Number(r.total_value),
      })),
      thisMonth: {
        count: Number(currentMonthRows[0]?.this_month_count ?? 0),
        value: Number(currentMonthRows[0]?.this_month_value ?? 0),
      },
      lastMonth: {
        count: Number(lastMonthRows[0]?.last_month_count ?? 0),
        value: Number(lastMonthRows[0]?.last_month_value ?? 0),
      },
      recentDispatches: recentRows.map((r) => ({
        id: r.id,
        shipmentNumber: r.shipment_number,
        dispatchDate: r.dispatch_date,
        customerName: r.customer_name,
        status: r.status,
        approvalStatus: r.approval_status,
        totalValue: Number(r.total_value),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load analytics', detail: error.message }, { status: 500 });
  }
}
