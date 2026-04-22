'use client';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getTranslation } from '@/lib/translations';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronRight,
  ArrowLeft,
  Calendar,
  AlertCircle,
  Trophy,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  ShieldCheck,
  CheckCircle2,
  Hourglass,
  Search,
  Printer,
  X,
  FileText,
} from 'lucide-react';

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
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6',
  card: 'glass-panel rounded-3xl sm:rounded-[2rem] p-5 sm:p-6 lg:p-8 transition-all duration-500 hover:shadow-xl group/card',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 group-hover/card:text-brand-primary transition-colors',
  value: 'mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-sans tracking-tight',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2',
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

function AnalyticsCard({ title, subtitle, topRight, contextBar, insight, showInsight, children, className = '' }) {
  return (
    <div className={`${CLASSES.card} ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h3 className={CLASSES.title}>{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-bold tracking-tight leading-relaxed uppercase opacity-70">{subtitle}</p>}
        </div>
        <div className="shrink-0">
          {topRight}
        </div>
      </div>
      {showInsight && insight && (
        <div className="mb-8 p-5 rounded-2xl bg-brand-primary/5 border border-brand-primary/10 animate-scale-in">
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-bold">
            <span className="font-black text-brand-primary uppercase mr-2 text-[9px] tracking-[0.2em] border-b-2 border-brand-primary/20 pb-0.5">Analysis:</span>
            {insight}
          </p>
        </div>
      )}
      {contextBar && (
        <div className="mb-8 px-4 py-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black italic tracking-tight uppercase opacity-60">{contextBar}</p>
        </div>
      )}
      <div className="relative w-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function StockHealthScorecard({ data, inventoryKpis, onTimeRatio, approvalRate, outstandingExposure, showInsight }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const healthy = data.reduce((s, d) => s + Math.max(0, Number(d.total_items || 0) - Number(d.at_risk || 0)), 0);
  const totalItems = data.reduce((s, d) => s + Number(d.total_items || 0), 0);
  const atRiskCount = data.reduce((s, d) => s + Number(d.at_risk || 0), 0);
  const healthyRatio = totalItems > 0 ? healthy / totalItems : 0;
  const onTimePct = Math.round((onTimeRatio || 0) * 100);
  const approvalPct = Math.round((approvalRate || 0) * 100);

  const metrics = [
    {
      label: t('operationalStability'),
      value: `${(healthyRatio * 100).toFixed(1)}%`,
      subValue: `${formatCompactNumber(healthy)} ${t('healthyLineItems')}`,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: Package,
      trend: null,
    },
    {
      label: t('inventoryVulnerability'),
      value: formatCompactNumber(atRiskCount),
      subValue: t('unitsBelowThreshold'),
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: AlertCircle,
      trend: null,
    },
    {
      label: t('onTimeDelivery'),
      value: `${onTimePct}%`,
      subValue: t('shipmentsOnSchedule'),
      color: onTimePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      bg: onTimePct >= 80 ? 'bg-emerald-500/10' : 'bg-rose-500/10',
      border: onTimePct >= 80 ? 'border-emerald-500/20' : 'border-rose-500/20',
      icon: ShieldCheck,
      trend: null,
    },
    {
      label: t('approvalRate'),
      value: `${approvalPct}%`,
      subValue: t('purchasesApproved'),
      color: approvalPct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      bg: approvalPct >= 70 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
      border: approvalPct >= 70 ? 'border-emerald-500/20' : 'border-amber-500/20',
      icon: CheckCircle2,
      trend: null,
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

function SalesRevenueChart({ data, showInsight }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [mouseX, setMouseX] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0)
    return (
      <AnalyticsCard title={t('salesVolume')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const height = 256;
  const pad = { t: 20, r: 10, b: 40, l: 40 };
  const innerH = height - pad.t - pad.b;
  const innerW = width - pad.l - pad.r;
  const maxVal = Math.max(...data.map((d) => Number(d.total || 0)), 1);

  const points = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * innerW,
    y: pad.t + innerH - (Number(d.total || 0) / maxVal) * innerH,
    d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x || 0} ${height - pad.b} L ${points[0]?.x || 0} ${height - pad.b} Z`;

  const trend =
    data.length >= 2
      ? ((Number(data[data.length - 1].total || 0) - Number(data[data.length - 2].total || 0)) /
        Number(data[data.length - 2].total || 1)) *
      100
      : 0;
  const isPositive = trend >= 0;

  const peakPoint = points.reduce((best, p) => (Number(p.d.total || 0) > Number(best.d.total || 0) ? p : best), points[0]);
  const peakLabel = peakPoint ? `${t('highestActivity')}: ${formatCompactNumber(peakPoint.d.total)} ${t('unitsIn')} ${formatMonthLabel(peakPoint.d.month || peakPoint.d.bucket)}` : null;

  return (
    <AnalyticsCard
      title={t('activityTrend')}
      subtitle={t('monthlyOutboundVolume')}
      contextBar={peakLabel}
      insight={t('analysisActivity')}
      showInsight={showInsight}
      topRight={<TrendCapsule value={trend} isPositive={isPositive} />}
    >
      <div
        className="relative h-72 lg:h-80 bg-slate-50/30 dark:bg-slate-900/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden flex items-end p-4"
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMouseX(e.clientX - rect.left);
        }}
        onMouseLeave={() => { setMouseX(null); setHoveredIndex(null); }}
      >
        <svg className="absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id="salesAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND_PRIMARY} stopOpacity="0.25" />
              <stop offset="100%" stopColor={BRAND_PRIMARY} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {points.map((p, i) => (
            <line key={`grid-${i}`} x1={p.x} x2={p.x} y1={pad.t} y2={height - pad.b} stroke="currentColor" className="text-slate-100 dark:text-slate-800/40" strokeDasharray="4 4" />
          ))}

          {mouseX !== null && mouseX >= pad.l && mouseX <= width - pad.r && (
            <line
              x1={mouseX} x2={mouseX}
              y1={pad.t} y2={height - pad.b}
              stroke={BRAND_PRIMARY}
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.6"
            />
          )}

          <path d={areaPath} fill="url(#salesAreaGradient)" />
          <path d={linePath} fill="none" stroke={BRAND_PRIMARY} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-lg" />

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="6"
                fill={BRAND_PRIMARY}
                stroke="white"
                strokeWidth="3"
                className={`transition-all duration-300 ${hoveredIndex === i ? 'scale-150' : 'opacity-0 hover:opacity-100'}`}
                onMouseEnter={() => setHoveredIndex(i)}
              />
              <text x={p.x} y={height - 15} textAnchor="middle" fontSize="10" className="fill-slate-400 font-black uppercase tracking-tighter">
                {formatMonthLabel(p.d.month || p.d.bucket)}
              </text>
            </g>
          ))}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none rounded-2xl bg-slate-900/95 backdrop-blur-md dark:bg-slate-800/95 text-white p-4 shadow-2xl animate-scale-in border border-white/10"
            style={{ left: points[hoveredIndex].x, top: points[hoveredIndex].y - 80, transform: 'translateX(-50%)' }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{formatMonthLabel(points[hoveredIndex].d.month || points[hoveredIndex].d.bucket)}</p>
            <p className="text-lg font-black font-sans tracking-tight">{formatCompactNumber(points[hoveredIndex].d.total)} {t('units')}</p>
          </div>
        )}
      </div>
    </AnalyticsCard>
  );
}

function TopDivisionsChart({ data, showInsight }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0)
    return (
      <AnalyticsCard title={t('topSellingDivisions')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const topDivisions = [...data].sort((a, b) => Number(b.total_items || 0) - Number(a.total_items || 0)).slice(0, 5);
  const maxVal = Math.max(...topDivisions.map((d) => Number(d.total_items || 0)), 1);

  return (
    <AnalyticsCard
      title={t('divisionContribution')}
      subtitle={t('performanceByUnit')}
      insight={t('analysisDivision')}
      showInsight={showInsight}
    >
      <div className="space-y-6" ref={containerRef}>
        {topDivisions.map((d, i) => {
          const actualPercent = (Number(d.total_items || 1) / maxVal) * 100;
          const color = INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length];
          return (
            <div
              key={d.division || i}
              className="relative group cursor-default"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex justify-between text-xs font-black mb-2 px-1">
                <span className="text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-[10px] group-hover:text-brand-primary transition-colors">{d.division || 'Unknown'}</span>
                <span className="font-sans text-slate-900 dark:text-white tracking-widest">{formatCompactNumber(d.total_items)}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100/50 dark:bg-slate-800/30 rounded-full overflow-hidden border border-slate-200/20">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${actualPercent}%`, backgroundColor: color }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

function MonthlyCostVolumeChart({ dispatchTrend, costTrend, showInsight }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [mouseX, setMouseX] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
      .slice(-6);
  }, [costTrend, dispatchTrend]);

  if (!chartData || chartData.length === 0)
    return (
      <AnalyticsCard title={t('flowAnalysis')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const height = 280;
  const pad = { t: 20, r: 10, b: 40, l: 40 };
  const innerH = height - pad.t - pad.b;
  const innerW = width - pad.l - pad.r;
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.inboundSqm || 0, d.outboundSqm || 0)), 1);
  const barWidth = Math.max(12, (innerW / chartData.length) * 0.22);

  return (
    <AnalyticsCard
      title={t('businessFlow')}
      subtitle={t('inboundOutboundMatch')}
      insight={t('analysisFlow')}
      showInsight={showInsight}
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
      <div
        className="relative h-[280px] bg-slate-50/20 dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden p-6"
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMouseX(e.clientX - rect.left);
        }}
        onMouseLeave={() => { setMouseX(null); setHoveredIndex(null); }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={pad.l}
              x2={width - pad.r}
              y1={pad.t + innerH * t}
              y2={pad.t + innerH * t}
              stroke="currentColor"
              strokeDasharray="4 6"
              className="text-slate-200 dark:text-slate-800/60"
            />
          ))}

          {chartData.map((d, i) => {
            const groupX = pad.l + (i + 0.5) * (innerW / chartData.length);
            const costH = ((d.inboundSqm || 0) / maxVal) * innerH;
            const soldH = ((d.outboundSqm || 0) / maxVal) * innerH;
            const costY = pad.t + innerH - costH;
            const soldY = pad.t + innerH - soldH;

            return (
              <g key={i} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} className="cursor-pointer group">
                <rect x={groupX - barWidth - 4} y={costY} width={barWidth} height={costH} fill="#F43F5E" rx="6" className="transition-all duration-300 group-hover:brightness-125" fillOpacity="0.9" />
                <rect x={groupX + 4} y={soldY} width={barWidth} height={soldH} fill="#10B981" rx="6" className="transition-all duration-300 group-hover:brightness-125" fillOpacity="0.9" />
                <text x={groupX} y={height - 15} textAnchor="middle" fontSize="10" className="fill-slate-400 font-black uppercase tracking-widest">
                  {formatMonthLabel(d.month || d.bucket)}
                </text>
              </g>
            );
          })}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none rounded-[1.5rem] bg-slate-900/95 backdrop-blur-md dark:bg-slate-800/95 text-white p-4 shadow-2xl border border-white/10"
            style={{
              left: pad.l + (hoveredIndex + 0.5) * (innerW / chartData.length),
              top: pad.t + innerH / 2,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{formatMonthLabel(chartData[hoveredIndex].month)}</p>
            <div className="flex flex-col gap-2 text-sm font-black tracking-tight">
              <span className="text-rose-400 flex items-center justify-between gap-4">{t('inbound')}: <span>{formatCompactNumber(chartData[hoveredIndex].inboundSqm)} sqm</span></span>
              <span className="text-emerald-400 flex items-center justify-between gap-4">{t('outbound')}: <span>{formatCompactNumber(chartData[hoveredIndex].outboundSqm)} sqm</span></span>
            </div>
          </div>
        )}
      </div>
    </AnalyticsCard>
  );
}

function LeaderboardRow({ row, i, maxQty }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const [expanded, setExpanded] = useState(false);

  const consistencyScore = Math.round(Number(row.consistency_score || 0));
  const growthRatio = Number(row.growth_ratio || 0);
  const isHighConsistency = consistencyScore >= 70;

  return (
    <div className="group border border-slate-100/50 dark:border-slate-800/40 rounded-2xl overflow-hidden mb-4 transition-all hover:border-brand-primary/20 hover:shadow-lg">
      <div
        className="flex items-center gap-5 p-5 bg-white/50 dark:bg-slate-950/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="relative h-12 w-12 shrink-0">
          <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-sm font-black text-slate-500 group-hover:text-brand-primary transition-colors">
            {(row.name || row.salesperson).charAt(0)}
          </div>
          {isHighConsistency && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-950 animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate tracking-tight">{row.name || row.salesperson}</p>
            <p className="text-sm font-black font-sans text-slate-900 dark:text-white tracking-widest">{formatCompactNumber(row.totalQty || row.quantity)}</p>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-secondary rounded-full transition-all duration-1000 ease-in-out"
              style={{ width: `${Math.min(100, ((row.totalQty || row.quantity) / (maxQty || 1)) * 100)}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-slate-300 group-hover:text-brand-primary transition-colors">
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </div>

      {expanded && (
        <div className="p-6 bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-100 dark:border-slate-800 animate-slide-up space-y-5">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">{t('consistencyScore')}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-brand-primary rounded-full transition-all duration-700" style={{ width: `${consistencyScore}%` }} />
              </div>
              <span className="text-sm font-black text-slate-900 dark:text-white w-10 text-right">{consistencyScore}%</span>
            </div>
          </div>
          {row.growth_ratio != null && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">{t('growthVsLastPeriod')}</p>
              <span className={`text-sm font-black ${growthRatio >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {growthRatio >= 0 ? '+' : ''}{(growthRatio * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Leaderboard({ ranking, showInsight }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard
      title={t('salesPerformance')}
      subtitle={t('personnelRanking')}
      insight={t('analysisPersonnel')}
      showInsight={showInsight}
      className="col-span-1 lg:col-span-2 xl:col-span-1"
    >
      <div className="space-y-1">
        {ranking.slice(0, 5).map((row, i) => (
          <LeaderboardRow key={row.name || row.salesperson} row={row} i={i} maxQty={Math.max(...ranking.map(r => Number(r.totalQty || r.quantity || 0)), 1)} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

function MoneyOwedBanner({ outstandingExposure, estimatedGross, language }) {
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!outstandingExposure && !estimatedGross) return null;
  const ratio = estimatedGross > 0 ? (outstandingExposure / estimatedGross) : 0;
  const isCritical = ratio > 0.5;
  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl border-2 ${isCritical ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-800/40' : 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/40'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isCritical ? 'bg-rose-100 dark:bg-rose-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`}>
          <AlertCircle className={`h-6 w-6 ${isCritical ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`} />
        </div>
        <div>
          <p className={`text-xs font-bold ${isCritical ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>{t('moneyOwedToSuppliers')}</p>
          <p className={`text-2xl sm:text-3xl font-black font-sans ${isCritical ? 'text-rose-700 dark:text-rose-200' : 'text-amber-700 dark:text-amber-200'}`}>{formatINR(outstandingExposure)}</p>
        </div>
      </div>
      {estimatedGross > 0 && (
        <div className="text-right">
          <p className="text-xs font-bold text-slate-500">{t('totalStockValue')}</p>
          <p className="text-lg font-black text-slate-700 dark:text-slate-300">{formatINR(estimatedGross)}</p>
          <p className={`text-xs font-bold mt-1 ${isCritical ? 'text-rose-600' : 'text-amber-600'}`}>{(ratio * 100).toFixed(0)}% {t('unpaid')}</p>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const { user } = useAuthUser();
  const { accessRole, accessLoading, hasResolvedAccessOnce } = useStockAccess(user);
  const router = useRouter();
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
  const [showInsights, setShowInsights] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAuthorized = accessRole === 'admin' || accessRole === 'manager';

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
        const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load analytics');
        if (mounted) setAdminAnalytics(json);
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
  }, [user, analyticsRangeMonths, isAuthorized]);

  const [showSummary, setShowSummary] = useState(false);

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

  const divisionRisk = adminAnalytics?.inventoryHealth?.divisionRisk || [];
  const dispatchTrend = adminAnalytics?.dispatchPerformance?.trend || [];
  const costTrend = adminAnalytics?.costAndPayment?.trend || [];
  const salespersonRanking = adminAnalytics?.salespersonPerformance?.ranking || [];
  const inventoryKpis = adminAnalytics?.inventoryHealth?.kpis || {};
  const dispatchKpis = adminAnalytics?.dispatchPerformance?.kpis || {};
  const purchaseKpis = adminAnalytics?.purchasePerformance?.kpis || {};
  const exposure = adminAnalytics?.costAndPayment?.exposure || {};

  const overallTrend =
    dispatchTrend.length >= 2
      ? ((Number(dispatchTrend[dispatchTrend.length - 1]?.total || 0) - Number(dispatchTrend[dispatchTrend.length - 2]?.total || 0)) /
        Number(dispatchTrend[dispatchTrend.length - 2]?.total || 1)) *
      100
      : 0;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-12 space-y-12 lg:space-y-20 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
        <div className="space-y-4 max-w-4xl">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
            <Link href="/stock/admin" className="hover:text-brand-primary transition-colors">{t('operationalCore')}</Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">{t('businessIntelligence')}</span>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <h1 className="text-3xl sm:text-4xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              {t('executiveDashboard').split(' ')[0]}<br className="sm:hidden" /> {t('executiveDashboard').split(' ')[1]}
            </h1>
            <div className="flex items-center self-start sm:self-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-sm whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('liveContext')}
            </div>
          </div>
          <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            {t('operationalAnalysisIdentified')}{' '}
            <span className={`font-black ${overallTrend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {overallTrend >= 0 ? '+' : ''}{overallTrend.toFixed(1)}% {overallTrend >= 0 ? t('acceleration') : t('deceleration')}
            </span>{' '}
            {t('logisticsThroughputOver')} {analyticsRangeMonths} {t('monthsPortfolioStability')} <span className="font-black text-slate-900 dark:text-white underline decoration-brand-primary/30 decoration-8 underline-offset-4">{t('optimal')}</span>.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="flex items-center bg-slate-100/50 dark:bg-slate-900/30 p-1.5 rounded-[1.75rem] border border-slate-200 dark:border-white/5">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => setAnalyticsRangeMonths(m)}
                className={`flex-1 sm:flex-none px-6 py-3 text-xs font-black rounded-2xl transition-all duration-500 ${analyticsRangeMonths === m
                  ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-xl scale-[1.05] orange-glow'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                {m}M
              </button>
            ))}
          </div>
          <div className="flex flex-row justify-between sm:flex-row items-stretch sm:items-center gap-4">
            <button
              onClick={() => setShowInsights(!showInsights)}
              className={`flex items-center justify-center p-4 rounded-[1.5rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 hover:shadow-xl transition-all active:scale-95 group ${showInsights ? 'text-brand-primary' : 'text-slate-400'}`}
            >
              <Activity className="h-6 w-6" />
            </button>
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex items-center justify-center gap-3 px-4 py-4 rounded-[1.5rem] bg-brand-primary text-white text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-lg active:scale-95 hover:shadow-brand-primary/20"
            >
              <FileText className="h-5 w-5" />
              {t('summary')}
            </button>
          </div>
        </div>
      </header>

      <MoneyOwedBanner
        outstandingExposure={Number(exposure.outstanding_exposure || 0)}
        estimatedGross={Number(exposure.estimated_gross || 0)}
        language={language}
      />

      <section className="space-y-12">
        <div className="flex items-center gap-6">
          <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">I. {t('businessSnapshot')}</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
        </div>
        <StockHealthScorecard
          data={divisionRisk}
          inventoryKpis={inventoryKpis}
          onTimeRatio={dispatchKpis.onTimeRatio}
          approvalRate={purchaseKpis.approvalRate}
          outstandingExposure={Number(exposure.outstanding_exposure || 0)}
          showInsight={showInsights}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
          <div className="xl:col-span-8 space-y-8 lg:space-y-12">
            <SalesRevenueChart data={dispatchTrend} showInsight={showInsights} />
            <MonthlyCostVolumeChart dispatchTrend={dispatchTrend} costTrend={costTrend} showInsight={showInsights} />
          </div>
          <div className="xl:col-span-4 space-y-8 lg:space-y-12">
            <TopDivisionsChart data={divisionRisk} showInsight={showInsights} />
            <Leaderboard ranking={salespersonRanking} showInsight={showInsights} />
          </div>
        </div>
      </section>

      <section className="space-y-12">
        <div className="flex items-center gap-6">
          <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">II. {t('riskInventory')}</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
        </div>
        <AnalyticsCard
          title={t('riskInventory')}
          subtitle={t('divisionsNeedingAttention')}
          insight={t('analysisRisk')}
          showInsight={showInsights}
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
                      <td className="px-8 py-6 font-bold text-slate-900 dark:text-slate-100 text-xs">{d.division}</td>
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
                    <p className="text-sm font-black text-slate-900 dark:text-white">{d.division}</p>
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
