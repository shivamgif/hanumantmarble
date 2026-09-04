import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Bucket on created_at, not dispatch_date: the latter is unreliable (dispatches
// entered on 2026-09-01 carry dispatch_date 2026-08-30), which is why
// /api/stock/dispatches aliases created_at AS dispatch_date for the panel list.
// This keeps the report agreeing with the table it opens from.
// Shifted to IST so month boundaries fall on the business day, matching
// the AT TIME ZONE pattern in /api/stock/salesperson-analytics.
const MONTH_BUCKET = `(sos.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')`;

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json(
      { error: 'Database not configured', message: 'Enable Neon PostgreSQL integration first.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid month, expected YYYY-MM' }, { status: 400 });
  }

  const canSeeRevenue = ['admin', 'manager', 'read_only_admin'].includes(appUser?.role);
  const isSalesperson = appUser?.role === 'salesperson';
  const salespersonDivisionIds = isSalesperson
    ? (appUser?.division_ids?.length ? appUser.division_ids : [-1])
    : null;

  try {
    const params = [`${month}-01`];
    let divisionFilter = '';
    if (salespersonDivisionIds) {
      params.push(salespersonDivisionIds);
      divisionFilter = `AND i.division_id = ANY($2::bigint[])`;
    }

    const rows = await sql(
      `SELECT
         i.id AS item_id,
         i.name AS item_name,
         i.sku,
         i.unit_of_measure,
         COALESCE(c.name, '—') AS customer_name,
         COALESCE(SUM(CASE WHEN i.unit_of_measure <> 'bag'
           THEN GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) END), 0) AS box_qty,
         COALESCE(SUM(CASE WHEN i.unit_of_measure <> 'bag'
           THEN GREATEST(COALESCE(soi.loaded_broken_qty, 0) - COALESCE(soi.returned_broken_qty, 0), 0) END), 0) AS broken_qty,
         COALESCE(SUM(CASE WHEN i.unit_of_measure = 'bag'
           THEN GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) END), 0) AS bag_qty,
         COALESCE(SUM(CASE WHEN i.unit_of_measure = 'sqft'
           THEN GREATEST(COALESCE(soi.qty_sqft, 0) - COALESCE(soi.returned_qty_sqft, 0), 0) END), 0) AS sqft_qty,
         COALESCE(SUM((GREATEST((COALESCE(soi.loaded_whole_qty, 0) + COALESCE(soi.loaded_broken_qty, 0)) - (COALESCE(soi.returned_whole_qty, 0) + COALESCE(soi.returned_broken_qty, 0)), 0)) * COALESCE(soi.rate_per_unit, 0)), 0) AS revenue_excl,
         COUNT(DISTINCT sos.id)::int AS dispatch_count
       FROM stock_outbound_shipments sos
       JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = sos.id
       JOIN stock_items i ON i.id = soi.item_id
       LEFT JOIN stock_customers c ON c.id = sos.customer_id
       WHERE ${MONTH_BUCKET} >= $1::timestamp
         AND ${MONTH_BUCKET} < ($1::timestamp + INTERVAL '1 month')
         ${divisionFilter}
       GROUP BY i.id, i.name, i.sku, i.unit_of_measure, c.name
       ORDER BY i.name ASC, revenue_excl DESC`,
      params
    );

    return NextResponse.json({
      month,
      canSeeRevenue,
      // Revenue is stripped server-side, not hidden client-side.
      rows: canSeeRevenue ? rows : rows.map(({ revenue_excl, ...rest }) => rest),
    });
  } catch (error) {
    console.error('Failed to fetch product sales:', error);
    return NextResponse.json({ error: 'Failed to fetch product sales', detail: error.message }, { status: 500 });
  }
}
