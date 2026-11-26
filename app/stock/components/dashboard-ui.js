'use client';
import { TrendingUp, TrendingDown, Download, Inbox } from 'lucide-react';
import { CLASSES as BASE_CLASSES } from '../lib/stock-utils';

// The page-wide classes, plus the few only dashboards use.
export const CLASSES = {
  ...BASE_CLASSES,
  value: 'mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100 font-sans tracking-tight tabular-nums',
  sectionHead: 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2',
};

export function formatRelativeTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function paceAdjustedTarget(goal) {
  const now = new Date();
  const day = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (Number(goal || 0) * day) / totalDays;
}

// Buckets arrive as 'YYYY-MM-DD' text (see the analytics route), read as UTC
// so no timezone moves them a day.
function bucketDate(value) {
  const s = String(value || '').slice(0, 10);
  const date = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Axis label: "12 Nov" for a day, "Nov" for a month ("Nov 25" outside this year). */
export function formatBucketLabel(value, bucket = 'month') {
  const date = bucketDate(value);
  if (!date) return '—';
  if (bucket === 'day') return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  const sameYear = date.getUTCFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('en-IN', { month: 'short', ...(sameYear ? {} : { year: '2-digit' }), timeZone: 'UTC' }).format(date);
}

/** Tooltip / sheet title: "Wed, 12 Nov 2026" or "November 2026". */
export function formatBucketLong(value, bucket = 'month') {
  const date = bucketDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', bucket === 'day'
    ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    : { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** "1 Jun – 26 Nov 2026" for a { from, to } range. */
export function formatRangeLabel(range) {
  if (!range?.from) return '';
  const a = bucketDate(range.from);
  const b = bucketDate(range.to);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const f = (d, withYear) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(d);
  return range.from === range.to ? f(a, true) : `${f(a, !sameYear)} – ${f(b, true)}`;
}

export function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

export function formatINR(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function formatCompactINR(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

export function formatHours(hours) {
  const h = Number(hours || 0);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// query: the page's range as URL params (rangeQuery), so the CSV holds exactly
// the window on screen.
export function CsvExportButton({ type, query, label }) {
  const href = `/api/stock/admin/analytics/export?type=${type}&${query}`;
  return (
    <a
      href={href}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
      download
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

export function TrendCapsule({ value, isPositive }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${isPositive
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
        }`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function AnalyticsCard({ title, subtitle, topRight, contextBar, children, className = '' }) {
  return (
    <div className={`${CLASSES.card} flex flex-col ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p> : null}
        </div>
        {topRight ? <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-2">{topRight}</div> : null}
      </div>
      <div className="relative w-full flex-1">{children}</div>
      {contextBar ? <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">{contextBar}</p> : null}
    </div>
  );
}

export function EmptyState({ label, icon: Icon = Inbox, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-center ${className}`}>
      <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
