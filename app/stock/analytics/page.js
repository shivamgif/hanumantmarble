'use client';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { getTranslation } from '@/lib/translations';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertCircle,
  Clock,
  Package,
  Hourglass,
  X,
  Download,
  PackageX,
  Archive,
  Check,
  Loader2,
} from 'lucide-react';

function formatRelativeTime(date) {
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

function paceAdjustedTarget(goal) {
  const now = new Date();
  const day = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (Number(goal || 0) * day) / totalDays;
}

function CsvExportButton({ type, months, label }) {
  const href = `/api/stock/admin/analytics/export?type=${type}&months=${months}`;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-brand-primary hover:border-brand-primary/40 transition-all"
      download
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

const BRAND_PRIMARY = '#E07A00';
const BRAND_SECONDARY = '#1A1A54';

const INDUSTRIAL_COLORS = [
  '#E07A00',
  '#1A1A54',
  '#059669',
  '#DC2626',
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#0891B2',
];

function formatMonthLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatINR(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatCompactINR(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

const CLASSES = {
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6',
  card: 'rounded-2xl p-5 sm:p-6 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 dark:text-slate-400',
  value: 'mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-sans tracking-tight',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2 snap-x snap-mandatory overscroll-x-contain',
  sectionHead: 'text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 mb-4',
};

function TrendCapsule({ value, isPositive }) {
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

function AnalyticsCard({ title, subtitle, topRight, contextBar, children, className = '' }) {
  return (
    <div className={`${CLASSES.card} ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className={CLASSES.title}>{title}</h3>
          {subtitle ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-bold tracking-tight leading-relaxed">{subtitle}</p> : null}
        </div>
        <div className="shrink-0">{topRight}</div>
      </div>
      {contextBar ? (
        <div className="mb-4 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-tight">{contextBar}</p>
        </div>
      ) : null}
      <div className="relative w-full">{children}</div>
    </div>
  );
}

function formatHours(hours) {
  const h = Number(hours || 0);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function StockHealthScorecard({ data, stockRisk, approvalOps }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const healthy = data.reduce((s, d) => s + Math.max(0, Number(d.total_items || 0) - Number(d.at_risk || 0)), 0);
  const totalItems = data.reduce((s, d) => s + Number(d.total_items || 0), 0);
  const healthyRatio = totalItems > 0 ? healthy / totalItems : 0;

  const zeroStock = Number(stockRisk?.zeroStock || 0);
  const lowStock = Number(stockRisk?.lowStock || 0);
  const riskCount = zeroStock + lowStock;
  const pendingCount = Number(approvalOps?.pendingCount || 0);
  const oldestPendingHours = Number(approvalOps?.oldestPendingHours || 0);
  const medianLagHours = Number(approvalOps?.medianLagHours || 0);

  const metrics = [
    {
      label: t('stockRisk'),
      value: formatCompactNumber(riskCount),
      subValue: `${zeroStock} ${t('zeroStock')} · ${lowStock} ${t('lowStock')}`,
      color: riskCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
      bg: riskCount > 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10',
      border: riskCount > 0 ? 'border-rose-500/20' : 'border-emerald-500/20',
      icon: AlertCircle,
    },
    {
      label: t('pendingApprovals'),
      value: formatCompactNumber(pendingCount),
      subValue: pendingCount > 0 ? `${formatHours(oldestPendingHours)} ${t('oldestPending')}` : t('awaitingReview'),
      color: pendingCount > 10 ? 'text-rose-600 dark:text-rose-400' : pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
      bg: pendingCount > 10 ? 'bg-rose-500/10' : pendingCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
      border: pendingCount > 10 ? 'border-rose-500/20' : pendingCount > 0 ? 'border-amber-500/20' : 'border-emerald-500/20',
      icon: Hourglass,
    },
    {
      label: t('approvalLag'),
      value: formatHours(medianLagHours),
      subValue: t('medianHoursToApprove'),
      color: medianLagHours > 24 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
      bg: medianLagHours > 24 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
      border: medianLagHours > 24 ? 'border-amber-500/20' : 'border-emerald-500/20',
      icon: Clock,
    },
    {
      label: t('operationalStability'),
      value: `${(healthyRatio * 100).toFixed(1)}%`,
      subValue: `${formatCompactNumber(healthy)} ${t('healthyLineItems')}`,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: Package,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
      {metrics.map((m) => (
        <div className="glass-panel rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-7 lg:p-8 relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl group" key={m.label}>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className={`w-16 h-16 flex items-center justify-center rounded-[1.25rem] border ${m.bg} ${m.border} shadow-sm transition-transform duration-500 group-hover:scale-110`}>
                <m.icon className={`h-8 w-8 ${m.color}`} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-slate-500 dark:text-slate-400 text-sm font-bold">{m.label}</div>
              <div className={`text-3xl sm:text-4xl lg:text-5xl font-black font-sans tracking-tighter text-slate-900 dark:text-white leading-none`}>{m.value}</div>
              <div className="text-xs font-medium text-slate-400 mt-3">{m.subValue}</div>
            </div>
          </div>
          <div className={`absolute -right-6 -bottom-6 w-40 h-40 opacity-[0.04] transition-all duration-700 pointer-events-none group-hover:scale-110 group-hover:opacity-[0.08]`}>
            <m.icon className="w-full h-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-2xl bg-slate-900/95 backdrop-blur-md dark:bg-slate-800/95 text-white p-3 shadow-2xl border border-white/10">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-black font-sans tracking-tight" style={{ color: entry.color || entry.stroke || entry.fill }}>
          {entry.name}: {formatter ? formatter(entry.value, entry) : entry.value}
        </p>
      ))}
    </div>
  );
}

function SalesRevenueChart({ data }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  if (!data || data.length === 0)
    return (
      <AnalyticsCard title={t('salesVolume')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const chartData = data.map((d) => ({
    month: formatMonthLabel(d.month || d.bucket),
    total: Number(d.total || 0),
  }));

  const trend =
    data.length >= 2
      ? ((Number(data[data.length - 1].total || 0) - Number(data[data.length - 2].total || 0)) /
        Number(data[data.length - 2].total || 1)) *
      100
      : 0;
  const isPositive = trend >= 0;

  const peak = data.reduce((best, d) => (Number(d.total || 0) > Number(best.total || 0) ? d : best), data[0]);
  const peakLabel = peak ? `${t('highestActivity')}: ${formatCompactNumber(peak.total)} ${t('unitsIn')} ${formatMonthLabel(peak.month || peak.bucket)}` : null;

  return (
    <AnalyticsCard
      title={t('activityTrend')}
      subtitle={t('monthlyOutboundVolume')}
      contextBar={peakLabel}
      topRight={<TrendCapsule value={trend} isPositive={isPositive} />}
    >
      <div className="h-72 lg:h-80 bg-slate-50/30 dark:bg-slate-900/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={BRAND_PRIMARY} stopOpacity={0.3} />
                <stop offset="100%" stopColor={BRAND_PRIMARY} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" className="stroke-slate-100 dark:stroke-slate-800/40" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactNumber} width={40} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => `${formatCompactNumber(v)} ${t('units')}`} />} />
            <Area type="monotone" dataKey="total" name={t('units')} stroke={BRAND_PRIMARY} strokeWidth={3} fill="url(#salesArea)" dot={{ fill: BRAND_PRIMARY, r: 4 }} activeDot={{ r: 7, stroke: 'white', strokeWidth: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

function TopDivisionsChart({ data }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  if (!data || data.length === 0)
    return (
      <AnalyticsCard title={t('topSellingDivisions')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const topDivisions = [...data].sort((a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0)).slice(0, 5);
  const totalRev = topDivisions.reduce((s, d) => s + Number(d.total_revenue || 0), 0) || 1;
  const pieData = topDivisions.map((d, i) => ({
    name: d.division || 'Unknown',
    value: Number(d.total_revenue || 0),
    color: INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length],
  }));

  return (
    <AnalyticsCard
      title={t('divisionContribution')}
      subtitle={t('performanceByUnit')}
    >
      <div className="h-44 mb-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <RechartsTooltip content={<ChartTooltip formatter={(v) => formatCompactINR(v)} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3">
        {topDivisions.map((d, i) => {
          const pct = (Number(d.total_revenue || 0) / totalRev) * 100;
          const color = INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length];
          return (
            <div key={d.division || i} className="flex items-center gap-3 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-black uppercase tracking-[0.15em] text-[10px] text-slate-600 dark:text-slate-300 flex-1 truncate">{d.division || 'Unknown'}</span>
              <span className="font-sans font-black text-slate-900 dark:text-white tracking-wider">{formatCompactINR(d.total_revenue)}</span>
              <span className="text-[9px] font-bold text-slate-400 w-10 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

function MonthlyCostVolumeChart({ dispatchTrend, costTrend }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  const chartData = useMemo(() => {
    const byMonth = {};
    (costTrend || []).forEach((d) => {
      const k = d.bucket || d.month;
      if (!k) return;
      byMonth[k] = { ...byMonth[k], month: k, inboundSqm: Number(d.total_qty_sqm || 0) };
    });
    (dispatchTrend || []).forEach((d) => {
      const k = d.bucket || d.month;
      if (!k) return;
      byMonth[k] = { ...byMonth[k], month: k, outboundSqm: Number(d.dispatched_volume || 0) };
    });
    return Object.values(byMonth)
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-6)
      .map((d) => ({
        month: formatMonthLabel(d.month),
        inbound: d.inboundSqm || 0,
        outbound: d.outboundSqm || 0,
      }));
  }, [costTrend, dispatchTrend]);

  if (!chartData || chartData.length === 0)
    return (
      <AnalyticsCard title={t('flowAnalysis')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  return (
    <AnalyticsCard
      title={t('businessFlow')}
      subtitle={t('inboundOutboundMatch')}
      topRight={
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-100 dark:border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" /> {t('inbound')}
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-100 dark:border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" /> {t('outbound')}
          </div>
        </div>
      }
      className="col-span-1 lg:col-span-2"
    >
      <div className="h-[280px] bg-slate-50/20 dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="4 6" className="stroke-slate-200 dark:stroke-slate-800/60" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactNumber} width={40} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => `${formatCompactNumber(v)} sqm`} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="inbound" name={t('inbound')} fill="#F43F5E" radius={[6, 6, 0, 0]} />
            <Bar dataKey="outbound" name={t('outbound')} fill="#10B981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

function LeaderboardRow({ row, i, maxVal }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const growthRatio = row.growth_ratio != null ? Number(row.growth_ratio) : null;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0">
      <span className="w-6 text-xs font-black text-slate-400 text-right tabular-nums">{i + 1}.</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{row.name || row.salesperson}</p>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-xs font-black font-sans text-slate-900 dark:text-white tabular-nums">{formatCompactINR(row.revenue)}</p>
            {growthRatio != null ? (
              <span className={`text-[10px] font-black tabular-nums ${growthRatio >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {growthRatio >= 0 ? '+' : ''}{(growthRatio * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
        </div>
        <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-secondary rounded-full"
            style={{ width: `${Math.min(100, ((row.revenue || 0) / (maxVal || 1)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ ranking, months }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const maxRev = Math.max(...ranking.map(r => Number(r.revenue || 0)), 1);
  return (
    <AnalyticsCard
      title={t('salesPerformance')}
      subtitle={t('personnelRanking')}
      className="col-span-1 lg:col-span-2 xl:col-span-1"
      topRight={<CsvExportButton type="leaderboard" months={months} label={t('exportCsv')} />}
    >
      <div>
        {ranking.slice(0, 8).map((row, i) => (
          <LeaderboardRow key={row.name || row.salesperson} row={row} i={i} maxVal={maxRev} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

function ReorderNowWidget({ items, months }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard
      title={t('reorderNow')}
      subtitle={t('reorderSubtitle')}
      topRight={items.length > 0 ? <CsvExportButton type="reorder" months={months} label={t('exportCsv')} /> : null}
    >
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 font-bold py-6 text-center">{t('noData')}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const cover = Number(item.days_cover || 0);
            const isCritical = cover <= 0;
            return (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0">
                <PackageX className={`h-4 w-4 shrink-0 ${isCritical ? 'text-rose-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={item.name}>{item.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold truncate">{item.division} · {item.sku}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black font-sans text-slate-900 dark:text-white tabular-nums">{item.sold_30d}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{t('sold30d')}</p>
                </div>
                <div className={`shrink-0 text-right w-16 px-2 py-1 rounded-lg ${isCritical ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                  <p className="text-xs font-black tabular-nums">{cover.toFixed(1)}d</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest leading-none">{t('daysCover')}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnalyticsCard>
  );
}

function DeadStockWidget({ data, months }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const count = Number(data?.itemCount || 0);
  const units = Number(data?.unitsIdle || 0);
  const value = Number(data?.estimatedValue || 0);
  return (
    <AnalyticsCard
      title={t('deadStock')}
      subtitle={t('deadStockSubtitle')}
      topRight={count > 0 ? <CsvExportButton type="deadstock" months={months} label={t('exportCsv')} /> : null}
    >
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 shrink-0">
          <Archive className="h-7 w-7 text-slate-500" />
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-3xl font-black font-sans text-slate-900 dark:text-white tabular-nums leading-none">{count}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t('items')}</p>
          </div>
          <div>
            <p className="text-3xl font-black font-sans text-slate-900 dark:text-white tabular-nums leading-none">{formatCompactNumber(units)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t('unitsIdle')}</p>
          </div>
          {value > 0 ? (
            <div>
              <p className="text-2xl font-black font-sans text-slate-900 dark:text-white tabular-nums leading-none">{formatCompactINR(value)}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t('capitalIdle')}</p>
            </div>
          ) : null}
        </div>
      </div>
    </AnalyticsCard>
  );
}

function PendingQueueWidget({ items, onApprove, onReject, actionLoading }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard title={t('pendingQueueTitle')} subtitle={t('pendingQueueSubtitle')}>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 font-bold py-6 text-center">{t('noData')}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const hrs = Number(item.hours_pending || 0);
            const ageColor = hrs > 48 ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : hrs > 24 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
            const isLoading = actionLoading === `${item.id}`;
            return (
              <div key={item.id} className="flex items-center gap-2 py-2 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.shipment_number}</p>
                  <p className="text-[10px] text-slate-400 font-bold truncate">{item.customer_name || '—'} · {item.salesperson_name || '—'}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg tabular-nums ${ageColor}`}>{formatHours(hrs)}</span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={isLoading || !onApprove}
                    onClick={() => onApprove?.(item)}
                    className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all disabled:opacity-50"
                    title={t('approve')}
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    disabled={isLoading || !onReject}
                    onClick={() => onReject?.(item)}
                    className="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-all disabled:opacity-50"
                    title={t('reject')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnalyticsCard>
  );
}

function SalesPaceWidget({ rows }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!rows || rows.length === 0) {
    return (
      <AnalyticsCard title={t('salesPace')} subtitle={t('salesPaceSubtitle')}>
        <p className="text-xs text-slate-400 font-bold py-6 text-center">{t('noData')}</p>
      </AnalyticsCard>
    );
  }
  const now = new Date();
  const day = now.getDate();
  const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pacePct = Math.round((day / total) * 100);
  return (
    <AnalyticsCard
      title={t('salesPace')}
      subtitle={t('salesPaceSubtitle')}
      contextBar={`Day ${day} of ${total} · expected pace ${pacePct}%`}
    >
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
        {rows.map((row) => {
          const goal = Number(row.goal || 0);
          const actual = Number(row.actual || 0);
          const pct = goal > 0 ? (actual / goal) * 100 : 0;
          const expected = paceAdjustedTarget(goal);
          const expectedPct = goal > 0 ? (expected / goal) * 100 : 0;
          const behindPace = actual < expected;
          return (
            <div key={row.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex-1">{row.name}</p>
                <span className={`text-xs font-black tabular-nums shrink-0 ${behindPace ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="relative h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`absolute top-0 left-0 h-full rounded-full ${behindPace ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
                <div
                  className="absolute top-0 h-full w-0.5 bg-slate-900 dark:bg-slate-100 opacity-60"
                  style={{ left: `${Math.min(100, expectedPct)}%` }}
                  title={`expected pace ${Math.round(expectedPct)}%`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 tabular-nums">
                <span>{formatCompactINR(actual)} / {formatCompactINR(goal)}</span>
                <span>{row.shipments} disp.</span>
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

function CustomerConcentrationWidget({ rows }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!rows || rows.length === 0) {
    return (
      <AnalyticsCard title={t('topCustomers')} subtitle={t('concentrationSubtitle')}>
        <p className="text-xs text-slate-400 font-bold py-6 text-center">{t('noData')}</p>
      </AnalyticsCard>
    );
  }
  const pieData = rows.map((row, i) => ({
    name: row.name,
    value: Number(row.revenue || 0),
    color: INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length],
  }));
  return (
    <AnalyticsCard title={t('topCustomers')} subtitle={t('concentrationSubtitle')}>
      <div className="h-36 mb-3">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={36} outerRadius={62} paddingAngle={2}>
              {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
            </Pie>
            <RechartsTooltip content={<ChartTooltip formatter={(v) => formatCompactINR(v)} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5">
        {rows.slice(0, 5).map((row, i) => {
          const share = Number(row.share_pct || 0);
          const isConcentrated = share >= 10;
          return (
            <div key={row.id} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length] }} />
              <span className="font-bold text-slate-700 dark:text-slate-300 flex-1 truncate" title={row.name}>{row.name}</span>
              <span className="font-sans font-black text-slate-900 dark:text-white tabular-nums shrink-0">{formatCompactINR(row.revenue)}</span>
              <span className={`text-[10px] font-black tabular-nums shrink-0 w-12 text-right ${isConcentrated ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                {share.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

function ActivityFeedWidget({ events }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!events || events.length === 0) {
    return (
      <AnalyticsCard title={t('activityFeed')} subtitle={t('activityFeedSubtitle')}>
        <p className="text-xs text-slate-400 font-bold py-6 text-center">{t('noData')}</p>
      </AnalyticsCard>
    );
  }
  const eventColor = (ev) => {
    if (ev.includes('approved')) return 'bg-emerald-500';
    if (ev.includes('rejected') || ev.includes('change_rejected')) return 'bg-rose-500';
    if (ev.includes('submitted')) return 'bg-amber-500';
    return 'bg-slate-400';
  };
  const eventLabel = (ev) => ev.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <AnalyticsCard title={t('activityFeed')} subtitle={t('activityFeedSubtitle')}>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5 text-xs">
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${eventColor(e.event_type)}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{eventLabel(e.event_type)}</p>
              <p className="text-[10px] text-slate-400 truncate">{e.summary || `${e.entity_type} #${e.entity_id}`}{e.actor_name ? ` · ${e.actor_name}` : ''}</p>
            </div>
            <span className="text-[10px] font-bold text-slate-400 shrink-0 tabular-nums">{formatRelativeTime(e.occurred_at)}</span>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}

function AbcItemsWidget({ items }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!items || items.length === 0) {
    return (
      <AnalyticsCard title={t('abcItems')} subtitle={t('abcSubtitle')}>
        <p className="text-xs text-slate-400 font-bold py-6 text-center">{t('noData')}</p>
      </AnalyticsCard>
    );
  }
  const totalItems = Number(items[0]?.total_items_with_sales || items.length);
  const top80 = items.findIndex((it) => Number(it.cumulative_pct) >= 80);
  const top80Count = top80 >= 0 ? top80 + 1 : items.length;
  const chartData = items.slice(0, 30).map((it) => ({
    rank: it.rank,
    revenue: Number(it.revenue),
    cumulative: Number(it.cumulative_pct),
  }));
  return (
    <AnalyticsCard
      title={t('abcItems')}
      subtitle={t('abcSubtitle')}
      contextBar={`${top80Count} of ${totalItems} items = 80% revenue`}
    >
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-100 dark:stroke-slate-800/40" />
            <XAxis dataKey="rank" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactNumber} width={36} />
            <RechartsTooltip content={<ChartTooltip formatter={(v, e) => e.dataKey === 'cumulative' ? `${v}%` : formatCompactINR(v)} labelFormatter={(l) => `Rank ${l}`} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="revenue" name="Revenue" fill={BRAND_PRIMARY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

function HeroCallouts({ stockedOut, approvalsWaiting, oldestPendingHours, salespeopleBehindPace }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const pills = [
    {
      icon: PackageX,
      value: stockedOut,
      label: t('stockedOut'),
      tone: stockedOut > 0 ? 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      target: '#widget-reorder',
    },
    {
      icon: Hourglass,
      value: approvalsWaiting,
      label: t('approvalsWaiting'),
      hint: approvalsWaiting > 0 ? `${formatHours(oldestPendingHours)} oldest` : null,
      tone: approvalsWaiting > 10 ? 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' : approvalsWaiting > 0 ? 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      target: '#widget-pending',
    },
    {
      icon: TrendingDown,
      value: salespeopleBehindPace,
      label: t('salespeopleBehindPace'),
      tone: salespeopleBehindPace > 0 ? 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      target: '#widget-pace',
    },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {pills.map((p) => (
        <a
          key={p.label}
          href={p.target}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] ${p.tone}`}
        >
          <p.icon className="h-4 w-4" />
          <span className="tabular-nums text-base">{p.value}</span>
          <span>{p.label}</span>
          {p.hint ? <span className="opacity-70 text-[10px]">· {p.hint}</span> : null}
        </a>
      ))}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const { user } = useAuthUser();
  const { accessRole, accessLoading, hasResolvedAccessOnce, accessUser } = useStockAccess(user);
  const router = useRouter();
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [salespersonAnalytics, setSalespersonAnalytics] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isManager = accessRole === 'manager';
  const isSalesperson = accessRole === 'salesperson';
  const isAuthorized = isManager || isSalesperson;

  useEffect(() => {
    if (!accessLoading && hasResolvedAccessOnce && !isAuthorized) {
      router.replace('/stock/admin');
    }
  }, [accessLoading, hasResolvedAccessOnce, isAuthorized, router]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      try {
        if (isManager) {
          const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}`, { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Failed to load analytics');
          if (mounted) setAdminAnalytics(json);
        } else if (isSalesperson) {
          const response = await fetch('/api/stock/salesperson-analytics', { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Failed to load analytics');
          if (mounted) setSalespersonAnalytics(json);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user && isAuthorized) loadData();
    return () => {
      mounted = false;
    };
  }, [user, analyticsRangeMonths, isManager, isSalesperson, isAuthorized]);

  const [pendingActionLoading, setPendingActionLoading] = useState(null);

  const refetchAnalytics = useCallback(async () => {
    if (!isManager) return;
    try {
      const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}&fresh=1`, { cache: 'no-store' });
      const json = await response.json();
      if (response.ok) setAdminAnalytics(json);
    } catch {}
  }, [analyticsRangeMonths, isManager]);

  const handlePendingApprove = useCallback(async (item) => {
    setPendingActionLoading(String(item.id));
    try {
      const response = await fetch(`/api/stock/outbound-shipments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed');
      await refetchAnalytics();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingActionLoading(null);
    }
  }, [refetchAnalytics]);

  const handlePendingReject = useCallback(async (item) => {
    const reason = window.prompt('Reason for rejection (optional):') || 'Rejected from analytics';
    setPendingActionLoading(String(item.id));
    try {
      const response = await fetch(`/api/stock/outbound-shipments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', notes: reason, reason }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed');
      await refetchAnalytics();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingActionLoading(null);
    }
  }, [refetchAnalytics]);

  const salespersonGoalsAll = adminAnalytics?.salespersonGoals || [];
  const salespeopleBehindPace = useMemo(() => {
    return salespersonGoalsAll.filter((r) => {
      const goal = Number(r.goal || 0);
      const actual = Number(r.actual || 0);
      return goal > 0 && actual < paceAdjustedTarget(goal);
    }).length;
  }, [salespersonGoalsAll]);

  if (loading)
    return (
      <div className="space-y-12 p-4 sm:p-6 lg:p-12">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
          <div className="h-16 sm:h-20 w-full sm:w-3/4 max-w-lg bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl sm:rounded-[2.5rem]" />
        </div>
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`hero-skeleton-${index}`} className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-40 sm:h-48" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-80 sm:h-96" />
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-80 sm:h-96" />
        </div>
      </div>
    );
  if (error) return <div className="p-8 text-rose-500 font-bold bg-rose-50 rounded-3xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40">{error}</div>;

  if (isSalesperson) {
    const monthlyTrend = salespersonAnalytics?.monthlyTrend || [];
    const thisMonth = salespersonAnalytics?.thisMonth || { count: 0, value: 0 };
    const lastMonth = salespersonAnalytics?.lastMonth || { count: 0, value: 0 };
    const recentDispatches = salespersonAnalytics?.recentDispatches || [];
    const goal = Number(accessUser?.monthly_sales_goal ?? 0);
    const pct = goal > 0 ? Math.round((thisMonth.value / goal) * 100) : 0;
    const achieved = goal > 0 && thisMonth.value >= goal;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();
    const atRisk = !achieved && pct < 50 && daysLeft < 10;
    const barColor = achieved ? 'bg-yellow-400' : atRisk ? 'bg-amber-500' : 'bg-brand-primary';
    const fmt = (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const countChange = lastMonth.count > 0 ? Math.round(((thisMonth.count - lastMonth.count) / lastMonth.count) * 100) : null;

    return (
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-12 space-y-12 lg:space-y-20 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
          <div className="space-y-4 max-w-4xl">
            <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
              <Link href="/stock" className="hover:text-brand-primary transition-colors">Dashboard</Link>
              <ChevronRight className="h-3 w-3 opacity-50" />
              <span className="text-slate-900 dark:text-white">My Analytics</span>
            </nav>
            <h1 className="text-5xl sm:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              <span className="text-brand-primary">My</span><br className="sm:hidden" /> Performance
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
              Your personal dispatch activity and sales progress for the last 6 months.
            </p>
          </div>
        </header>

        <div className={CLASSES.heroGrid}>
          {goal > 0 && (
            <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm space-y-4 col-span-full lg:col-span-2">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monthly Sales Goal</p>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">{fmt(thisMonth.value)} / {fmt(goal)} — {pct}%</p>
                </div>
                {achieved && <span className="text-xs font-black text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 rounded-full">Goal Achieved!</span>}
                {atRisk && <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 rounded-full">{daysLeft}d left</span>}
              </div>
              <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </div>
          )}
          <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">This Month Dispatches</p>
            <p className="text-4xl font-black text-slate-900 dark:text-white">{thisMonth.count}</p>
            {countChange !== null && (
              <p className={`text-xs font-bold ${countChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {countChange >= 0 ? '+' : ''}{countChange}% vs last month
              </p>
            )}
          </div>
          <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">This Month Value</p>
            <p className="text-4xl font-black text-slate-900 dark:text-white">{fmt(thisMonth.value)}</p>
            {lastMonth.value > 0 && (
              <p className={`text-xs font-bold ${thisMonth.value >= lastMonth.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                vs {fmt(lastMonth.value)} last month
              </p>
            )}
          </div>
        </div>

        {monthlyTrend.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-6">
              <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">Dispatch Value Trend</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
            </div>
            <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm">
              <div className="space-y-4">
                {monthlyTrend.map((row) => {
                  const maxVal = Math.max(...monthlyTrend.map((r) => r.totalValue), 1);
                  const barPct = Math.round((row.totalValue / maxVal) * 100);
                  return (
                    <div key={row.month} className="flex items-center gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-16 shrink-0">{row.month}</span>
                      <div className="flex-1 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-xl bg-brand-primary transition-all duration-700" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-28 text-right shrink-0">{fmt(row.totalValue)}</span>
                      <span className="text-[10px] text-slate-400 w-16 shrink-0">{row.dispatchCount} orders</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {recentDispatches.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-6">
              <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">Recent Dispatches</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
            </div>
            <div className="rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Shipment</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Date</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Customer</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Status</th>
                      <th className="text-right p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDispatches.map((d) => (
                      <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="p-4 font-bold text-slate-900 dark:text-slate-100">{d.shipmentNumber || `#${d.id}`}</td>
                        <td className="p-4 text-slate-500">{d.dispatchDate ? new Date(d.dispatchDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="p-4 text-slate-700 dark:text-slate-300">{d.customerName || '—'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${d.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : d.status === 'cancelled' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-slate-900 dark:text-slate-100">{fmt(d.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  const divisionRisk = adminAnalytics?.inventoryHealth?.divisionRisk || [];
  const divisionPerformance = adminAnalytics?.divisionPerformance?.ranking || [];
  const dispatchTrend = adminAnalytics?.dispatchPerformance?.trend || [];
  const costTrend = adminAnalytics?.costAndPayment?.trend || [];
  const salespersonRanking = adminAnalytics?.salespersonPerformance?.ranking || [];
  const inventoryKpis = adminAnalytics?.inventoryHealth?.kpis || {};
  const dispatchKpis = adminAnalytics?.dispatchPerformance?.kpis || {};
  const purchaseKpis = adminAnalytics?.purchasePerformance?.kpis || {};
  const exposure = adminAnalytics?.costAndPayment?.exposure || {};
  const approvalOps = adminAnalytics?.approvalOps || {};
  const stockRisk = adminAnalytics?.stockRisk || {};
  const reorderNow = adminAnalytics?.reorderNow || [];
  const deadStock = adminAnalytics?.deadStock || {};
  const pendingQueue = adminAnalytics?.pendingQueue || [];
  const salespersonGoals = salespersonGoalsAll;
  const customerConcentration = adminAnalytics?.customerConcentration || [];
  const activityFeed = adminAnalytics?.activityFeed || [];
  const abcItems = adminAnalytics?.abcItems || [];

  const overallTrend =
    dispatchTrend.length >= 2
      ? ((Number(dispatchTrend[dispatchTrend.length - 1]?.total || 0) - Number(dispatchTrend[dispatchTrend.length - 2]?.total || 0)) /
        Number(dispatchTrend[dispatchTrend.length - 2]?.total || 1)) *
      100
      : 0;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-12 space-y-12 lg:space-y-20 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-2">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            <Link href="/stock/admin" className="hover:text-brand-primary transition-colors">{t('operationalCore')}</Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">{t('businessIntelligence')}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            <span className="text-brand-primary">{t('executiveDashboard').split(' ')[0]}</span> {t('executiveDashboard').split(' ').slice(1).join(' ')}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900/40 p-1 rounded-xl border border-slate-200 dark:border-white/5">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => setAnalyticsRangeMonths(m)}
                className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${analyticsRangeMonths === m
                  ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                {m}M
              </button>
            ))}
          </div>
          <a
            href={`/api/stock/admin/analytics/export?type=trends&months=${analyticsRangeMonths}`}
            download
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:text-brand-primary text-xs font-black uppercase tracking-widest transition-all"
            title="Download monthly trends CSV"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        </div>
      </header>

      <HeroCallouts
        stockedOut={reorderNow.length}
        approvalsWaiting={Number(approvalOps?.pendingCount || 0)}
        oldestPendingHours={Number(approvalOps?.oldestPendingHours || 0)}
        salespeopleBehindPace={salespeopleBehindPace}
      />

      <section className="space-y-6">
        <h2 className={CLASSES.sectionHead}>{t('businessSnapshot')}</h2>
        <StockHealthScorecard
          data={divisionRisk}
          stockRisk={stockRisk}
          approvalOps={approvalOps}
        />
      </section>

      <section className="space-y-6" id="action-band">
        <h2 className={CLASSES.sectionHead}>Action</h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5" id="widget-reorder">
            <ReorderNowWidget items={reorderNow} months={analyticsRangeMonths} />
          </div>
          <div className="lg:col-span-3" id="widget-deadstock">
            <DeadStockWidget data={deadStock} months={analyticsRangeMonths} />
          </div>
          <div className="lg:col-span-4" id="widget-pending">
            <PendingQueueWidget
              items={pendingQueue}
              onApprove={handlePendingApprove}
              onReject={handlePendingReject}
              actionLoading={pendingActionLoading}
            />
          </div>
        </div>
      </section>

      <section className="space-y-6" id="people-band">
        <h2 className={CLASSES.sectionHead}>People & Customers</h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5" id="widget-pace">
            <SalesPaceWidget rows={salespersonGoals} />
          </div>
          <div className="lg:col-span-4">
            <CustomerConcentrationWidget rows={customerConcentration} />
          </div>
          <div className="lg:col-span-3">
            <ActivityFeedWidget events={activityFeed} />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className={CLASSES.sectionHead}>Trends</h2>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 space-y-6">
            <SalesRevenueChart data={dispatchTrend} />
            <MonthlyCostVolumeChart dispatchTrend={dispatchTrend} costTrend={costTrend} />
          </div>
          <div className="xl:col-span-4 space-y-6">
            <TopDivisionsChart data={divisionPerformance} />
            <AbcItemsWidget items={abcItems} />
            <Leaderboard ranking={salespersonRanking} months={analyticsRangeMonths} />
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <h2 className={CLASSES.sectionHead}>{t('riskInventory')}</h2>
        <AnalyticsCard
          title={t('riskInventory')}
          subtitle={t('divisionsNeedingAttention')}
              topRight={<CsvExportButton type="risk" months={analyticsRangeMonths} label={t('exportCsv')} />}
        >
          <div className="hidden md:block overflow-x-auto rounded-[2rem] border border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{t('divisionName')}</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">{t('available')}</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">{t('lowStock')}</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
                {divisionRisk.slice(0, 8).map((d) => {
                  const healthy = (d.total_items || 0) - (d.at_risk || 0);
                  const riskRatio = (d.at_risk || 0) / (d.total_items || 1);
                  const isCritical = riskRatio > 0.4;

                  return (
                    <tr key={d.division} className="group hover:bg-slate-100/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-8 py-6">
                        <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">{d.division}</p>
                        {d.critical_items_list && (
                          <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] truncate" title={d.critical_items_list}>⚠️ {d.critical_items_list}</p>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right font-sans text-emerald-600 dark:text-emerald-400 font-black text-xs">{formatCompactNumber(healthy)}</td>
                      <td className="px-8 py-6 text-right font-sans text-amber-600 dark:text-amber-400 font-black text-xs">{formatCompactNumber(d.at_risk)}</td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-3 text-[10px] font-black uppercase tracking-widest">
                          <span className={isCritical ? 'text-rose-500' : 'text-emerald-500'}>
                            {isCritical ? t('actionRequired') : t('stable')}
                          </span>
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ring-4 ${isCritical ? 'bg-rose-500 ring-rose-500/10 animate-pulse' : 'bg-emerald-500 ring-emerald-500/10'}`} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards for Risk Inventory */}
          <div className="md:hidden space-y-4">
            {divisionRisk.slice(0, 8).map((d) => {
              const healthy = (d.total_items || 0) - (d.at_risk || 0);
              const riskRatio = (d.at_risk || 0) / (d.total_items || 1);
              const isCritical = riskRatio > 0.4;
              return (
                <div
                  key={`risk-mob-${d.division}`}
                  className="p-5 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-slate-900/10 space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{d.division}</p>
                      {d.critical_items_list && (
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">⚠️ {d.critical_items_list}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                      <span className={isCritical ? 'text-rose-500' : 'text-emerald-500'}>{isCritical ? t('critical') : t('stable')}</span>
                      <span className={`w-2 h-2 rounded-full ${isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-white/5">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('available')}</p>
                      <p className="text-xs font-black text-emerald-600">{formatCompactNumber(healthy)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('lowStock')}</p>
                      <p className="text-xs font-black text-amber-600">{formatCompactNumber(d.at_risk)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AnalyticsCard>
      </section>
    </div>
  );
}
