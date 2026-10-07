import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { istToday } from '@/lib/attendance.mjs';
import { fiscalYearOf } from '@/lib/gst-invoice.mjs';
import { accountsError, accountsGuard, loadStatement } from '@/lib/accounts-db';

/** Ledger statement (also the cash book and bank book): opening, lines, running balance. */
export async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const [ledger] = await sql(
      `SELECT l.*, b.legal_name AS business_name, b.gstin AS business_gstin
       FROM acc_ledgers l JOIN stock_businesses b ON b.id = l.business_id WHERE l.id = $1`,
      [Number(searchParams.get('ledgerId')) || 0]
    );
    if (!ledger) return NextResponse.json({ error: 'Ledger not found' }, { status: 404 });

    // Default range: the current financial year to date.
    const to = searchParams.get('to') || istToday();
    const fyStart = `20${fiscalYearOf(to).slice(0, 2)}-04-01`;
    const from = searchParams.get('from') || fyStart;

    const { opening, lines } = await loadStatement({ ledgerId: ledger.id, from, to });
    let running = opening;
    const rows = lines.map((line) => {
      running = Math.round((running + Number(line.amount)) * 100) / 100;
      return { ...line, amount: Number(line.amount), balance: running };
    });
    return NextResponse.json({ ledger, from, to, opening, closing: running, lines: rows });
  } catch (error) {
    return accountsError(error, 'Failed to load statement');
  }
}
