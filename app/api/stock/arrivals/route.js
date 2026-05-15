import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

const SORT_COLS = {
  datetime: 'arrival_date',
  shipment: 'shipment_number',
  products: 'product_names',
  quantities: 'total_whole_qty',
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

  const sortCol = SORT_COLS[sortKey] || 'arrival_date';

  try {
    const schemaCaps = await getStockSchemaCapabilities();

    const params = [];
    let pIdx = 1;

    let salespersonFilter = '';
    if (salespersonDivisionIds) {
      params.push(salespersonDivisionIds);
      salespersonFilter = `AND s.id IN (
        SELECT DISTINCT isi2.inbound_shipment_id
        FROM stock_inbound_shipment_items isi2
        JOIN stock_items i2 ON i2.id = isi2.item_id
        WHERE i2.division_id = ANY($${pIdx++}::bigint[])
      )`;
    }

    let searchFilter = '';
    if (search) {
      params.push(`%${search}%`);
      const sp = `$${pIdx++}`;
      searchFilter = `AND (
        s.shipment_number ILIKE ${sp}
        OR s.status ILIKE ${sp}
        OR s.approval_status ILIKE ${sp}
        OR s.payment_status ILIKE ${sp}
        OR s.driver_name_snapshot ILIKE ${sp}
        OR s.truck_license_plate_snapshot ILIKE ${sp}
        OR s.invoice_number ILIKE ${sp}
        OR s.origin_city ILIKE ${sp}
        OR loc.name ILIKE ${sp}
      )`;
    }

    params.push(pageSize);
    const limitParam = `$${pIdx++}`;
    params.push(offset);
    const offsetParam = `$${pIdx++}`;

    const rows = await sql(
      `SELECT
         s.id,
         s.shipment_number,
         s.truck_license_plate_snapshot AS truck_license_plate,
         s.driver_name_snapshot AS driver_name,
         s.arrival_date,
         s.invoice_number,
         s.invoice_date,
         s.origin_city,
         loc.name AS destination_warehouse_name,
         s.payment_status,
         s.paid_amount,
         s.payment_date,
         s.payment_reference,
         s.payment_mode,
         s.status,
         s.approval_status,
         s.total_whole_qty,
         s.total_broken_qty,
         s.grand_total,
         s.freight_weight_kg,
         COALESCE(submitter.name, submitter.email, s.created_by, '—') AS generated_by,
         COALESCE(submitter.role, 'stock_maintainer') AS generated_by_role,
         CASE
           WHEN s.approval_status = 'approved' THEN COALESCE(approver.name, approver.email, '—')
           ELSE '—'
         END AS approved_by,
         STRING_AGG(DISTINCT i.name, ', ' ORDER BY i.name) AS product_names,
         STRING_AGG(DISTINCT i.sku, ', ' ORDER BY i.sku) AS product_skus,
         COALESCE(SUM(isi.qty_sqm), 0) AS total_qty_sqm,
         COALESCE(AVG(NULLIF(isi.cost_per_sqm, 0)), 0) AS avg_cost_per_sqm,
         STRING_AGG(DISTINCT COALESCE(d.name, 'Adhesive'), ', ' ORDER BY COALESCE(d.name, 'Adhesive')) AS divisions,
         COALESCE(SUM(CASE WHEN i.unit_of_measure = 'bag' THEN isi.ordered_qty ELSE 0 END), 0) AS total_bag_qty,
         COUNT(*) OVER() AS total_count
       FROM stock_inbound_shipments s
       LEFT JOIN stock_inbound_shipment_items isi ON isi.inbound_shipment_id = s.id
       LEFT JOIN stock_items i ON i.id = isi.item_id
       LEFT JOIN stock_divisions d ON d.id = i.division_id
       LEFT JOIN stock_app_users submitter ON submitter.id = s.submitted_by_user_id
       LEFT JOIN stock_app_users approver ON approver.id = s.approved_by_user_id
       LEFT JOIN stock_locations loc ON loc.id = s.destination_location_id
       WHERE 1=1 ${salespersonFilter} ${searchFilter}
       GROUP BY s.id, s.shipment_number, s.truck_license_plate_snapshot, s.driver_name_snapshot,
                s.arrival_date, s.invoice_number, s.invoice_date, s.origin_city,
                s.payment_status, s.paid_amount, s.payment_date, s.payment_reference,
                s.payment_mode, s.status, s.approval_status, s.total_whole_qty, s.total_broken_qty,
                s.grand_total, s.freight_weight_kg, s.created_by,
                submitter.name, submitter.email, submitter.role,
                approver.name, approver.email,
                loc.name
       ORDER BY ${sortCol} ${sortDir} NULLS LAST
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    return NextResponse.json({
      arrivals: rows.map(({ total_count, ...rest }) => rest),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to fetch arrivals:', error);
    return NextResponse.json({ error: 'Failed to fetch arrivals', detail: error.message }, { status: 500 });
  }
}
