import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ suggestions: {}, message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'staff'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
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
    ] = await Promise.allSettled([
      sql('SELECT DISTINCT name FROM stock_suppliers WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT name FROM stock_transporters WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT name FROM stock_items WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT name AS brand FROM stock_brands WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT name AS division FROM stock_divisions WHERE name IS NOT NULL ORDER BY name', []),
      sql('SELECT DISTINCT finish FROM stock_items WHERE finish IS NOT NULL ORDER BY finish', []),
      sql('SELECT DISTINCT grade FROM stock_items WHERE grade IS NOT NULL ORDER BY grade', []),
      sql('SELECT DISTINCT label AS size_label FROM stock_sizes WHERE label IS NOT NULL ORDER BY label', []),
      sql('SELECT DISTINCT hsn_code FROM stock_inbound_shipment_items WHERE hsn_code IS NOT NULL ORDER BY hsn_code', []),
      sql('SELECT DISTINCT origin_city FROM stock_inbound_shipments WHERE origin_city IS NOT NULL ORDER BY origin_city', []),
      sql(
        `SELECT DISTINCT name AS destination_warehouse_name FROM (
           SELECT name FROM stock_locations WHERE name IS NOT NULL AND is_active = true
           UNION
           SELECT destination_warehouse_name AS name FROM stock_inbound_shipments WHERE destination_warehouse_name IS NOT NULL
         ) s WHERE name IS NOT NULL AND trim(name) <> '' ORDER BY destination_warehouse_name`,
        []
      ),
      sql('SELECT DISTINCT driver_name FROM stock_inbound_shipments WHERE driver_name IS NOT NULL ORDER BY driver_name', []),
      sql('SELECT DISTINCT truck_license_plate FROM stock_inbound_shipments WHERE truck_license_plate IS NOT NULL ORDER BY truck_license_plate', []),
      sql("SELECT DISTINCT payment_mode FROM stock_inbound_shipments WHERE payment_mode IS NOT NULL AND payment_mode <> '' ORDER BY payment_mode", []),
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
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load suggestions', detail: error.message }, { status: 500 });
  }
}
