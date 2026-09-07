'use client';

import { useEffect, useState } from 'react';
import { Download, MapPinOff, Pencil } from 'lucide-react';
import { MonthPicker } from '@/components/ui/month-picker';
import { formatMinutes } from '@/lib/attendance.mjs';
import { CLASSES, FORM_INPUT_CLASS, PILL_BUTTON_CLASS, exportToCSV } from '../lib/stock-utils';

const currentMonth = () => new Date().toISOString().slice(0, 7);

const STATUS_STYLE = {
  present: 'bg-emerald-500/10 text-emerald-600',
  half_day: 'bg-amber-500/10 text-amber-600',
  absent: 'bg-rose-500/10 text-rose-600',
  paid_leave: 'bg-sky-500/10 text-sky-600',
  unpaid_leave: 'bg-slate-500/10 text-slate-500',
  weekly_off: 'bg-slate-500/10 text-slate-500',
};

export function StatusPill({ status }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
        STATUS_STYLE[status] || STATUS_STYLE.absent
      }`}
    >
      {String(status || '').replace('_', ' ')}
    </span>
  );
}

/** The time part of an IST wall-clock string, without re-parsing it as a Date. */
export function clockTime(value) {
  if (!value) return '—';
  return String(value).slice(11, 16);
}

const COLUMNS = [
  { id: 'work_date', label: 'Date' },
  { id: 'user_name', label: 'Employee' },
  { id: 'in', label: 'In', value: (r) => clockTime(r.clock_in_at) },
  { id: 'out', label: 'Out', value: (r) => clockTime(r.clock_out_at) },
  { id: 'break', label: 'Break (min)', value: (r) => Math.round((r.break_seconds || 0) / 60) },
  { id: 'worked', label: 'Worked', value: (r) => formatMinutes(r.workedMinutes) },
  { id: 'late', label: 'Late (min)', value: (r) => r.lateMinutes || 0 },
  { id: 'source', label: 'Source' },
];

export function AttendanceTimesheet({ scope = 'self', employees = [], canManage = false, onEdit, reloadKey }) {
  const [month, setMonth] = useState(currentMonth);
  const [userId, setUserId] = useState(scope === 'all' ? 'all' : '');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ month });
    if (scope === 'all') params.set('userId', userId || 'all');

    fetch(`/api/stock/attendance?${params}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load timesheet');
        return json;
      })
      .then((json) => {
        if (!cancelled) setRows(json.entries || []);
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
  }, [month, userId, scope, reloadKey]);

  const totalMinutes = rows.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);

  return (
    <div className={CLASSES.card}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={CLASSES.title}>Timesheet</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {formatMinutes(totalMinutes)} total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scope === 'all' ? (
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${FORM_INPUT_CLASS} w-auto`}>
              <option value="all">Everyone</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          ) : null}
          <MonthPicker value={month} onChange={setMonth} max={currentMonth()} />
          <button
            type="button"
            onClick={() => exportToCSV(`attendance-${month}.csv`, rows, COLUMNS)}
            disabled={!rows.length}
            className={PILL_BUTTON_CLASS}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 text-xs font-bold text-rose-500">{error}</p> : null}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/60">
              {COLUMNS.map((col) => (
                <th
                  key={col.id}
                  className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-[0.2em] text-slate-500"
                >
                  {col.label}
                </th>
              ))}
              {canManage ? <th className="px-4 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-xs font-bold text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-xs font-bold text-slate-400">
                  No attendance recorded for this month.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-500/5">
                  <td className="px-4 py-3 text-xs font-bold tabular-nums">{row.work_date}</td>
                  <td className="px-4 py-3 text-xs font-bold">
                    {row.user_name}
                    {row.is_outside_geofence ? (
                      <MapPinOff className="ml-1.5 inline h-3 w-3 text-amber-500" aria-label="Outside geofence" />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {clockTime(row.clock_in_at)}
                    {row.isLate ? <span className="ml-1 text-[9px] font-bold text-rose-500">+{row.lateMinutes}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {row.isOpen ? <span className="font-black text-emerald-600">In now</span> : clockTime(row.clock_out_at)}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">{Math.round((row.break_seconds || 0) / 60)}</td>
                  <td className="px-4 py-3 text-xs font-black tabular-nums">{formatMinutes(row.workedMinutes)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{row.lateMinutes || '—'}</td>
                  <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{row.source}</td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => onEdit?.(row)} className="text-slate-400 hover:text-brand-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">Loading…</p>
        ) : !rows.length ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">No attendance recorded for this month.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black tabular-nums">{row.work_date}</span>
                <span className="text-xs font-black tabular-nums">{formatMinutes(row.workedMinutes)}</span>
              </div>
              <p className="mt-1 text-[11px] font-bold text-slate-500">{row.user_name}</p>
              <p className="mt-1 text-[11px] tabular-nums text-slate-500">
                {clockTime(row.clock_in_at)} → {row.isOpen ? 'in now' : clockTime(row.clock_out_at)}
                {row.isLate ? <span className="ml-1.5 font-bold text-rose-500">late {row.lateMinutes}m</span> : null}
              </p>
              {canManage ? (
                <button type="button" onClick={() => onEdit?.(row)} className="mt-2 text-[10px] font-black uppercase tracking-wider text-brand-primary">
                  Edit
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
