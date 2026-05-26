import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

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

  const isSalesperson = appUser?.role === 'salesperson';
  // A salesperson with no divisions assigned gets an empty array — return nothing, not everything.
  const salespersonDivisionIds = isSalesperson
    ? (appUser?.division_ids?.length ? appUser.division_ids : [-1])
    : null;

  try {
    const schemaCaps = await getStockSchemaCapabilities();
    const weightPerUnitSelect = schemaCaps.hasStockItemsWeightPerUnitKg
      ? 'i.weight_per_unit_kg'
      : 'NULL::numeric AS weight_per_unit_kg';
    const ratePerBagSelect = schemaCaps.hasStockItemsRatePerBag
      ? 'i.rate_per_bag'
      : 'NULL::numeric AS rate_per_bag';

    const pick = (result, col) => {
      const rows = result?.status === 'fulfilled' ? result.value : [];
      return rows.map((r) => r[col]).filter((v) => v != null && String(v).trim() !== '');
    };

    const dashboardPromise = Promise.all([
      sql('SELECT * FROM stock_dashboard_summary_view LIMIT 1', []),
      sql(
        `SELECT
           i.id,
           i.sku,
           i.name,
           i.description,
           i.current_whole_qty,
           i.current_broken_qty,
           i.current_piece_remainder,
           i.current_broken_piece_remainder,
           i.reorder_level,
           i.tiles_per_box,
           i.pieces_per_box,
           i.thickness_mm,
           i.finish,
           i.grade,
           i.unit_of_measure,
           ${weightPerUnitSelect},
           ${ratePerBagSelect},
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
         ${salespersonDivisionIds ? 'AND i.division_id = ANY($1::bigint[])' : ''}
         ORDER BY COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) ASC, i.name ASC`,
        salespersonDivisionIds ? [salespersonDivisionIds] : []
      ),
      sql(
        `SELECT COUNT(*) AS pending_arrival_count
         FROM stock_inbound_shipments s
         WHERE s.approval_status = 'pending'
         ${salespersonDivisionIds ? `AND s.id IN (
           SELECT DISTINCT isi.inbound_shipment_id FROM stock_inbound_shipment_items isi
           JOIN stock_items i ON i.id = isi.item_id WHERE i.division_id = ANY($1::bigint[])
         )` : ''}`,
        salespersonDivisionIds ? [salespersonDivisionIds] : []
      ),
      sql(
        `SELECT COUNT(*) AS pending_dispatch_count
         FROM stock_outbound_shipments sos
         WHERE sos.approval_status = 'pending'
         ${salespersonDivisionIds ? `AND sos.id IN (
           SELECT DISTINCT soi.outbound_shipment_id FROM stock_outbound_shipment_items soi
           JOIN stock_items i ON i.id = soi.item_id WHERE i.division_id = ANY($1::bigint[])
         )` : ''}`,
        salespersonDivisionIds ? [salespersonDivisionIds] : []
      ),
    ]);

    const suggestionsPromise = Promise.allSettled([
      sql('SELECT DISTINCT name FROM stock_suppliers WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT name FROM stock_transporters WHERE name IS NOT NULL ORDER BY name', []),
      schemaCaps.hasStockTypesCategory
        ? sql(`SELECT DISTINCT i.name FROM stock_items i LEFT JOIN stock_types t ON t.id = i.type_id WHERE i.name IS NOT NULL AND (t.category IS NULL OR t.category = 'tile') ORDER BY i.name`, [])
        : sql(`SELECT DISTINCT i.name FROM stock_items i WHERE i.name IS NOT NULL ORDER BY i.name`, []),
      sql('SELECT DISTINCT name AS brand FROM stock_brands WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT name AS division FROM stock_divisions WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT finish FROM stock_items WHERE finish IS NOT NULL ORDER BY finish', []),
      sql('SELECT DISTINCT grade FROM stock_items WHERE grade IS NOT NULL ORDER BY grade', []),
      sql('SELECT DISTINCT label AS size_label FROM stock_sizes WHERE label IS NOT NULL ORDER BY label', []),
      sql('SELECT DISTINCT hsn_code FROM stock_inbound_shipment_items WHERE hsn_code IS NOT NULL ORDER BY hsn_code', []),
      sql('SELECT DISTINCT origin_city FROM stock_inbound_shipments WHERE origin_city IS NOT NULL ORDER BY origin_city', []),
      sql(`SELECT name AS destination_warehouse_name FROM stock_locations WHERE name IS NOT NULL AND trim(name) <> '' AND is_active = true AND location_type = 'warehouse' ORDER BY name`, []),
      sql('SELECT DISTINCT driver_name FROM stock_inbound_shipments WHERE driver_name IS NOT NULL ORDER BY driver_name', []),
      sql('SELECT DISTINCT truck_license_plate FROM stock_inbound_shipments WHERE truck_license_plate IS NOT NULL ORDER BY truck_license_plate', []),
      sql("SELECT DISTINCT payment_mode FROM stock_inbound_shipments WHERE payment_mode IS NOT NULL AND payment_mode <> '' ORDER BY payment_mode", []),
      schemaCaps.hasStockTypesCategory
        ? sql(`SELECT name AS bag_type FROM stock_types WHERE category = 'bag' AND is_active = true ORDER BY name`, [])
        : Promise.resolve([]),
      schemaCaps.hasStockTypesCategory
        ? sql(`SELECT DISTINCT i.name AS bag_item_name FROM stock_items i JOIN stock_types t ON t.id = i.type_id WHERE t.category = 'bag' AND i.is_active = true ORDER BY i.name`, [])
        : Promise.resolve([]),
      sql(
        `SELECT
           u.id AS salesperson_user_id,
           u.name AS salesperson_name,
           ARRAY_AGG(ud.division_id ORDER BY ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL) AS division_ids,
           STRING_AGG(d.name, ', ' ORDER BY d.name) AS division_names
         FROM stock_app_users u
         LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
         LEFT JOIN stock_divisions d ON d.id = ud.division_id
         WHERE u.role = 'salesperson'
           AND u.status = 'active'
         GROUP BY u.id
         ORDER BY u.name`,
        []
      ),
    ]);

    const currentMonthValuePromise = appUser?.role === 'salesperson' && appUser?.id
      ? sql(
          `SELECT COALESCE(SUM(GREATEST(COALESCE(soi.loaded_whole_qty, 0) - COALESCE(soi.returned_whole_qty, 0), 0) * COALESCE(soi.rate_per_unit, 0)), 0) AS current_month_dispatch_value
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
           WHERE ${schemaCaps.hasOutboundSalespersonUserId
             ? `(s.salesperson_user_id = $1 OR (s.salesperson_user_id IS NULL AND s.submitted_by_user_id = $1))`
             : `s.submitted_by_user_id = $1`}
             AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', CURRENT_DATE)
             AND s.status != 'cancelled'`,
          [appUser.id]
        )
      : Promise.resolve([{ current_month_dispatch_value: 0 }]);

    const [dashboardResults, suggestionsResults, currentMonthValueRows] = await Promise.all([dashboardPromise, suggestionsPromise, currentMonthValuePromise]);
    const [summaryRows, activeItems, pendingArrivalCountRows, pendingDispatchCountRows] = dashboardResults;
    const [suppliers, transporters, items, brands, divisions, finishes, grades, sizes, hsnCodes, originCities, warehouses, drivers, trucks, paymentModes, bagTypes, bagItems, salespersons] = suggestionsResults;

    return NextResponse.json({
      role: normalizeStockRole(appUser?.role),
      suggestions: {
        supplierName: pick(suppliers, 'name'),
        transporterName: pick(transporters, 'name'),
        itemName: pick(items, 'name'),
        brandName: pick(brands, 'brand'),
        divisionName: pick(divisions, 'division'),
        finish: pick(finishes, 'finish'),
        grade: pick(grades, 'grade'),
        sizeLabel: pick(sizes, 'size_label'),
        hsnCode: pick(hsnCodes, 'hsn_code'),
        originCity: pick(originCities, 'origin_city'),
        destinationWarehouseName: pick(warehouses, 'destination_warehouse_name'),
        driverName: pick(drivers, 'driver_name'),
        truckLicensePlate: pick(trucks, 'truck_license_plate'),
        paymentMode: pick(paymentModes, 'payment_mode'),
        bagType: pick(bagTypes, 'bag_type'),
        bagItemName: pick(bagItems, 'bag_item_name'),
        salespersonName: pick(salespersons, 'salesperson_name'),
        salespersons: salespersons?.status === 'fulfilled'
          ? salespersons.value.map((row) => ({
              id: Number(row.salesperson_user_id),
              name: row.salesperson_name,
              divisionIds: Array.isArray(row.division_ids) ? row.division_ids.map(Number) : [],
              divisionNames: row.division_names || null,
            }))
          : [],
      },
      summary: summaryRows[0] || {},
      activeItems,
      pendingArrivalCount: Number(pendingArrivalCountRows[0]?.pending_arrival_count ?? 0),
      pendingDispatchCount: Number(pendingDispatchCountRows[0]?.pending_dispatch_count ?? 0),
      currentMonthDispatchValue: Number(currentMonthValueRows[0]?.current_month_dispatch_value ?? 0),
    });
  } catch (error) {
    console.error('Failed to load stock dashboard:', error);
    return NextResponse.json({ error: 'Failed to load dashboard', detail: error.message }, { status: 500 });
  }
}
