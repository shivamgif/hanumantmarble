import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { summarizeMonth, workingDaysInMonth } from '@/lib/attendance.mjs';
import { MONTH_RE, loadSettings } from '@/lib/attendance-db';

/**
 * Monthly payroll, computed live from entries + leave + holidays + settings.
 * There is no payroll-run table:
 * ponytail: payroll is recomputed on every read; add a stock_payroll_runs
 * snapshot table when payslips must be locked against later edits.
 *
 * Salary is sensitive, so this needs canViewAllAttendance. A plain employee
 * gets their OWN figures from ?scope=self.
 */
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  const flags = getRoleFlags(appUser.role);
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const selfOnly = searchParams.get('scope') === 'self' || !flags.canViewAllAttendance;

  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid month, expected YYYY-MM' }, { status: 400 });
  }

  try {
    const settings = await loadSettings();
    const monthStart = `${month}-01`;

    const userParams = selfOnly ? [appUser.id] : [];
    const users = await sql(
      `SELECT id, name, role, department, salary, has_login
         FROM stock_app_users
        WHERE status = 'active' AND tracks_attendance
          ${selfOnly ? 'AND id = $1' : ''}
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

    const rows = users.map((user) => {
      const id = Number(user.id);
      const summary = summarizeMonth({
        month,
        salary: user.salary,
        settings,
        holidays,
        entries: entriesByUser.get(id) || [],
        leaveRequests: leaveByUser.get(id) || [],
      });

      // days[] is 30ish objects per person — useful for one timesheet, wasteful
      // for a 40-row payroll table. The client asks /attendance for detail.
      const { days, ...totals } = summary;
      return {
        userId: id,
        name: user.name,
        role: user.role,
        department: user.department,
        hasLogin: user.has_login !== false,
        salary: user.salary === null ? null : Number(user.salary),
        ...totals,
      };
    });

    return NextResponse.json({
      month,
      settings,
      workingDays: workingDaysInMonth(month, holidays, settings),
      rows,
      totals: {
        headcount: rows.length,
        netPay: Math.round(rows.reduce((sum, r) => sum + r.netPay, 0) * 100) / 100,
        overtimePay: Math.round(rows.reduce((sum, r) => sum + r.overtimePay, 0) * 100) / 100,
      },
      // Salary is missing for anyone never given one; the UI flags them rather
      // than silently paying zero.
      missingSalary: rows.filter((r) => !r.salary).map((r) => r.name),
      scope: selfOnly ? 'self' : 'all',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to build payroll', detail: error.message }, { status: 500 });
  }
}
