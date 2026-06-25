import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

const SORT_COLS = {
  datetime: 'dispatch_date',
  shipment: 'shipment_number',
  quantities: 'total_tile_qty',
  products: 'product_names',
  status: 'status',
};

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
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const sortKey = searchParams.get('sortKey') || 'datetime';
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * pageSize;

  const isSalesperson = appUser?.role === 'salesperson';
  const salespersonDivisionIds = isSalesperson
    ? (appUser?.division_ids?.length ? appUser.division_ids : [-1])
    : null;

  const sortCol = SORT_COLS[sortKey] || 'dispatch_date';

  try {
    const params = [];
    let pIdx = 1;

    let salespersonFilter = '';
    if (salespersonDivisionIds) {
      params.push(salespersonDivisionIds);
      salespersonFilter = `AND sos.id IN (
        SELECT DISTINCT soi2.outbound_shipment_id
        FROM stock_outbound_shipment_items soi2
        JOIN stock_items i2 ON i2.id = soi2.item_id
        WHERE i2.division_id = ANY($${pIdx++}::bigint[])
      )`;
    }

    let searchFilter = '';
    if (search) {
      params.push(`%${search}%`);
      const sp = `$${pIdx++}`;
      searchFilter = `AND (
        sos.shipment_number ILIKE ${sp}
        OR sos.status ILIKE ${sp}
        OR sos.approval_status ILIKE ${sp}
        OR sos.payment_status ILIKE ${sp}
        OR sos.driver_name_snapshot ILIKE ${sp}
        OR sos.truck_license_plate_snapshot ILIKE ${sp}
        OR c.name ILIKE ${sp}
        OR c.phone ILIKE ${sp}
        OR sos.id IN (
          SELECT soi3.outbound_shipment_id
          FROM stock_outbound_shipment_items soi3
          JOIN stock_items i3 ON i3.id = soi3.item_id
          WHERE i3.name ILIKE ${sp} OR i3.sku ILIKE ${sp}
        )
      )`;
    }

    params.push(pageSize);
    const limitParam = `$${pIdx++}`;
    params.push(offset);
    const offsetParam = `$${pIdx++}`;

    const rows = await sql(
      `SELECT
         sos.id,
         sos.shipment_number,
         sos.truck_license_plate_snapshot AS truck_license_plate,
         sos.driver_name_snapshot AS driver_name,
         sos.created_at AS dispatch_date,
         sos.status,
         sos.approval_status,
         sos.payment_status,
         c.name AS customer_name,
         c.phone AS customer_phone_number,
         COALESCE(SUM(CASE WHEN i.unit_of_measure != 'bag' THEN soi.loaded_whole_qty ELSE 0 END), 0) AS total_whole_qty,
         COALESCE(SUM(CASE WHEN i.unit_of_measure != 'bag' THEN soi.loaded_broken_qty ELSE 0 END), 0) AS total_broken_qty,
         COALESCE(SUM(CASE WHEN i.unit_of_measure = 'bag' THEN soi.loaded_whole_qty ELSE 0 END), 0) AS total_bag_qty,
         COALESCE(SUM(CASE WHEN i.unit_of_measure != 'bag' THEN soi.loaded_whole_qty ELSE 0 END), 0)
           + COALESCE(SUM(CASE WHEN i.unit_of_measure != 'bag' THEN soi.loaded_broken_qty ELSE 0 END), 0) AS total_tile_qty,
         COALESCE(SUM(soi.returned_whole_qty), 0) AS total_return_whole_qty,
         COALESCE(SUM(soi.returned_broken_qty), 0) AS total_return_broken_qty,
         COALESCE(SUM((GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(soi.loaded_broken_qty, 0) - COALESCE(soi.returned_broken_qty, 0), 0)) * COALESCE(soi.rate_per_unit, 0)), 0) AS total_selling_price_excl,
         COALESCE(MAX(submitter.name), MAX(submitter.email), MAX(sos.created_by), '—') AS generated_by,
         COALESCE(MAX(submitter.role), 'stock_maintainer') AS generated_by_role,
         CASE
           WHEN sos.approval_status = 'approved' THEN COALESCE(MAX(approver.name), MAX(approver.email), '—')
           ELSE '—'
         END AS approved_by,
         STRING_AGG(DISTINCT i.name, ', ' ORDER BY i.name) AS product_names,
         STRING_AGG(DISTINCT i.sku, ', ' ORDER BY i.sku) AS product_skus,
         COUNT(*) OVER() AS total_count
       FROM stock_outbound_shipments sos
       LEFT JOIN stock_outbound_shipment_items soi ON sos.id = soi.outbound_shipment_id
       LEFT JOIN stock_items i ON i.id = soi.item_id
       LEFT JOIN stock_app_users submitter ON submitter.id = sos.submitted_by_user_id
       LEFT JOIN stock_app_users approver ON approver.id = sos.approved_by_user_id
       LEFT JOIN stock_customers c ON c.id = sos.customer_id
       WHERE 1=1 ${salespersonFilter} ${searchFilter}
       GROUP BY sos.id, sos.shipment_number, sos.truck_license_plate_snapshot, sos.driver_name_snapshot,
                sos.created_at, sos.status, sos.approval_status, sos.payment_status, c.name, c.phone
       ORDER BY ${sortCol} ${sortDir} NULLS LAST
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    return NextResponse.json({
      dispatches: rows.map(({ total_count, total_tile_qty, ...rest }) => rest),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to fetch dispatches:', error);
    return NextResponse.json({ error: 'Failed to fetch dispatches', detail: error.message }, { status: 500 });
  }
}
