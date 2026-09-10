import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { netRevenueExpr, ownershipFilter, shippedFilter } from '@/lib/stock-analytics-sql.mjs';

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
    // Shared with the admin dashboard so both pages report the same number for
    // the same person.
    const owned = ownershipFilter(schemaCaps, 's', '$1');
    const netRevenue = netRevenueExpr(schemaCaps, 'soi', 'i');
    const shipped = shippedFilter('s');

    const [monthlyRows, currentMonthRows, recentRows, activeDayRows] = await Promise.all([
      sql(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', s.dispatch_date), 'Mon YYYY') AS month_label,
           DATE_TRUNC('month', s.dispatch_date) AS month_start,
           COUNT(DISTINCT s.id) AS dispatch_count,
           COALESCE(SUM(${netRevenue}), 0) AS total_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
         WHERE ${owned}
           AND ${shipped}
           AND s.dispatch_date >= NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', s.dispatch_date)
         ORDER BY month_start ASC`,
        [appUser.id]
      ),
      sql(
        `SELECT
           TO_CHAR((NOW() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS today,
           COUNT(DISTINCT s.id) AS this_month_count,
           COALESCE(SUM(${netRevenue}), 0) AS this_month_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
         WHERE ${owned}
           AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata'))
           AND ${shipped}`,
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
           COALESCE(SUM(${netRevenue}), 0) AS total_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
         LEFT JOIN stock_customers c ON c.id = s.customer_id
         WHERE ${owned}
           AND ${shipped}
         GROUP BY s.id, s.shipment_number, s.dispatch_date, c.name, s.status, s.approval_status
         ORDER BY s.dispatch_date DESC
         LIMIT 10`,
        [appUser.id]
      ),
      // Days with at least one dispatch, for the sales streak. No items join -
      // one dispatch makes the day active regardless of value. dispatch_date is
      // a bare TIMESTAMP holding UTC, so shift it to IST before taking the date
      // or evening dispatches land on tomorrow.
      sql(
        `SELECT DISTINCT TO_CHAR((s.dispatch_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day
         FROM stock_outbound_shipments s
         WHERE ${owned}
           AND ${shipped}
           AND s.dispatch_date >= NOW() - INTERVAL '120 days'
         ORDER BY day ASC`,
        [appUser.id]
      ),
    ]);

    const lastMonthRows = await sql(
      `SELECT COALESCE(SUM(${netRevenue}), 0) AS last_month_value,
              COUNT(DISTINCT s.id) AS last_month_count
       FROM stock_outbound_shipments s
       JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
       WHERE ${owned}
         AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 month')
         AND ${shipped}`,
      [appUser.id]
    );

    return NextResponse.json({
      activeDays: activeDayRows.map((r) => r.day),
      today: currentMonthRows[0]?.today ?? null,
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
