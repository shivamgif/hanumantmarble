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
  '#DC2626',
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#0891B2',
];

// Line-series palette: same hues minus brand navy, which is invisible on dark surfaces (1.1:1 contrast)
export const SERIES_COLORS = ['#C96E00', '#2563EB', '#059669', '#DC2626', '#7C3AED'];

export const CLASSES = {
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6',
  card: 'rounded-2xl p-5 sm:p-6 bg-card border border-border shadow-card transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 dark:text-slate-400',
  value: 'mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-sans tracking-tight',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2 snap-x snap-mandatory overscroll-x-contain',
  sectionHead: 'text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 mb-4',
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
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-card border border-border shadow-card text-slate-600 dark:text-slate-300 hover:text-brand-primary hover:border-brand-primary/40 transition-all focus-ring"
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
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${isPositive
        ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20'
        : 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20'
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
          {subtitle ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-bold tracking-tight leading-relaxed">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 max-w-full min-w-0">{topRight}</div>
      </div>
      {showInsight && insight ? (
        <div className="mb-4 px-3 py-2 rounded-xl bg-brand-primary/5 border border-brand-primary/10 animate-scale-in">
          <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300 font-bold">
            <span className="font-black text-brand-primary uppercase mr-2 text-[9px] tracking-[0.2em]">Logic:</span>
            {insight}
          </p>
        </div>
      ) : null}
      {contextBar ? (
        <div className="mb-4 px-3 py-2 rounded-xl bg-muted/50 border border-border/60">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-tight">{contextBar}</p>
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
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-sm font-black font-sans tracking-tight text-foreground tabular-nums">
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
    <div className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 py-3 text-center ${className}`}>
      <Icon className="h-4 w-4 text-slate-400" />
      <p className="text-xs font-bold text-slate-400">{label}</p>
    </div>
  );
}
