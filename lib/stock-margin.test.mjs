// Run: node lib/stock-margin.test.mjs
//
// Guards the one rule that makes a per-salesperson or per-customer margin
// honest: revenue from items with no priced receipt cannot be costed, so it
// leaves BOTH sides of the margin fraction. Counting it as pure profit was the
// easy mistake here - it would have shown the worst-costed salesperson as the
// best performer.
import assert from 'node:assert/strict';
import { marginColumns, marginAggregates } from './stock-analytics-sql.mjs';

// Mirrors the SQL in marginColumns().
const margin = (revenue, uncosted, cost) => {
  const costed = revenue - uncosted;
  return costed > 0 ? Number((((costed - cost) / costed) * 100).toFixed(1)) : null;
};

// Plain case: everything costed.
assert.equal(margin(1000, 0, 800), 20);

// Half the revenue has no purchase cost on record. The costed half ran at 20%,
// and that is the answer - not 60%, which is what counting uncosted revenue as
// profit would report.
assert.equal(margin(1000, 500, 400), 20);

// Nothing costable sold: no denominator, so no answer. A zero here would sort
// an unknown below a genuine loss on a leaderboard.
assert.equal(margin(1000, 1000, 0), null);
assert.equal(margin(0, 0, 0), null);

// Selling under cost stays negative rather than clamping at zero.
assert.equal(margin(1000, 0, 1200), -20);

// The SQL must subtract uncosted revenue from the denominator, not just the
// numerator. Catches a refactor that "simplifies" the fraction back to revenue.
const sql = marginColumns();
assert.match(sql, /\(revenue - uncosted_revenue\) > 0/);
assert.match(sql, /\/ \(revenue - uncosted_revenue\)/);

// A costed line and an uncosted line must land in different buckets, which is
// what the FILTER clauses do.
const aggregates = marginAggregates({ hasStoneSqft: true });
assert.match(aggregates, /FILTER \(WHERE uc\.cost_per_unit IS NULL\)/);
assert.match(aggregates, /FILTER \(WHERE uc\.cost_per_unit IS NOT NULL\)/);

// --- Price dispersion uplift -------------------------------------------------
//
// Same file because it is the same kind of rule: a money figure the analytics
// page states as fact, whose meaning dies quietly if someone simplifies the
// arithmetic. Mirrors the uplift SUM in the price dispersion query.
const uplift = (lines) => {
  const rates = lines.map((l) => l.rate).sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
  return lines.reduce((sum, l) => sum + (l.rate < median ? l.units * (median - l.rate) : 0), 0);
};

// Three sales at 100, 100 and 80. Median is 100, so only the 80 line lifts,
// and it lifts by its own unit count - 10 units x 20 rupees.
assert.equal(uplift([{ rate: 100, units: 5 }, { rate: 100, units: 1 }, { rate: 80, units: 10 }]), 200);

// Above-median sales contribute nothing. Netting them off would understate the
// leak, because nobody hands back a good price to fund a bad one.
assert.equal(uplift([{ rate: 200, units: 100 }, { rate: 100, units: 1 }, { rate: 80, units: 1 }]), 20);

// One rate for every sale is a disciplined item, not an opportunity.
assert.equal(uplift([{ rate: 100, units: 3 }, { rate: 100, units: 7 }]), 0);

// Uplift is weighted by units, so a bad rate on a big load outranks a worse
// rate on a single box. This is why the table sorts on uplift, not on spread.
assert.equal(uplift([{ rate: 100, units: 1 }, { rate: 100, units: 1 }, { rate: 90, units: 50 }]), 500);

// --- Repeated freight --------------------------------------------------------
//
// Mirrors the repeated_amount CASE in the freight trip query. The rule is a
// claim about someone's books, so it has to stay conservative: only a trip
// whose shipments all carry the SAME freight figure is called a repeat.
const repeated = (freights) => {
  if (freights.length < 2) return null;
  const distinct = new Set(freights);
  if (distinct.size !== 1) return null;
  return freights.reduce((a, b) => a + b, 0) - Math.max(...freights);
};

// One lorry entered as four shipments, the same charge keyed each time. Three
// of the four are the double entry.
assert.equal(repeated([50000, 50000, 50000, 50000]), 150000);

// Amounts differ, so this could be two real charges against one plate on one
// day. Nothing is claimed rather than guessing which figure is the true one.
assert.equal(repeated([50000, 42000]), null);

// A load that arrived whole has nothing to compare against.
assert.equal(repeated([50000]), null);

console.log('stock-margin: ok');
