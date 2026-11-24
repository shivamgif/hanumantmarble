import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { accountsError, accountsGuard, loadBusiness } from '@/lib/accounts-db';
import { addDays } from '@/lib/accounts.mjs';
import { balanceSheet, profitAndLoss, trialBalance } from '@/lib/financials.mjs';
import { loadLedgerBalances, loadStockValuation } from '@/lib/reports-db';
import { stockRoute } from '@/lib/stock-workflow';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * GET ?businessId&kind=trial|pl|bs|stock&from&to
 *   trial  trial balance at `to`
 *   pl     profit & loss for [from, to]
 *   bs     balance sheet at `to`
 *   stock  stock summary (weighted average) at `to`
 */
export const GET = stockRoute(async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    const kind = searchParams.get('kind');
    const to = searchParams.get('to') || '';
    const from = searchParams.get('from') || '';
    if (!ISO_DATE.test(to)) throw bad('Pick the date.');
    if (kind === 'pl' && (!ISO_DATE.test(from) || from > to)) throw bad('Pick a from date on or before the to date.');

    const [{ businesses }] = await sql('SELECT COUNT(*)::int AS businesses FROM stock_businesses');
    const meta = { business: { id: business.id, legalName: business.legal_name, booksStartDate: business.books_start_date }, stockIsCompanyWide: businesses > 1 };

    if (kind === 'stock') return NextResponse.json({ ...meta, stock: await loadStockValuation(to) });
    if (kind === 'trial') return NextResponse.json({ ...meta, trial: trialBalance(await loadLedgerBalances(business.id, to)) });

    if (kind === 'bs') {
      const [ledgers, stock] = await Promise.all([loadLedgerBalances(business.id, to), loadStockValuation(to)]);
      return NextResponse.json({ ...meta, bs: balanceSheet({ ledgers, closingStock: stock.total }), stockUncosted: stock.uncosted });
    }

    if (kind === 'pl') {
      const [ledgers, closing] = await Promise.all([loadLedgerBalances(business.id, to, from), loadStockValuation(to)]);
      // Opening stock: Tally's figure (the Stock-in-Hand ledgers) while the
      // period starts at or before the books do; our valuation after that.
      const startsAtBooks = !business.books_start_date || from <= business.books_start_date;
      const openingStock = startsAtBooks
        ? ledgers.filter((l) => l.group_name === 'Stock-in-Hand').reduce((acc, l) => acc + l.before + l.movement, 0)
        : (await loadStockValuation(addDays(from, -1))).total;
      const pl = profitAndLoss({
        // The opening voucher is dated the day before the books start; it is balances, not trade.
        ledgers: ledgers.map((l) => ({ ...l, balance: l.movement })),
        openingStock,
        closingStock: closing.total,
      });
      return NextResponse.json({ ...meta, pl, stockUncosted: closing.uncosted });
    }

    throw bad('Unknown report.');
  } catch (error) {
    return accountsError(error, 'Failed to build the report');
  }
});
