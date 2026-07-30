// Per-salesperson slice of the admin analytics payload. Kept as a plain module
// (no React, no recharts) so scripts/check-spotlight.mjs can assert on it.
//
// Inputs are the raw rows from /api/stock/admin/analytics:
//   trend   -> salespersonPerformance.trend   { bucket, salesperson, shipment_count, total_qty, total_revenue }
//   ranking -> salespersonPerformance.ranking { salesperson, shipments, quantity, revenue, growth_ratio, consistency_score }
//   goals   -> salespersonGoals               { id, name, goal, actual, shipments }
export function deriveSpotlight(trend, ranking, goals, selected) {
  const rows = trend || [];
  const ranked = ranking || [];

  const roster = [...new Set(rows.map((r) => r.salesperson).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Fall back to the top performer so the card always opens on someone real.
  const active = roster.includes(selected) ? selected : (ranked[0]?.salesperson ?? roster[0] ?? null);

  const series = rows
    .filter((r) => r.salesperson === active)
    .slice()
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
    .map((r) => ({
      bucket: r.bucket,
      revenue: Number(r.total_revenue || 0),
      qty: Number(r.total_qty || 0),
      shipments: Number(r.shipment_count || 0),
    }));

  const totals = series.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, qty: acc.qty + r.qty, shipments: acc.shipments + r.shipments }),
    { revenue: 0, qty: 0, shipments: 0 }
  );

  const idx = ranked.findIndex((r) => r.salesperson === active);

  return {
    roster,
    active,
    series,
    totals,
    rank: idx >= 0 ? idx + 1 : null,
    outOf: ranked.length,
    rankRow: idx >= 0 ? ranked[idx] : null,
    // salespersonGoals is keyed on stock_app_users.id while trend/ranking group
    // by name, so name is the only key both sides share. A legacy
    // stock_sales_people-only person simply has no goal row.
    goalRow: (goals || []).find((g) => g.name === active) || null,
  };
}
