// Run: node lib/financials.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { balanceSheet, primaryGroup, profitAndLoss, trialBalance } from './financials.mjs';

assert.equal(primaryGroup('Sundry Debtors'), 'Current Assets');
assert.equal(primaryGroup('Bank OD A/c'), 'Loans (Liability)');

// A year: opening from Tally (capital 50,000 = cash 20,000 + opening stock 30,000), then
// sales 1,00,000 + GST 18,000 on credit, purchases 60,000 + ITC 10,800 on credit,
// rent 5,000 paid, customer paid 1,18,000 in. Closing stock 40,000.
const L = (name, group_name, balance) => ({ name, group_name, balance });
const closing = [
  L('Capital', 'Capital Account', -50000),
  L('Cash', 'Cash-in-Hand', 20000 - 5000 + 118000),
  L('Opening Stock', 'Stock-in-Hand', 30000),
  L('Builder', 'Sundry Debtors', 0),
  L('Stone Co', 'Sundry Creditors', -70800),
  L('Sales', 'Sales Accounts', -100000),
  L('Output CGST', 'Duties & Taxes', -9000),
  L('Output SGST', 'Duties & Taxes', -9000),
  L('Purchases', 'Purchase Accounts', 60000),
  L('Input CGST', 'Duties & Taxes', 5400),
  L('Input SGST', 'Duties & Taxes', 5400),
  L('Rent', 'Indirect Expenses', 5000),
];

const tb = trialBalance(closing);
assert.equal(tb.difference, 0);
assert.equal(tb.debit, 133000 + 30000 + 60000 + 10800 + 5000);
assert.ok(!tb.rows.some((r) => r.name === 'Builder')); // zero balance dropped

// P&L for the year: the opening stock is the Tally figure, closing from the valuation.
const pl = profitAndLoss({ ledgers: closing, openingStock: 30000, closingStock: 40000 });
assert.equal(pl.grossProfit, 100000 + 40000 - 30000 - 60000); // 50,000
assert.equal(pl.netProfit, 50000 - 5000);
assert.deepEqual(pl.trading.sales, [{ group: 'Sales Accounts', total: 100000, ledgers: [{ name: 'Sales', amount: 100000 }] }]);

// Balance sheet: stock-in-hand ledger replaced by closing stock; profit carried; it balances.
const bs = balanceSheet({ ledgers: closing, closingStock: 40000 });
assert.equal(bs.profit, 45000);
assert.equal(bs.difference, 0);
assert.equal(bs.totalAssets, 133000 + 40000);
assert.ok(bs.assets.some((g) => g.group === 'Closing Stock' && g.total === 40000));
assert.ok(!bs.assets.some((g) => g.group === 'Stock-in-Hand'));
// Net GST payable sits as a liability (output 18,000 less input 10,800).
assert.equal(bs.liabilities.find((g) => g.group === 'Duties & Taxes').total, 7200);

// A books problem shows as a difference instead of being hidden.
assert.notEqual(balanceSheet({ ledgers: [...closing, L('Stray', 'Cash-in-Hand', 100)], closingStock: 40000 }).difference, 0);

console.log('financials: all checks passed');
