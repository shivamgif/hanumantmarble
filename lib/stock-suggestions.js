import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { sellerFilter } from '@/lib/stock-analytics-sql.mjs';

// [key in the response, SQL that returns one text column]. Order = display order.
const LISTS = [
  ['supplierName', `SELECT DISTINCT name FROM stock_suppliers WHERE name IS NOT NULL ORDER BY name`],
  ['transporterName', `SELECT DISTINCT name FROM stock_transporters WHERE name IS NOT NULL ORDER BY name`],
  ['itemName', `SELECT DISTINCT i.name FROM stock_items i LEFT JOIN stock_types t ON t.id = i.type_id
                WHERE i.name IS NOT NULL AND (t.category IS NULL OR t.category = 'tile') ORDER BY i.name`],
  ['brandName', `SELECT DISTINCT name FROM stock_brands WHERE name IS NOT NULL ORDER BY name`],
  ['divisionName', `SELECT DISTINCT name FROM stock_divisions WHERE name IS NOT NULL ORDER BY name`],
  ['finish', `SELECT DISTINCT finish FROM stock_items WHERE finish IS NOT NULL ORDER BY finish`],
  ['grade', `SELECT DISTINCT grade FROM stock_items WHERE grade IS NOT NULL ORDER BY grade`],
  ['sizeLabel', `SELECT DISTINCT label FROM stock_sizes WHERE label IS NOT NULL ORDER BY label`],
  ['hsnCode', `SELECT DISTINCT hsn_code FROM stock_inbound_shipment_items WHERE hsn_code IS NOT NULL ORDER BY hsn_code`],
  ['originCity', `SELECT DISTINCT origin_city FROM stock_inbound_shipments WHERE origin_city IS NOT NULL ORDER BY origin_city`],
  ['destinationWarehouseName', `SELECT name FROM stock_locations
                WHERE name IS NOT NULL AND trim(name) <> '' AND is_active = true AND location_type = 'warehouse' ORDER BY name`],
  // The _snapshot columns: the plain driver_name / truck_license_plate ones are
  // gone, and with no suggestions every clerk types the plate their own way,
  // which is what trip matching depends on.
  ['driverName', `SELECT DISTINCT driver_name_snapshot FROM stock_inbound_shipments
                WHERE driver_name_snapshot IS NOT NULL AND driver_name_snapshot <> '' ORDER BY 1`],
  ['truckLicensePlate', `SELECT DISTINCT truck_license_plate_snapshot FROM stock_inbound_shipments
                WHERE truck_license_plate_snapshot IS NOT NULL AND truck_license_plate_snapshot <> '' ORDER BY 1`],
  ['paymentMode', `SELECT DISTINCT payment_mode FROM stock_inbound_shipments WHERE payment_mode IS NOT NULL AND payment_mode <> '' ORDER BY payment_mode`],
  ['bagType', `SELECT name FROM stock_types WHERE category = 'bag' AND is_active = true ORDER BY name`],
  ['bagItemName', `SELECT DISTINCT i.name FROM stock_items i JOIN stock_types t ON t.id = i.type_id
                WHERE t.category = 'bag' AND i.is_active = true ORDER BY i.name`],
  ['stoneType', `SELECT name FROM stock_types WHERE category = 'stone' AND is_active = true ORDER BY name`],
  ['stoneItemName', `SELECT DISTINCT i.name FROM stock_items i JOIN stock_types t ON t.id = i.type_id
                WHERE t.category = 'stone' AND i.is_active = true ORDER BY i.name`],
  // Thekedars / mistris who sent customers, so one person is always spelled one way.
  ['referredByName', `SELECT DISTINCT referred_by_name FROM stock_sales_invoices
                WHERE referred_by_name IS NOT NULL AND referred_by_name <> '' ORDER BY 1`],
];

/**
 * Every typeahead list the stock forms use, in ONE statement. Inside a request
 * all queries share the tenant transaction's connection, so ~19 small queries
 * would run back to back; as subqueries of one SELECT they cost one round trip.
 */
export async function loadFormSuggestions() {
  const caps = await getStockSchemaCapabilities();
  const [row] = await sql(`SELECT
    ${LISTS.map(([key, query], i) => `ARRAY(${query})::text[] AS l${i}`).join(',\n    ')},
    COALESCE((
      SELECT json_agg(s ORDER BY s.name) FROM (
        SELECT u.id, u.name,
               ARRAY_AGG(ud.division_id ORDER BY ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL) AS division_ids,
               STRING_AGG(d.name, ', ' ORDER BY d.name) AS division_names
          FROM stock_app_users u
          LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
          LEFT JOIN stock_divisions d ON d.id = ud.division_id
         WHERE ${sellerFilter(caps, 'u')} AND u.status = 'active'
         GROUP BY u.id
      ) s
    ), '[]'::json) AS salespersons`);

  const suggestions = Object.fromEntries(
    LISTS.map(([key], i) => [key, (row[`l${i}`] || []).filter((v) => v != null && String(v).trim() !== '')])
  );
  const salespersons = (row.salespersons || []).map((s) => ({
    id: Number(s.id),
    name: s.name,
    divisionIds: Array.isArray(s.division_ids) ? s.division_ids.map(Number) : [],
    divisionNames: s.division_names || null,
  }));
  suggestions.salespersonName = salespersons.map((s) => s.name).filter(Boolean);
  suggestions.salespersons = salespersons;
  return suggestions;
}
