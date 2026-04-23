import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ suggestions: {}, message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const schemaCaps = await getStockSchemaCapabilities();
    const pick = (result, col) => {
      const rows = result?.status === 'fulfilled' ? result.value : [];
      return rows.map((r) => r[col]).filter((v) => v != null && String(v).trim() !== '');
    };

    const [
      suppliers,
      transporters,
      items,
      brands,
      divisions,
      finishes,
      grades,
      sizes,
      hsnCodes,
      originCities,
      warehouses,
      drivers,
      trucks,
      paymentModes,
      bagTypes,
      bagItems,
      salespersons,
    ] = await Promise.allSettled([
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
      sql(
        `SELECT name AS destination_warehouse_name FROM stock_locations
         WHERE name IS NOT NULL AND trim(name) <> '' AND is_active = true AND location_type = 'warehouse'
         ORDER BY name`,
        []
      ),
      sql('SELECT DISTINCT driver_name FROM stock_inbound_shipments WHERE driver_name IS NOT NULL ORDER BY driver_name', []),
      sql('SELECT DISTINCT truck_license_plate FROM stock_inbound_shipments WHERE truck_license_plate IS NOT NULL ORDER BY truck_license_plate', []),
      sql("SELECT DISTINCT payment_mode FROM stock_inbound_shipments WHERE payment_mode IS NOT NULL AND payment_mode <> '' ORDER BY payment_mode", []),
      schemaCaps.hasStockTypesCategory
        ? sql(`SELECT name AS bag_type FROM stock_types WHERE category = 'bag' AND is_active = true ORDER BY name`, [])
        : Promise.resolve([]),
      schemaCaps.hasStockTypesCategory
        ? sql(`SELECT DISTINCT i.name AS bag_item_name FROM stock_items i JOIN stock_types t ON t.id = i.type_id WHERE t.category = 'bag' AND i.is_active = true ORDER BY i.name`, [])
        : Promise.resolve([]),
      sql('SELECT name AS salesperson_name FROM stock_sales_people WHERE is_active = true ORDER BY name', []),
    ]);

    return NextResponse.json({
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
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load suggestions', detail: error.message }, { status: 500 });
  }
}
