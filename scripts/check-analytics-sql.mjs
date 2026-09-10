// Asserts the shared analytics SQL fragments. Run: node scripts/check-analytics-sql.mjs
//
// These fragments decide every revenue number on the analytics pages, and the
// bugs they fix were all invisible in the rendered output: stone sales silently
// summing to zero, drafts booking revenue, broken pieces billed at the box
// rate. Each one gets an assertion so it cannot come back quietly.
import assert from 'node:assert/strict';
import {
  availableQtyExpr,
  monthProgress,
  netRevenueExpr,
  netUnitsExpr,
  ownershipFilter,
  shippedFilter,
  unitCostCte,
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

console.log('check-analytics-sql: all assertions passed');
