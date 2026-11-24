import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { istMonth, istToday, summarizeMonth, workingDaysInMonth } from '@/lib/attendance.mjs';
import { MONTH_RE, loadSettings } from '@/lib/attendance-db';
import { accountsError, accountsGuard, booksStarted, cancelSourceVoucher, createVoucher, ensureSystemLedger, loadBusiness, systemLedgers, withBooks } from '@/lib/accounts-db';
import { payrollLines, statutoryDeductions } from '@/lib/payroll-statutory.mjs';

/**
 * Monthly payroll, computed live from entries + leave + holidays + settings.
 * There is no payroll-run table:
 * ponytail: payroll is recomputed on every read; add a stock_payroll_runs
 * snapshot table when payslips must be locked against later edits.
 *
 * Salary is sensitive, so this needs canViewAllAttendance. A plain employee
 * gets their OWN figures from ?scope=self.
 */
/**
 * One month's payroll rows (everyone, or one person), with PF/ESI/TDS. Shared
 * by the payroll screen and posting the month to the books.
 */
async function buildPayroll(month, selfUserId = null) {
  const settings = await loadSettings();
  const monthStart = `${month}-01`;

  const userParams = selfUserId ? [selfUserId] : [];
  const users = await sql(
    `SELECT id, name, role, department, salary, has_login, pf_applicable, esi_applicable, uan, esi_ip_number, tds_monthly
       FROM stock_app_users
      WHERE status = 'active' AND tracks_attendance
        ${selfUserId ? 'AND id = $1' : ''}
      ORDER BY name`,
    userParams
  );

  // Three set-wide queries rather than three per employee — a 40-person
  // month is 120 round trips otherwise.
  const [entries, leaveRequests, holidays] = await Promise.all([
    sql(
      `SELECT user_id, work_date, clock_in_at, clock_out_at, break_seconds, is_active
         FROM stock_attendance_entries
        WHERE is_active
          AND work_date >= $1::date
          AND work_date < ($1::date + INTERVAL '1 month')`,
      [monthStart]
    ),
    sql(
      `SELECT user_id, from_date, to_date, leave_type, status
         FROM stock_leave_requests
        WHERE status = 'approved'
          AND from_date < ($1::date + INTERVAL '1 month')
          AND to_date >= $1::date`,
      [monthStart]
    ),
    sql(
      `SELECT holiday_date FROM stock_holidays
        WHERE holiday_date >= $1::date AND holiday_date < ($1::date + INTERVAL '1 month')`,
      [monthStart]
    ),
  ]);

  const entriesByUser = new Map();
  for (const row of entries) {
    const key = Number(row.user_id);
    if (!entriesByUser.has(key)) entriesByUser.set(key, []);
    entriesByUser.get(key).push(row);
  }
  const leaveByUser = new Map();
  for (const row of leaveRequests) {
    const key = Number(row.user_id);
    if (!leaveByUser.has(key)) leaveByUser.set(key, []);
    leaveByUser.get(key).push(row);
  }

  const today = istToday();
  const rows = users.map((user) => {
    const id = Number(user.id);
    const summary = summarizeMonth({
      month,
      salary: user.salary,
      settings,
      holidays,
      entries: entriesByUser.get(id) || [],
      leaveRequests: leaveByUser.get(id) || [],
      // A month in progress must not count the days still to come as absent.
      today,
    });

    // days[] is 30ish objects per person — useful for one person's month
    // calendar, wasteful for a 40-row payroll table. Only self scope keeps it.
    const { days, ...totals } = summary;
    return {
      userId: id,
      name: user.name,
      role: user.role,
      department: user.department,
      hasLogin: user.has_login !== false,
      salary: user.salary === null ? null : Number(user.salary),
      ...totals,
      ...(selfUserId ? { days } : {}),
      pfApplicable: user.pf_applicable,
      esiApplicable: user.esi_applicable,
      uan: user.uan,
      esiIpNumber: user.esi_ip_number,
      tdsMonthly: Number(user.tds_monthly),
      statutory: statutoryDeductions({
        salary: user.salary,
        earnedBase: totals.earnedBase,
        overtimePay: totals.overtimePay,
        pfApplicable: user.pf_applicable,
        esiApplicable: user.esi_applicable,
        tdsMonthly: user.tds_monthly,
      }),
    };
  });

  return { settings, holidays, rows };
}

export const GET = stockRoute(async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  const flags = getRoleFlags(appUser.role);
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || istMonth();
  const selfOnly = searchParams.get('scope') === 'self' || !flags.canViewAllAttendance;

  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid month, expected YYYY-MM' }, { status: 400 });
  }

  try {
    const { settings, holidays, rows } = await buildPayroll(month, selfOnly ? appUser.id : null);

    return NextResponse.json({
      month,
      settings,
      workingDays: workingDaysInMonth(month, holidays, settings),
      rows,
      totals: {
        headcount: rows.length,
        netPay: Math.round(rows.reduce((sum, r) => sum + r.netPay, 0) * 100) / 100,
        overtimePay: Math.round(rows.reduce((sum, r) => sum + r.overtimePay, 0) * 100) / 100,
        netPayable: Math.round(rows.reduce((sum, r) => sum + r.statutory.netPayable, 0) * 100) / 100,
      },
      // Salary is missing for anyone never given one; the UI flags them rather
      // than silently paying zero.
      missingSalary: rows.filter((r) => !r.salary).map((r) => r.name),
      scope: selfOnly ? 'self' : 'all',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to build payroll', detail: error.message }, { status: 500 });
  }
});

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * PATCH { userId, pfApplicable, esiApplicable, uan, esiIpNumber, tdsMonthly }
 * — a staff member's PF/ESI/TDS details. Approvers only (salary is theirs to set).
 */
export const PATCH = stockRoute(async function PATCH(request) {
  const { appUser } = await getStockContext(request);
  if (!appUser || !getRoleFlags(appUser.role).canApprove) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const uan = String(body.uan || '').replace(/\s/g, '') || null;
    const ip = String(body.esiIpNumber || '').replace(/\s/g, '') || null;
    if (uan && !/^\d{12}$/.test(uan)) throw bad('UAN is 12 digits.');
    if (ip && !/^\d{10}$/.test(ip)) throw bad('ESI IP number is 10 digits.');
    const tds = Number(body.tdsMonthly || 0);
    if (!(tds >= 0)) throw bad('Monthly TDS cannot be negative.');
    const [row] = await sql(
      `UPDATE stock_app_users SET pf_applicable = $1, esi_applicable = $2, uan = $3, esi_ip_number = $4, tds_monthly = $5, updated_at = NOW()
       WHERE id = $6 RETURNING id, name`,
      [body.pfApplicable === true, body.esiApplicable === true, uan, ip, tds, Number(body.userId) || 0]
    );
    if (!row) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    return NextResponse.json({ user: row });
  } catch (error) {
    return accountsError(error, 'Failed to save statutory details');
  }
});

/**
 * POST { month, businessId } — post the month's payroll to the books: Dr
 * Salaries and Employer PF & ESI; Cr PF, ESI and salary TDS payable, and
 * Salaries Payable. Posting the month again replaces its entry (payroll is
 * recomputed live), so a late attendance fix can be carried in.
 */
export const POST = stockRoute(async function POST(request) {
  const gate = await accountsGuard(request, { write: true });
  if (gate.error) return gate.error;
  try {
    const body = await request.json().catch(() => ({}));
    const month = String(body.month || '');
    if (!MONTH_RE.test(month)) throw bad('Pick a month.');
    const business = await loadBusiness(body.businessId);
    // The month's last day: day 0 of the next month.
    const [year, monthNo] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10);
    if (!booksStarted(business.books_start_date, date)) throw bad('The books have not started by the end of that month.');
    const { rows } = await buildPayroll(month);
    const sourceId = Number(business.id) * 1000000 + Number(month.replace('-', ''));
    const voucher = await withBooks(gate.appUser, async (tx) => {
      const ledgers = {
        ...(await systemLedgers(tx, business.id)),
        tds_192: await ensureSystemLedger(tx, business.id, 'tds_192', 'TDS Payable 192', 'Duties & Taxes'),
      };
      const lines = payrollLines(rows.map((row) => row.statutory), ledgers);
      await cancelSourceVoucher(tx, 'payroll_month', sourceId, gate.appUser.id);
      if (!lines.length) return null;
      return createVoucher(tx, {
        businessId: business.id,
        type: 'payroll',
        date,
        reference: `Payroll ${month}`,
        narration: `Payroll for ${month}: ${rows.length} staff`,
        lines,
        sourceTable: 'payroll_month',
        sourceId,
        createdBy: gate.appUser.id,
      });
    });
    return NextResponse.json({ voucher, staff: rows.length }, { status: 201 });
  } catch (error) {
    return accountsError(error, 'Failed to post payroll');
  }
});
