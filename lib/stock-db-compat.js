// ponytail: every flag is true since db/migrations/0000_baseline.sql (prod had all
// of these columns on 2026-11-20). Kept so the ~24 callers keep compiling; delete
// the `if (!caps.hasX)` branches and then this file as those callers are touched.
const ALL = Object.freeze({
  hasStockTypesCategory: true,
  hasStockItemsWeightPerUnitKg: true,
  hasStockItemsRatePerBag: true,
  hasOutboundSalespersonUserId: true,
  hasStoneSqft: true,
  hasShowroomStock: true,
  hasShowroomInstalled: true,
  hasInboundTrips: true,
  hasUserCanSell: true,
  hasSalesInvoices: true,
  hasAccounts: true,
});

export async function getStockSchemaCapabilities() {
  return ALL;
}
