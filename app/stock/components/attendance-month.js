'use client';

import { useEffect, useState } from 'react';
import { MonthPicker } from '@/components/ui/month-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { dayOfWeek, formatMinutes, istMonth, istToday } from '@/lib/attendance.mjs';
import { CLASSES } from '../lib/stock-utils';
import { useAttendanceText } from '@/lib/attendance-i18n';
import { STATUS_STYLE } from './attendance-timesheet';

// [status, stock.attendance.* label key]
const LEGEND = [
  ['present', 'present'],
  ['half_day', 'halfDay'],
  ['absent', 'absent'],
  ['paid_leave', 'leave'],
  ['weekly_off', 'weeklyOff'],
  ['holiday', 'holiday'],
];

/**
 * The employee's own month at a glance — the attendance register every HR tool
 * leads with. It is summarizeMonth() from the payroll route's self scope, so
 * this screen and payroll can never disagree about a day. Money is in that
 * payload too but deliberately not shown here.
 */
export function AttendanceMonth({ reloadKey }) {
  const t = useAttendanceText();
  const [month, setMonth] = useState(istMonth);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/stock/attendance/payroll?scope=self&month=${month}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load your month');
        return json;
      })
      .then((json) => {
        if (!cancelled) setSummary(json.rows?.[0] || null);
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
  }, [month, reloadKey]);

  // Not tracked (or no employee record): nothing to show, and nothing to explain.
  if (!loading && !error && !summary) return null;

  const days = summary?.days || [];
  const lead = days.length ? dayOfWeek(days[0].date) : 0;
  const today = istToday();

  const stats = summary
    ? [
        [t('present'), summary.presentDays],
        [t('halfDays'), summary.halfDays],
        [t('absent'), summary.absentDays],
        [t('leave'), summary.paidLeaveDays + summary.unpaidLeaveDays],
        [t('late'), summary.lateDays],
        [t('worked'), formatMinutes(summary.workedMinutes)],
      ]
    : [];

  return (
    <div className={CLASSES.card}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={CLASSES.title}>{t('myMonth')}</h2>
          {summary ? (
            <p className="mt-1 text-xs font-bold text-slate-500">{t('workingDays', { n: summary.workingDays })}</p>
          ) : null}
        </div>
        <MonthPicker value={month} onChange={setMonth} max={istMonth()} />
      </div>

      {error ? <p className="mb-3 text-xs font-bold text-rose-500">{error}</p> : null}

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : summary ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {t('weekdays').split(',').map((d, i) => (
                <span key={i} className="pb-1 text-[11px] font-bold text-slate-500">{d}</span>
              ))}
              {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
              {days.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date} · ${day.status.replaceAll('_', ' ')}${day.workedMinutes ? ` · ${formatMinutes(day.workedMinutes)}` : ''}${day.isLate ? ` · late ${day.lateMinutes}m` : ''}`}
                  className={`relative flex aspect-square items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                    STATUS_STYLE[day.status] || ''
                  } ${day.date === today ? 'ring-2 ring-brand-primary' : ''}`}
                >
                  {Number(day.date.slice(8))}
                  {day.isLate && day.workedMinutes ? (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="Late" />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
              {LEGEND.map(([status, labelKey]) => (
                <span key={status} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <span className={`h-3 w-3 rounded ${STATUS_STYLE[status]}`} />
                  {t(labelKey)}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {t('late')}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/60 p-3">
                <dt className="text-[11px] font-bold text-slate-500">{label}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
