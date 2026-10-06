import { sql } from '@/lib/db';

const CACHE_TTL_MS = 60_000;

function getCached() {
  return globalThis._stockSchemaCapabilitiesCache ?? null;
}

function setCached(value) {
  globalThis._stockSchemaCapabilitiesCache = value;
}

export async function getStockSchemaCapabilities() {
  const now = Date.now();
  const cached = getCached();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const defaultValue = {
    hasStockTypesCategory: false,
    hasStockItemsWeightPerUnitKg: false,
    hasStockItemsRatePerBag: false,
    hasOutboundSalespersonUserId: false,
    hasStoneSqft: false,
    hasShowroomStock: false,
    hasShowroomInstalled: false,
    hasInboundTrips: false,
    hasUserCanSell: false,
    hasSalesInvoices: false,
  };

  try {
    const rows = await sql(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
        AND (
          (table_name IN ('stock_items', 'stock_types')
            AND column_name IN ('category', 'weight_per_unit_kg', 'rate_per_bag', 'current_sqft', 'showroom_whole_qty', 'showroom_installed_whole_qty'))
          OR (table_name = 'stock_outbound_shipments' AND column_name IN ('salesperson_user_id', 'sales_invoice_id'))
          OR (table_name = 'stock_inbound_shipments' AND column_name = 'trip_id')
          OR (table_name = 'stock_app_users' AND column_name = 'can_sell')
        )`,
      []
    );

    const set = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    const value = {
      hasStockTypesCategory: set.has('stock_types.category'),
      hasStockItemsWeightPerUnitKg: set.has('stock_items.weight_per_unit_kg'),
      hasStockItemsRatePerBag: set.has('stock_items.rate_per_bag'),
      hasOutboundSalespersonUserId: set.has('stock_outbound_shipments.salesperson_user_id'),
      hasStoneSqft: set.has('stock_items.current_sqft'),
      hasShowroomStock: set.has('stock_items.showroom_whole_qty'),
      hasShowroomInstalled: set.has('stock_items.showroom_installed_whole_qty'),
      // scripts/migrate-inbound-trips.mjs. Until it runs, freight stays on the
      // shipment columns the old way, so a deploy ahead of the migration still
      // saves purchases instead of failing on a missing table.
      hasInboundTrips: set.has('stock_inbound_shipments.trip_id'),
      // scripts/migrate-admin-can-sell.mjs. Until it runs, sellerFilter() falls
      // back to role = 'salesperson', so a deploy ahead of the migration keeps
      // the dropdown and dispatch validation behaving exactly as before.
      hasUserCanSell: set.has('stock_app_users.can_sell'),
      // scripts/migrate-sales-invoices.mjs. Until it runs, invoicing answers 503
      // and branches/dispatches behave exactly as before.
      hasSalesInvoices: set.has('stock_outbound_shipments.sales_invoice_id'),
    };

    setCached({ at: now, value });
    return value;
  } catch (error) {
    setCached({ at: now, value: defaultValue });
    return defaultValue;
  }
}
