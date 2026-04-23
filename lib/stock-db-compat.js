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
  };

  try {
    const rows = await sql(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('stock_items', 'stock_types')
         AND column_name IN ('category', 'weight_per_unit_kg', 'rate_per_bag')`,
      []
    );

    const set = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    const value = {
      hasStockTypesCategory: set.has('stock_types.category'),
      hasStockItemsWeightPerUnitKg: set.has('stock_items.weight_per_unit_kg'),
      hasStockItemsRatePerBag: set.has('stock_items.rate_per_bag'),
    };

    setCached({ at: now, value });
    return value;
  } catch (error) {
    setCached({ at: now, value: defaultValue });
    return defaultValue;
  }
}

