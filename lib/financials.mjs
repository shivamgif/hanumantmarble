// Trial balance, profit & loss and balance sheet from ledger balances, laid
// out the way Tally lays them out. Pure — no db/session imports — so
// lib/financials.test.mjs pins the arithmetic.
//
// Signs as in the books: debit +, credit −. Stock is not a voucher in Tally
// and not here either: opening and closing stock come from the valuation
// (lib/inventory-valuation.mjs), and Stock-in-Hand ledgers (the opening stock
// imported from Tally) are replaced by closing stock on the balance sheet.
import { GROUPS } from './accounts.mjs';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** A group's primary (top-level) group, whose nature decides where it reports. */
export function primaryGroup(name) {
  let group = name;
  while (GROUPS[group]?.parent) group = GROUPS[group].parent;
  return group;
}
const natureOf = (group) => GROUPS[primaryGroup(group)]?.nature || GROUPS[group]?.nature || 'liability';
const STOCK_GROUP = 'Stock-in-Hand';

/** Ledgers [{ name, group_name, balance }] → rows grouped by group, sorted, zero balances dropped. */
function byGroup(ledgers, sign = 1) {
  const groups = new Map();
  for (const ledger of ledgers) {
    const amount = r2(sign * Number(ledger.balance));
    if (!amount) continue;
    if (!groups.has(ledger.group_name)) groups.set(ledger.group_name, { group: ledger.group_name, total: 0, ledgers: [] });
    const group = groups.get(ledger.group_name);
    group.ledgers.push({ name: ledger.name, amount });
    group.total = r2(group.total + amount);
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group)).map((g) => ({ ...g, ledgers: g.ledgers.sort((a, b) => a.name.localeCompare(b.name)) }));
}
const sum = (groups) => r2(groups.reduce((acc, g) => acc + g.total, 0));

/** Closing balances at a date → debit and credit columns that must agree. */
export function trialBalance(ledgers) {
  const rows = ledgers
    .map((l) => ({ name: l.name, group: l.group_name, primary: primaryGroup(l.group_name), balance: r2(l.balance) }))
    .filter((l) => l.balance)
    .sort((a, b) => a.primary.localeCompare(b.primary) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const debit = r2(rows.filter((l) => l.balance > 0).reduce((acc, l) => acc + l.balance, 0));
  const credit = r2(rows.filter((l) => l.balance < 0).reduce((acc, l) => acc - l.balance, 0));
  return { rows, debit, credit, difference: r2(debit - credit) };
}

/**
 * ledgers: each ledger's movement in the period (debit +). Trading account
 * first (sales, purchases, direct items, stock), then the P&L proper.
 */
export function profitAndLoss({ ledgers, openingStock = 0, closingStock = 0 }) {
  const pick = (group) => ledgers.filter((l) => primaryGroup(l.group_name) === group);
  const sales = byGroup(pick('Sales Accounts'), -1);
  const directIncome = byGroup(pick('Direct Incomes'), -1);
  const purchases = byGroup(pick('Purchase Accounts'));
  const directExpenses = byGroup(pick('Direct Expenses'));
  const indirectIncome = byGroup(pick('Indirect Incomes'), -1);
  const indirectExpenses = byGroup(pick('Indirect Expenses'));
  const grossProfit = r2(sum(sales) + sum(directIncome) + Number(closingStock) - Number(openingStock) - sum(purchases) - sum(directExpenses));
  const netProfit = r2(grossProfit + sum(indirectIncome) - sum(indirectExpenses));
  return {
    trading: { openingStock: r2(openingStock), purchases, directExpenses, sales, directIncome, closingStock: r2(closingStock) },
    grossProfit,
    indirectIncome,
    indirectExpenses,
    netProfit,
  };
}

/**
 * ledgers: closing balances at the date. Profit & loss so far is everything
 * the P&L ledgers hold, plus the change in stock since the opening stock
 * entered the books — so the sheet balances by construction, and any
 * difference left shows a books problem, not a rounding one.
 */
export function balanceSheet({ ledgers, closingStock = 0 }) {
  const isPl = (l) => Boolean(GROUPS[primaryGroup(l.group_name)]?.pl);
  const stockLedgers = ledgers.filter((l) => l.group_name === STOCK_GROUP);
  const openingStockInBooks = r2(stockLedgers.reduce((acc, l) => acc + Number(l.balance), 0));
  const plBalance = r2(ledgers.filter(isPl).reduce((acc, l) => acc + Number(l.balance), 0));
  const profit = r2(-plBalance + Number(closingStock) - openingStockInBooks);

  const rest = ledgers.filter((l) => !isPl(l) && l.group_name !== STOCK_GROUP);
  const assetGroups = byGroup(rest.filter((l) => natureOf(l.group_name) === 'asset'));
  // A debtor in credit or a bank in overdraft stays in its group, as Tally shows it.
  const liabilityGroups = byGroup(rest.filter((l) => natureOf(l.group_name) === 'liability'), -1);
  if (Number(closingStock)) assetGroups.push({ group: 'Closing Stock', total: r2(closingStock), ledgers: [] });

  const assets = r2(sum(assetGroups));
  const liabilities = r2(sum(liabilityGroups) + profit);
  return { assets: assetGroups, liabilities: liabilityGroups, profit, totalAssets: assets, totalLiabilities: liabilities, difference: r2(assets - liabilities) };
}
