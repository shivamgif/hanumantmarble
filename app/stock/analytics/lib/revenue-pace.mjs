// This month's revenue against last month's, from the monthlyProfit rows the
// analytics route already returns (oldest first, last row = the range's final
// month). A month in progress is compared at its pace — so far ÷ fraction of
// the month elapsed — because ten days against a whole month always reads as
// a collapse. elapsedFraction is 1 for a finished month.
export function revenuePace(rows = [], elapsedFraction = 1) {
  const last = rows[rows.length - 1];
  if (!last) return null;
  const prev = rows[rows.length - 2];

  const revenue = Number(last.revenue || 0);
  const profit = Number(last.profit || 0);
  // Margin is over revenue that could be costed, same rule as MonthlyProfitChart.
  const costed = Number(last.costed_revenue ?? last.revenue ?? 0);
  const previous = prev ? Number(prev.revenue || 0) : null;
  const fraction = elapsedFraction > 0 ? Math.min(1, elapsedFraction) : 1;

  return {
    revenue,
    profit,
    marginPct: costed > 0 ? (profit / costed) * 100 : null,
    previous,
    changePct: previous > 0 ? ((revenue / fraction - previous) / previous) * 100 : null,
  };
}
