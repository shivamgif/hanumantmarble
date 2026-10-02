'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { istMonth, istToday } from '@/lib/attendance.mjs';
import { Skeleton } from '@/components/ui/skeleton';
import { AnalyticsCard, EmptyState, formatCompactINR } from '../../components/dashboard-ui';

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load attendance');
  return json;
}

/**
 * The team's attendance next to its sales. Everything here is read from the
 * attendance routes as they already are — today's punches, this month's
 * payroll roll-up and pending leave — so these figures and the Attendance
 * screens can never disagree. Month figures run to today (see summarizeMonth's
 * cutoff), not to the end of the month.
 */
export function AttendanceSummaryWidget() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson(`/api/stock/attendance?userId=all&date=${istToday()}`),
      getJson(`/api/stock/attendance/payroll?month=${istMonth()}`),
      getJson('/api/stock/attendance/leave?scope=all&status=pending'),
    ])
      .then(([today, payroll, leave]) => {
        if (!cancelled) setData({ today, payroll, leave });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = t('attendanceTitle');
  if (error) {
    return (
      <AnalyticsCard title={title}>
        <EmptyState label={error} />
      </AnalyticsCard>
    );
  }
  if (!data) return <Skeleton className="h-72 rounded-xl" />;

  const today = istToday();
  const rows = data.payroll.rows || [];
  if (!rows.length) {
    return (
      <AnalyticsCard title={title}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }

  // Open since an earlier day is a forgotten clock-out, not someone at work.
  const onDuty = (data.today.onDuty || []).filter((row) => row.work_date >= today).length;
  const lateToday = new Set((data.today.entries || []).filter((e) => e.isLate).map((e) => e.user_id)).size;
  const absentDays = rows.reduce((sum, r) => sum + (r.absentDays || 0), 0);
  const overtimeHours = rows.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0) / 60;
  const pendingLeave = (data.leave.leaveRequests || []).length;
  const needsReview = (data.today.needsReview || []).length;
  const mostLate = rows
    .filter((r) => r.lateDays > 0)
    .sort((a, b) => b.lateDays - a.lateDays)
    .slice(0, 3);

  const tiles = [
    { label: t('onDutyNow'), value: `${onDuty} / ${rows.length}` },
    { label: t('lateToday'), value: lateToday, alert: lateToday > 0 },
    { label: t('absentDaysMonth'), value: absentDays },
    {
      label: t('overtimeMonth'),
      value: `${overtimeHours.toFixed(1)}h`,
      sub: data.payroll.totals?.overtimePay ? formatCompactINR(data.payroll.totals.overtimePay) : null,
    },
    { label: t('pendingLeave'), value: pendingLeave, alert: pendingLeave > 0, href: '/stock/attendance?view=leave' },
    { label: t('needsReview'), value: needsReview, alert: needsReview > 0, href: '/stock/attendance?view=team' },
  ];

  return (
    <AnalyticsCard
      title={title}
      subtitle={t('attendanceSubtitle')}
      topRight={
        <Link
          href="/stock/attendance?view=team"
          className="flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
        >
          {t('openAttendance')}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => {
          const body = (
            <>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{tile.label}</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  tile.alert ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {tile.value}
              </p>
              {tile.sub ? <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-500">{tile.sub}</p> : null}
            </>
          );
          const cls = 'rounded-xl border border-border/60 p-3';
          return tile.href && tile.alert ? (
            <Link key={tile.label} href={tile.href} className={`${cls} transition hover:border-brand-primary/50`}>
              {body}
            </Link>
          ) : (
            <div key={tile.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      {mostLate.length ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold text-slate-500">{t('mostLate')}</p>
          <ul className="space-y-1.5">
            {mostLate.map((row) => (
              <li key={row.userId} className="flex items-center justify-between text-xs font-bold">
                <span className="truncate text-slate-900 dark:text-slate-100">{row.name}</span>
                <span className="shrink-0 tabular-nums text-rose-600 dark:text-rose-400">
                  {row.lateDays} {t('lateDaysShort')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AnalyticsCard>
  );
}
