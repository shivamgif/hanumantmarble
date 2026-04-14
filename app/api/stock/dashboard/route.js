import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

export async function GET(request) {
  const { session } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json(
      { error: 'Database not configured', message: 'Enable Neon PostgreSQL integration first.' },
      { status: 503 }
    );
  }

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
           i.unit_of_measure,
           b.name AS brand_name,
           t.name AS type_name,
           s.label AS size_label,
           s.unit AS size_unit
         FROM stock_items i
         LEFT JOIN stock_brands b ON b.id = i.brand_id
         LEFT JOIN stock_types t ON t.id = i.type_id
         LEFT JOIN stock_sizes s ON s.id = i.size_id
         WHERE i.is_active = true
         ORDER BY COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) ASC, i.name ASC
         LIMIT 50`,
        []
      ),
      sql(
        `SELECT
           s.id,
           s.shipment_number,
           s.truck_license_plate,
           s.driver_name,
           s.arrival_date,
           s.status,
           s.approval_status,
           s.total_whole_qty,
           s.total_broken_qty,
           COALESCE(submitter.name, submitter.email, s.created_by, '—') AS generated_by,
           COALESCE(submitter.role, 'stock_maintainer') AS generated_by_role,
           CASE
             WHEN s.approval_status = 'approved' THEN COALESCE(approver.name, approver.email, '—')
             ELSE '—'
           END AS approved_by
         FROM stock_inbound_shipments s
         LEFT JOIN stock_app_users submitter ON submitter.id = s.submitted_by_user_id
         LEFT JOIN stock_app_users approver ON approver.id = s.approved_by_user_id
         ORDER BY s.created_at DESC
         LIMIT 20`,
        []
      ),
      sql(
        `SELECT
           isi.inbound_shipment_id,
           STRING_AGG(DISTINCT i.name, ', ' ORDER BY i.name) AS product_names,
           STRING_AGG(DISTINCT i.sku, ', ' ORDER BY i.sku) AS product_skus
         FROM stock_inbound_shipment_items isi
         JOIN stock_items i ON i.id = isi.item_id
         GROUP BY isi.inbound_shipment_id`,
        []
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
         GROUP BY soi.outbound_shipment_id`,
        []
      ),
      sql(
        `SELECT 
            sos.id, 
            sos.shipment_number, 
            sos.truck_license_plate, 
            sos.driver_name, 
            sos.created_at AS dispatch_date, 
            sos.status, 
            sos.approval_status,
            COALESCE(SUM(soi.loaded_whole_qty), 0) as total_whole_qty,
            COALESCE(SUM(soi.loaded_broken_qty), 0) as total_broken_qty,
            COALESCE(MAX(submitter.name), MAX(submitter.email), MAX(sos.created_by), '—') AS generated_by,
            COALESCE(MAX(submitter.role), 'stock_maintainer') AS generated_by_role,
            CASE
              WHEN sos.approval_status = 'approved' THEN COALESCE(MAX(approver.name), MAX(approver.email), '—')
              ELSE '—'
            END AS approved_by
         FROM stock_outbound_shipments sos
         LEFT JOIN stock_outbound_shipment_items soi ON sos.id = soi.outbound_shipment_id
         LEFT JOIN stock_app_users submitter ON submitter.id = sos.submitted_by_user_id
         LEFT JOIN stock_app_users approver ON approver.id = sos.approved_by_user_id
         GROUP BY sos.id
         ORDER BY sos.created_at DESC
         LIMIT 20`,
        []
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
      recentArrivals,
      recentDispatches,
    });
  } catch (error) {
    console.error('Failed to load stock dashboard:', error);
    return NextResponse.json({ error: 'Failed to load dashboard', detail: error.message }, { status: 500 });
  }
}
