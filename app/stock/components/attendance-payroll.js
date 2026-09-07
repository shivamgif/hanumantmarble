'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { MonthPicker } from '@/components/ui/month-picker';
import { formatMinutes } from '@/lib/attendance.mjs';
import { CLASSES, PILL_BUTTON_CLASS, exportToCSV } from '../lib/stock-utils';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const CSV_COLUMNS = [
  { id: 'name', label: 'Employee' },
  { id: 'department', label: 'Department' },
  { id: 'salary', label: 'Monthly Salary' },
  { id: 'workingDays', label: 'Working Days' },
  { id: 'presentDays', label: 'Present' },
  { id: 'halfDays', label: 'Half Days' },
  { id: 'paidLeaveDays', label: 'Paid Leave' },
  { id: 'unpaidLeaveDays', label: 'Unpaid Leave' },
  { id: 'absentDays', label: 'Absent' },
  { id: 'lateDays', label: 'Late Days' },
  { id: 'overtimeHours', label: 'Overtime Hours', value: (r) => (r.overtimeMinutes / 60).toFixed(2) },
  { id: 'perDay', label: 'Per Day' },
  { id: 'earnedBase', label: 'Earned' },
  { id: 'overtimePay', label: 'Overtime Pay' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'netPay', label: 'Net Pay' },
];

export function AttendancePayroll() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/stock/attendance/payroll?month=${month}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to build payroll');
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const rows = data?.rows || [];

  return (
    <div className={CLASSES.card}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={CLASSES.title}>Payroll</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {data ? `${data.workingDays} working days · ${rupees(data.totals?.netPay)} total` : '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} max={currentMonth()} />
          <button
            type="button"
            onClick={() => exportToCSV(`payroll-${month}.csv`, rows, CSV_COLUMNS)}
            disabled={!rows.length}
            className={PILL_BUTTON_CLASS}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 text-xs font-bold text-rose-500">{error}</p> : null}

      {data?.missingSalary?.length ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>No salary set, so these are paid ₹0: {data.missingSalary.join(', ')}</span>
        </p>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/60">
              {['Employee', 'Present', 'Half', 'Leave', 'Absent', 'OT', 'Per day', 'Earned', 'OT pay', 'Net pay'].map((label) => (
                <th
                  key={label}
                  className={`px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 ${
                    label === 'Employee' ? 'text-left' : 'text-right'
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-xs font-bold text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-xs font-bold text-slate-400">
                  No tracked employees.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId} className="transition hover:bg-slate-500/5">
                  <td className="px-3 py-3 text-xs font-bold">
                    {row.name}
                    {!row.hasLogin ? (
                      <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">no login</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{row.presentDays}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{row.halfDays || '—'}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{row.paidLeaveDays || '—'}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums text-rose-500">{row.absentDays || '—'}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">
                    {row.overtimeMinutes ? formatMinutes(row.overtimeMinutes) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{rupees(row.perDay)}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{rupees(row.earnedBase)}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{row.overtimePay ? rupees(row.overtimePay) : '—'}</td>
                  <td className="px-3 py-3 text-right text-xs font-black tabular-nums">{rupees(row.netPay)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <article key={row.userId} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black">{row.name}</span>
              <span className="text-xs font-black tabular-nums">{rupees(row.netPay)}</span>
            </div>
            <p className="mt-1 text-[11px] font-bold tabular-nums text-slate-500">
              {row.presentDays} present · {row.absentDays} absent · {formatMinutes(row.overtimeMinutes)} OT
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
