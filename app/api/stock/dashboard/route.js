import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json(
      { error: 'Database not configured', message: 'Enable Neon PostgreSQL integration first.' },
      { status: 503 }
    );
  }

  const salespersonDivisionId = appUser?.role === 'salesperson' && appUser?.division_id
    ? appUser.division_id
    : null;

  try {
    const [summaryRows, activeItems, recentArrivalsRaw, recentArrivalProducts, recentDispatchProducts, recentDispatchesRaw] = await Promise.all([
      sql('SELECT * FROM stock_dashboard_summary_view LIMIT 1', []),
      sql(
        `SELECT
           i.id,
           i.sku,
           i.name,
           i.description,
           i.current_whole_qty,
           i.current_broken_qty,
           i.reorder_level,
           i.tiles_per_box,
           i.pieces_per_box,
           i.thickness_mm,
           i.finish,
           i.grade,
           i.unit_of_measure,
           i.weight_per_unit_kg,
           i.rate_per_bag,
           b.name AS brand_name,
           t.name AS type_name,
           d.name AS division_name,
           s.label AS size_label,
           s.unit AS size_unit,
           s.width_mm,
           s.length_mm,
           (SELECT isi.hsn_code FROM stock_inbound_shipment_items isi
              WHERE isi.item_id = i.id AND isi.hsn_code IS NOT NULL
              ORDER BY isi.id DESC LIMIT 1) AS hsn_code,
           (SELECT isi.cost_per_sqm FROM stock_inbound_shipment_items isi
              WHERE isi.item_id = i.id AND isi.cost_per_sqm IS NOT NULL
              ORDER BY isi.id DESC LIMIT 1) AS cost_per_sqm
         FROM stock_items i
         LEFT JOIN stock_brands b ON b.id = i.brand_id
         LEFT JOIN stock_types t ON t.id = i.type_id
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         LEFT JOIN stock_sizes s ON s.id = i.size_id
         WHERE i.is_active = true
         ${salespersonDivisionId ? 'AND i.division_id = $1' : ''}
         ORDER BY COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) ASC, i.name ASC
         LIMIT 50`,
        salespersonDivisionId ? [salespersonDivisionId] : []
      ),
      sql(
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
           END AS approved_by
         FROM stock_inbound_shipments s
         LEFT JOIN stock_app_users submitter ON submitter.id = s.submitted_by_user_id
         LEFT JOIN stock_app_users approver ON approver.id = s.approved_by_user_id
         LEFT JOIN stock_locations loc ON loc.id = s.destination_location_id
         ${salespersonDivisionId ? `WHERE s.id IN (
           SELECT DISTINCT isi.inbound_shipment_id FROM stock_inbound_shipment_items isi
           JOIN stock_items i ON i.id = isi.item_id WHERE i.division_id = $1
         )` : ''}
         ORDER BY s.created_at DESC
         LIMIT 20`,
        salespersonDivisionId ? [salespersonDivisionId] : []
      ),
      sql(
        `SELECT
           isi.inbound_shipment_id,
           STRING_AGG(DISTINCT i.name, ', ' ORDER BY i.name) AS product_names,
           STRING_AGG(DISTINCT i.sku, ', ' ORDER BY i.sku) AS product_skus
           ,COALESCE(SUM(isi.qty_sqm), 0) AS total_qty_sqm
           ,COALESCE(AVG(NULLIF(isi.cost_per_sqm, 0)), 0) AS avg_cost_per_sqm
           ,STRING_AGG(DISTINCT COALESCE(d.name, 'General'), ', ' ORDER BY COALESCE(d.name, 'General')) AS divisions
         FROM stock_inbound_shipment_items isi
         JOIN stock_items i ON i.id = isi.item_id
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE isi.inbound_shipment_id IN (
           SELECT id FROM stock_inbound_shipments ORDER BY created_at DESC LIMIT 20
         )
         ${salespersonDivisionId ? 'AND i.division_id = $1' : ''}
         GROUP BY isi.inbound_shipment_id`,
        salespersonDivisionId ? [salespersonDivisionId] : []
      ),
      sql(
        `SELECT
           soi.outbound_shipment_id,
           STRING_AGG(DISTINCT i.name, ', ' ORDER BY i.name) AS product_names,
           STRING_AGG(DISTINCT i.sku, ', ' ORDER BY i.sku) AS product_skus,
           SUM(soi.loaded_whole_qty) AS total_whole_qty,
           SUM(soi.loaded_broken_qty) AS total_broken_qty
         FROM stock_outbound_shipment_items soi
         JOIN stock_items i ON i.id = soi.item_id
         WHERE soi.outbound_shipment_id IN (
           SELECT id FROM stock_outbound_shipments ORDER BY created_at DESC LIMIT 20
         )
         ${salespersonDivisionId ? 'AND i.division_id = $1' : ''}
         GROUP BY soi.outbound_shipment_id`,
        salespersonDivisionId ? [salespersonDivisionId] : []
      ),
      sql(
        `WITH recent_sos AS (
           SELECT *
           FROM stock_outbound_shipments
           ${salespersonDivisionId ? `WHERE id IN (
             SELECT DISTINCT soi.outbound_shipment_id FROM stock_outbound_shipment_items soi
             JOIN stock_items i ON i.id = soi.item_id WHERE i.division_id = $1
           )` : ''}
           ORDER BY created_at DESC
           LIMIT 20
         )
          SELECT
             sos.id,
             sos.shipment_number,
             sos.truck_license_plate_snapshot AS truck_license_plate,
             sos.driver_name_snapshot AS driver_name,
             sos.created_at AS dispatch_date,
             sos.status,
             sos.approval_status,
             c.name AS customer_name,
             c.phone AS customer_phone_number,
             COALESCE(SUM(soi.loaded_whole_qty), 0) as total_whole_qty,
             COALESCE(SUM(soi.loaded_broken_qty), 0) as total_broken_qty,
             COALESCE(SUM(soi.returned_whole_qty), 0) as total_return_whole_qty,
             COALESCE(SUM(soi.returned_broken_qty), 0) as total_return_broken_qty,
             COALESCE(MAX(submitter.name), MAX(submitter.email), MAX(sos.created_by), '—') AS generated_by,
             COALESCE(MAX(submitter.role), 'stock_maintainer') AS generated_by_role,
             CASE
               WHEN sos.approval_status = 'approved' THEN COALESCE(MAX(approver.name), MAX(approver.email), '—')
               ELSE '—'
             END AS approved_by
          FROM recent_sos sos
          LEFT JOIN stock_outbound_shipment_items soi ON sos.id = soi.outbound_shipment_id
          LEFT JOIN stock_app_users submitter ON submitter.id = sos.submitted_by_user_id
          LEFT JOIN stock_app_users approver ON approver.id = sos.approved_by_user_id
          LEFT JOIN stock_customers c ON c.id = sos.customer_id
          GROUP BY sos.id, sos.shipment_number, sos.truck_license_plate_snapshot, sos.driver_name_snapshot, sos.created_at, sos.status, sos.approval_status, c.name, c.phone
          ORDER BY sos.created_at DESC`,
        salespersonDivisionId ? [salespersonDivisionId] : []
      ),
    ]);

    const recentArrivalProductsByShipment = new Map(
      recentArrivalProducts.map((item) => [String(item.inbound_shipment_id), item])
    );

    const recentArrivals = recentArrivalsRaw.map((shipment) => {
      const details = recentArrivalProductsByShipment.get(String(shipment.id)) || {};

      return {
        ...shipment,
        product_names: details.product_names || '',
        product_skus: details.product_skus || '',
        total_qty_sqm: details.total_qty_sqm || 0,
        avg_cost_per_sqm: details.avg_cost_per_sqm || 0,
        divisions: details.divisions || '',
      };
    });

    const recentDispatchProductsByShipment = new Map(
      recentDispatchProducts.map((item) => [String(item.outbound_shipment_id), item])
    );

    const recentDispatches = recentDispatchesRaw.map((shipment) => {
      const details = recentDispatchProductsByShipment.get(String(shipment.id)) || {};

      return {
        ...shipment,
        product_names: details.product_names || '',
        product_skus: details.product_skus || '',
      };
    });

    return NextResponse.json({
      summary: summaryRows[0] || {},
      activeItems,
      recentPurchases: recentArrivals,
      recentArrivals,
      recentDispatches,
    });
  } catch (error) {
    console.error('Failed to load stock dashboard:', error);
    return NextResponse.json({ error: 'Failed to load dashboard', detail: error.message }, { status: 500 });
  }
}
