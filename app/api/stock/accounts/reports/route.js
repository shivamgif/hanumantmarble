import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { accountsError, accountsGuard, loadBusiness } from '@/lib/accounts-db';
import { addDays } from '@/lib/accounts.mjs';
import { balanceSheet, profitAndLoss, trialBalance } from '@/lib/financials.mjs';
import { loadLedgerBalances, loadStockValuation } from '@/lib/reports-db';
import { stockRoute } from '@/lib/stock-workflow';
import { tdsDueDate, tdsQuarter, tdsRate } from '@/lib/tds.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * GET ?businessId&kind=trial|pl|bs|stock|tds&from&to
 *   trial  trial balance at `to`
 *   pl     profit & loss for [from, to]
 *   bs     balance sheet at `to`
 *   stock  stock summary (weighted average) at `to`
 *   tds    TDS deducted in [from, to]: by deductee (26Q) and by month (challan)
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
    if (['pl', 'tds'].includes(kind) && (!ISO_DATE.test(from) || from > to)) throw bad('Pick a from date on or before the to date.');

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

    if (kind === 'tds') {
      const [deductions, salary] = await Promise.all([
        sql(
          `SELECT v.voucher_date::text AS date, v.voucher_number, v.voucher_type, v.tds_section AS section, v.tds_base AS base,
                  v.tds_amount AS tds, l.name AS party, l.pan
           FROM acc_vouchers v JOIN acc_ledgers l ON l.id = v.party_ledger_id
           -- Bills under a threshold carry a section (they count toward it) but no tax: not in 26Q.
           WHERE v.business_id = $1 AND v.status = 'posted' AND v.tds_section IS NOT NULL AND v.tds_amount > 0
             AND v.voucher_date BETWEEN $2::date AND $3::date
           ORDER BY v.voucher_date, v.id`,
          [business.id, from, to]
        ),
        // Salary TDS (192) is per employee in payroll; the books hold the month's total.
        sql(
          `SELECT to_char(v.voucher_date, 'YYYY-MM') AS month, -SUM(vl.amount) AS tds
           FROM acc_voucher_lines vl JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
           JOIN acc_ledgers l ON l.id = vl.ledger_id AND l.system_key = 'tds_192'
           WHERE v.business_id = $1 AND v.voucher_date BETWEEN $2::date AND $3::date
           GROUP BY 1`,
          [business.id, from, to]
        ),
      ]);
      const rows = deductions.map((d) => ({
        ...d, base: Number(d.base), tds: Number(d.tds), rate: tdsRate(d.section, d.pan), quarter: `Q${tdsQuarter(d.date)}`,
      }));
      const byMonth = new Map();
      const addMonth = (month, section, tds) => {
        const key = `${month}|${section}`;
        if (!byMonth.has(key)) byMonth.set(key, { month, section, tds: 0, due: tdsDueDate(month) });
        byMonth.get(key).tds = Math.round((byMonth.get(key).tds + tds) * 100) / 100;
      };
      for (const row of rows) if (row.tds) addMonth(row.date.slice(0, 7), row.section, row.tds);
      for (const row of salary) if (Number(row.tds)) addMonth(row.month, '192', Number(row.tds));
      return NextResponse.json({ ...meta, tds: { rows, challans: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month) || a.section.localeCompare(b.section)) } });
    }

    throw bad('Unknown report.');
  } catch (error) {
    return accountsError(error, 'Failed to build the report');
  }
});
