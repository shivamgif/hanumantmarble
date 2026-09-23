// Asserts the shared analytics SQL fragments. Run: node scripts/check-analytics-sql.mjs
//
// These fragments decide every revenue number on the analytics pages, and the
// bugs they fix were all invisible in the rendered output: stone sales silently
// summing to zero, drafts booking revenue, broken pieces billed at the box
// rate. Each one gets an assertion so it cannot come back quietly.
import assert from 'node:assert/strict';
import {
  availableQtyExpr,
  freightRepeatFlagExpr,
  freightRepeatedAmountExpr,
  monthProgress,
  netRevenueExpr,
  netUnitsExpr,
  ownershipFilter,
  sellerFilter,
  shippedFilter,
  unitCostCte,
  idleSinceExpr,
  idleStockWhere,
  IDLE_STOCK_DAYS,
} from '../lib/stock-analytics-sql.mjs';

const modern = { hasStoneSqft: true, hasOutboundSalespersonUserId: true };
const legacy = { hasStoneSqft: false, hasOutboundSalespersonUserId: false };

// --- billable quantity -------------------------------------------------------
const units = netUnitsExpr(modern);
// Stone keeps its quantity in qty_sqft and leaves loaded_whole_qty at 0, so a
// formula that never reads the sqft columns reports every stone sale as zero.
assert.match(units, /qty_sqft/, 'stone quantity must come from qty_sqft');
assert.match(units, /returned_qty_sqft/, 'stone returns must be deducted');
assert.match(units, /unit_of_measure = 'sqft'/, 'stone must be selected on unit_of_measure');
// Broken pieces are stock movements, not billable units. The invoice never
// charges them, so revenue must not either.
assert.doesNotMatch(units, /loaded_broken_qty/, 'broken pieces are not billable');

// A database that predates the stone migration has no sqft columns to read, so
// the expression must degrade rather than reference them.
const legacyUnits = netUnitsExpr(legacy);
assert.doesNotMatch(legacyUnits, /sqft/, 'legacy schema must not reference stone columns');
assert.match(legacyUnits, /loaded_whole_qty/);

// Returns can exceed what went out on a line; the deduction must not go
// negative and start adding revenue back.
assert.match(legacyUnits, /GREATEST\(/, 'net units must be floored at zero');

// --- revenue -----------------------------------------------------------------
const revenue = netRevenueExpr(modern);
assert.match(revenue, /rate_per_unit/, 'revenue is quantity times the line rate');
assert.ok(revenue.includes(netUnitsExpr(modern)), 'revenue must reuse the billable-units rule');

// Alias overrides matter: the salesperson route names its item table `soi`.
const aliased = netRevenueExpr(modern, 'soi', 'itm');
assert.match(aliased, /soi\.rate_per_unit/);
assert.match(aliased, /itm\.unit_of_measure/);
assert.doesNotMatch(aliased, /\bosi\./, 'no default alias may leak through');

// --- excluded shipments ------------------------------------------------------
const shipped = shippedFilter('s');
// dispatch_date is NOT NULL DEFAULT NOW(), so an untouched draft lands in the
// current month and would book revenue for a sale that never happened.
assert.match(shipped, /'draft'/, 'drafts are not sales');
assert.match(shipped, /'cancelled'/, 'cancelled shipments are not sales');
assert.match(shipped, /approval_status <> 'rejected'/, 'rejected shipments are not sales');
assert.match(shippedFilter('o'), /^\(o\.status/, 'alias must be applied');
// Parenthesised, so dropping it into a WHERE clause after an OR cannot silently
// widen what the filter matches.
assert.ok(shipped.startsWith('(') && shipped.endsWith(')'), 'filter must be self-contained');

// --- on-hand quantity --------------------------------------------------------
const onHand = availableQtyExpr(modern);
assert.match(onHand, /current_sqft/, 'stone stock lives in current_sqft');
assert.match(onHand, /current_whole_qty/);
assert.doesNotMatch(availableQtyExpr(legacy), /current_sqft/);

// --- purchase cost -----------------------------------------------------------
const costCte = unitCostCte(modern);
assert.match(costCte, /^unit_cost AS \(/, 'CTE must be named for inlining after WITH');
// Cost per unit must be divided by the same unit it will be multiplied back by,
// or stone costs land on square feet and tile costs on boxes.
assert.match(costCte, /received_qty_sqft/, 'stone cost is per square foot');
assert.match(costCte, /approval_status = 'approved'/, 'only received stock has a real cost');
assert.match(costCte, /NULLIF\(SUM\(/, 'must not divide by zero received units');
assert.match(unitCostCte(modern, 'c2'), /^c2 AS \(/, 'CTE name must be overridable');

// --- ownership ---------------------------------------------------------------
// The admin goal tracker and a salesperson's own page must agree on who owns a
// dispatch, or the same person sees two different numbers on two pages.
const owned = ownershipFilter(modern, 's', '$1');
assert.match(owned, /salesperson_user_id = \$1/);
assert.match(owned, /submitted_by_user_id = \$1/, 'unassigned dispatches fall back to the filer');
assert.doesNotMatch(ownershipFilter(legacy, 's', '$1'), /salesperson_user_id/);

// --- who may be attributed a sale -------------------------------------------
// The dropdown, the dispatch validator and the goal tracker share this set. If
// they drift, a name offered in the dropdown 400s on submit, or someone sells
// and never appears on the leaderboard.
const sellers = sellerFilter({ hasUserCanSell: true });
assert.match(sellers, /role = 'salesperson'/, 'the sales team always sells');
assert.match(sellers, /can_sell = TRUE/, 'an explicitly flagged admin also sells');
assert.match(sellers, /OR/, 'the flag widens the set, never narrows it');
assert.match(sellerFilter({ hasUserCanSell: true }, 'x'), /x\.can_sell/, 'alias must be overridable');
// A database that predates the can_sell migration has no column to read, so the
// filter must degrade to today's behaviour rather than reference it.
assert.doesNotMatch(sellerFilter({ hasUserCanSell: false }), /can_sell/, 'legacy schema must not reference can_sell');
assert.match(sellerFilter({ hasUserCanSell: false }), /role = 'salesperson'/);

// --- partial month -----------------------------------------------------------
// Mid-month: the range's last bucket holds part of a month.
const midMonth = monthProgress(new Date(Date.UTC(2026, 8, 10)), new Date(Date.UTC(2026, 8, 10)));
assert.equal(midMonth.partialLastMonth, true);
assert.equal(Number(midMonth.elapsedFraction.toFixed(4)), Number((10 / 30).toFixed(4)), 'September has 30 days');

// A range that ends in a past month is complete, so nothing is prorated.
const pastMonth = monthProgress(new Date(Date.UTC(2026, 6, 31)), new Date(Date.UTC(2026, 8, 10)));
assert.equal(pastMonth.partialLastMonth, false);
assert.equal(pastMonth.elapsedFraction, 1);

// Last day of the month is still "current", but nothing is left to prorate.
const monthEnd = monthProgress(new Date(Date.UTC(2026, 8, 30)), new Date(Date.UTC(2026, 8, 30)));
assert.equal(monthEnd.partialLastMonth, true);
assert.equal(monthEnd.elapsedFraction, 1);

// February in a leap year, to catch a hardcoded 30 or 31.
const leapFeb = monthProgress(new Date(Date.UTC(2028, 1, 14)), new Date(Date.UTC(2028, 1, 14)));
assert.equal(Number(leapFeb.elapsedFraction.toFixed(6)), Number((14 / 29).toFixed(6)), '2028 February has 29 days');

// --- dead stock ---------------------------------------------------------------
// Idle time runs from the last real sale, or from first arrival when an item has
// never sold. "No dispatch in 60 days" alone put last week's delivery on a
// salesperson's "sell these first" list.
const since = idleSinceExpr(modern);
assert.match(since, /MAX\(idle_s\.dispatch_date\)/, 'idle time starts at the last dispatch');
assert.match(since, /MIN\(idle_in\.arrival_date\)/, 'never-sold stock is idle from its first arrival, not forever');
assert.match(since, /approval_status = 'approved'/, 'only approved receipts count as arrival');
assert.match(since, /status NOT IN \('draft', 'cancelled'\)/, 'a draft or cancelled dispatch is not a sale');
const idle = idleStockWhere(modern);
assert.match(idle, new RegExp(`INTERVAL '${IDLE_STOCK_DAYS} days'`));
assert.match(idle, /> 0/, 'out-of-stock items are not dead stock');
assert.match(idle, /is_active = TRUE/);

// --- repeated freight ---------------------------------------------------------
// The old rule asked whether the whole truck-day carried one figure
// (COUNT(DISTINCT freight) = 1), so one odd invoice on the lorry silenced the
// row: Rs 38,665 keyed five times next to a Rs 14,275 reported nothing.
// Comparing the two counts is what catches a repeat inside a mixed group.
const repeatFlag = freightRepeatFlagExpr();
assert.match(repeatFlag, /COUNT\(\*\) > COUNT\(DISTINCT freight\)/, 'a repeat is more trips than distinct figures');
assert.doesNotMatch(repeatFlag, /COUNT\(DISTINCT freight\) = 1/, 'a mixed truck-day must not silence its repeats');
assert.match(repeatFlag, /MAX\(freight\) > 0/, 'trips that were never charged are not a repeat');

// Everything booked less one of each distinct figure, so a figure keyed three
// times gives back two of it. MAX() would only ever give back one.
const repeatAmount = freightRepeatedAmountExpr();
assert.match(repeatAmount, /SUM\(DISTINCT freight\)/, 'one of each distinct charge is what the day should cost');
assert.doesNotMatch(repeatAmount, /MAX\(freight\)/, 'three copies of a charge lose two of it, not one');
assert.match(repeatAmount, /^NULLIF\(/, 'no repeat must be NULL, so the row sorts last and reads as "not flagged"');

// Both go into a GROUP BY, so they must aggregate rather than name a column.
assert.match(freightRepeatFlagExpr('f'), /COUNT\(DISTINCT f\)/, 'the freight column is injectable');

console.log('check-analytics-sql: all assertions passed');
