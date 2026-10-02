'use client';
import { TrendingUp, TrendingDown, Download, Inbox } from 'lucide-react';

export const BRAND_PRIMARY = '#E07A00';
export const BRAND_SECONDARY = '#1A1A54';
// Chart-mark orange: brand #E07A00 fails contrast on chart surfaces (2.94:1 light, too light on dark)
export const CHART_ORANGE = '#C96E00';

export const INDUSTRIAL_COLORS = [
  '#C96E00',
  '#1A1A54',
  '#059669',
  '#7C3AED',
  '#2563EB',
  '#D97706',
  '#DC2626',
  '#0891B2',
];

// Line-series palette: same hues minus brand navy, which is invisible on dark surfaces (1.1:1 contrast)
export const SERIES_COLORS = ['#C96E00', '#2563EB', '#059669', '#7C3AED', '#DC2626'];

export const CLASSES = {
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6',
  card: 'rounded-xl p-5 sm:p-6 bg-card border border-border shadow-card',
  title: 'text-sm font-semibold text-slate-900 dark:text-slate-100',
  value: 'mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100 font-sans tracking-tight tabular-nums',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  mobileScroll: 'flex overflow-x-auto scrollbar-none gap-2 pb-2 snap-x snap-mandatory overscroll-x-contain',
  sectionHead: 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3',
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

export function formatMonthLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);
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

export function CsvExportButton({ type, months, label }) {
  const href = `/api/stock/admin/analytics/export?type=${type}&months=${months}`;
  return (
    <a
      href={href}
      className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-md text-xs font-medium bg-card border border-border text-slate-700 dark:text-slate-300 hover:bg-muted transition-colors focus-ring"
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
      className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${isPositive
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-rose-700 dark:text-rose-400'
        }`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function AnalyticsCard({ title, subtitle, topRight, contextBar, insight, showInsight, children, className = '' }) {
  return (
    <div className={`${CLASSES.card} ${className}`}>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className={CLASSES.title}>{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 max-w-full min-w-0">{topRight}</div>
      </div>
      {showInsight && insight ? (
        <div className="mb-4 border-l-2 border-brand-primary/60 pl-3 animate-fade-in">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100 mr-1.5">How it works:</span>
            {insight}
          </p>
        </div>
      ) : null}
      {contextBar ? (
        <div className="mb-4 px-3 py-2 rounded-md bg-muted/60">
          <p className="text-xs text-slate-600 dark:text-slate-400">{contextBar}</p>
        </div>
      ) : null}
      <div className="relative w-full">{children}</div>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground mb-1">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-sm font-semibold font-sans text-foreground tabular-nums">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color || entry.stroke || entry.fill }}
          />
          {entry.name}: {formatter ? formatter(entry.value, entry) : entry.value}
        </p>
      ))}
    </div>
  );
}

export function EmptyState({ label, icon: Icon = Inbox, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-4 text-center ${className}`}>
      <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
