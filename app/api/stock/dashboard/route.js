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
    const [summaryRows, activeItems, recentArrivals, recentDispatchProducts, recentDispatchesRaw] = await Promise.all([
      sql('SELECT * FROM stock_dashboard_summary_view LIMIT 1', []),
      sql(
        `SELECT i.id, i.sku, i.name, i.current_whole_qty, i.current_broken_qty, i.reorder_level, i.tiles_per_box, s.label AS size_label
         FROM stock_items i
         LEFT JOIN stock_sizes s ON s.id = i.size_id
         WHERE i.is_active = true
         ORDER BY COALESCE(current_whole_qty, 0) + COALESCE(current_broken_qty, 0) ASC, name ASC
         LIMIT 50`,
        []
      ),
      sql(
        `SELECT id, shipment_number, truck_license_plate, driver_name, arrival_date, status, approval_status, total_whole_qty, total_broken_qty
         FROM stock_inbound_shipments
         ORDER BY created_at DESC
         LIMIT 20`,
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
            COALESCE(SUM(soi.loaded_broken_qty), 0) as total_broken_qty
         FROM stock_outbound_shipments sos
         LEFT JOIN stock_outbound_shipment_items soi ON sos.id = soi.outbound_shipment_id
         GROUP BY sos.id
         ORDER BY sos.created_at DESC
         LIMIT 20`,
        []
      ),
    ]);

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
