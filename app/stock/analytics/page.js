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
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6',
  card: 'glass-panel rounded-3xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-8 transition-all duration-500 hover:shadow-xl group/card bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/60 relative z-10 hover:z-50',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 dark:text-slate-400 group-hover/card:text-brand-primary transition-colors',
  value: 'mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-sans tracking-tight',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2 snap-x snap-mandatory overscroll-x-contain',
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
      <div className="relative w-full">
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
        className="relative h-72 lg:h-80 bg-slate-50/30 dark:bg-slate-900/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex items-end p-4 select-none"
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const nearest = points.reduce((prev, curr, i) => Math.abs(curr.x - x) < Math.abs(prev.x - x) ? { ...curr, i } : prev, { x: Infinity, i: null });
          if (nearest.i !== null && Math.abs(nearest.x - x) < 40) {
            setHoveredIndex(nearest.i);
          } else {
            setHoveredIndex(null);
          }
        }}
        onMouseLeave={() => setHoveredIndex(null)}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.touches[0].clientX - rect.left;
          const nearest = points.reduce((prev, curr, i) => Math.abs(curr.x - x) < Math.abs(prev.x - x) ? { ...curr, i } : prev, { x: Infinity, i: null });
          if (nearest.i !== null && Math.abs(nearest.x - x) < 40) {
            setHoveredIndex(nearest.i);
          } else {
            setHoveredIndex(null);
          }
        }}
        onTouchEnd={() => setHoveredIndex(null)}
      >
        <svg className="absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id="salesAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND_PRIMARY} stopOpacity="0.25" />
              <stop offset="100%" stopColor={BRAND_PRIMARY} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((t) => (
            <text key={`y-${t}`} x={pad.l - 8} y={pad.t + innerH * (1 - t) + 4} textAnchor="end" fontSize="10" className="fill-slate-400 font-bold">
              {formatCompactNumber(maxVal * t)}
            </text>
          ))}

          {points.map((p, i) => (
            <line key={`grid-${i}`} x1={p.x} x2={p.x} y1={pad.t} y2={height - pad.b} stroke="currentColor" className="text-slate-100 dark:text-slate-800/40" strokeDasharray="4 4" />
          ))}

          {hoveredIndex !== null && points[hoveredIndex] && (
            <line
              x1={points[hoveredIndex].x} x2={points[hoveredIndex].x}
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
                onTouchStart={() => setHoveredIndex(i)}
              />
              <text x={p.x} y={height - 15} textAnchor="middle" fontSize="10" className="fill-slate-400 font-black uppercase tracking-tighter">
                {(width > 500 || data.length <= 6 || i % 2 === 0) ? formatMonthLabel(p.d.month || p.d.bucket) : ''}
              </text>
            </g>
          ))}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="absolute z-50 pointer-events-none rounded-2xl bg-slate-900/95 backdrop-blur-md dark:bg-slate-800/95 text-white p-4 shadow-2xl animate-scale-in border border-white/10"
            style={{ left: points[hoveredIndex].x, top: Math.max(0, points[hoveredIndex].y - 80), transform: 'translate(-50%, -100%)' }}
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

  const topDivisions = [...data].sort((a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0)).slice(0, 5);
  const maxVal = Math.max(...topDivisions.map((d) => Number(d.total_revenue || 0)), 1);

  return (
    <AnalyticsCard
      title={t('divisionContribution')}
      subtitle={t('performanceByUnit')}
      insight={t('analysisDivision')}
      showInsight={showInsight}
    >
      <div className="space-y-6" ref={containerRef}>
        {topDivisions.map((d, i) => {
          const actualPercent = (Number(d.total_revenue || 0) / maxVal) * 100;
          const color = INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length];
          return (
            <div
              key={d.division || i}
              className="relative group cursor-default"
            >
              <div className="flex justify-between text-xs font-black mb-2 px-1">
                <span className="text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-[10px] group-hover:text-brand-primary transition-colors">{d.division || 'Unknown'}</span>
                <span className="font-sans text-slate-900 dark:text-white tracking-widest">{formatCompactINR(d.total_revenue)}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100/50 dark:bg-slate-800/30 rounded-full overflow-hidden border border-slate-200/20">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${actualPercent}%`, backgroundColor: color }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                </div>
              </div>
              <div className="flex justify-between mt-1 px-1">
                {d.top_item && (
                  <span className="text-[9px] text-slate-400 truncate max-w-[50%]" title={d.top_item}>
                    <span className="text-emerald-500 font-bold">Top:</span> {d.top_item} ({formatCompactINR(d.top_item_revenue)})
                  </span>
                )}
                {d.worst_item && d.worst_item !== d.top_item && (
                  <span className="text-[9px] text-slate-400 truncate max-w-[50%] text-right" title={d.worst_item}>
                    <span className="text-amber-500 font-bold">Low:</span> {d.worst_item} ({formatCompactINR(d.worst_item_revenue)})
                  </span>
                )}
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
        className="relative h-[280px] bg-slate-50/20 dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 p-6 select-none"
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMouseX(e.clientX - rect.left);
        }}
        onMouseLeave={() => { setMouseX(null); setHoveredIndex(null); }}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMouseX(e.touches[0].clientX - rect.left);
        }}
        onTouchEnd={() => { setMouseX(null); setHoveredIndex(null); }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
          {[0, 0.5, 1].map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={pad.t + innerH * (1 - t)}
                y2={pad.t + innerH * (1 - t)}
                stroke="currentColor"
                strokeDasharray="4 6"
                className="text-slate-200 dark:text-slate-800/60"
              />
              <text x={pad.l - 8} y={pad.t + innerH * (1 - t) + 4} textAnchor="end" fontSize="10" className="fill-slate-400 font-bold">
                {formatCompactNumber(maxVal * t)}
              </text>
            </g>
          ))}

          {chartData.map((d, i) => {
            const groupX = pad.l + (i + 0.5) * (innerW / chartData.length);
            const costH = ((d.inboundSqm || 0) / maxVal) * innerH;
            const soldH = ((d.outboundSqm || 0) / maxVal) * innerH;
            const costY = pad.t + innerH - costH;
            const soldY = pad.t + innerH - soldH;

            return (
              <g key={i} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} onTouchStart={() => setHoveredIndex(i)} className="cursor-pointer group">
                <rect x={groupX - barWidth - 4} y={costY} width={barWidth} height={costH} fill="#F43F5E" rx="6" className="transition-all duration-300 group-hover:brightness-125" fillOpacity="0.9" />
                <rect x={groupX + 4} y={soldY} width={barWidth} height={soldH} fill="#10B981" rx="6" className="transition-all duration-300 group-hover:brightness-125" fillOpacity="0.9" />
                <text x={groupX} y={height - 15} textAnchor="middle" fontSize="10" className="fill-slate-400 font-black uppercase tracking-widest">
                  {(width > 500 || chartData.length <= 6 || i % 2 === 0) ? formatMonthLabel(d.month || d.bucket) : ''}
                </text>
              </g>
            );
          })}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="absolute z-50 pointer-events-none rounded-[1.5rem] bg-slate-900/95 backdrop-blur-md dark:bg-slate-800/95 text-white p-4 shadow-2xl border border-white/10"
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

function LeaderboardRow({ row, i, maxVal }) {
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
          <div className={`absolute inset-0 rounded-2xl border shadow-sm flex items-center justify-center text-sm font-black transition-colors ${i === 0 ? 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-200 dark:border-yellow-700 text-yellow-600 dark:text-yellow-400' : i === 1 ? 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300' : i === 2 ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-500' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 group-hover:text-brand-primary'}`}>
            {i < 3 ? <Trophy className="h-5 w-5" /> : (row.name || row.salesperson).charAt(0)}
          </div>
          {isHighConsistency && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-950 animate-pulse" title="High Consistency Performer" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate tracking-tight">{row.name || row.salesperson}</p>
            <div className="text-right">
              <p className="text-sm font-black font-sans text-slate-900 dark:text-white tracking-widest leading-none mb-1">{formatCompactINR(row.revenue)}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">{formatCompactNumber(row.totalQty || row.quantity)} {t('units')}</p>
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-secondary rounded-full transition-all duration-1000 ease-in-out"
              style={{ width: `${Math.min(100, ((row.revenue || 0) / (maxVal || 1)) * 100)}%` }}
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
  const maxRev = Math.max(...ranking.map(r => Number(r.revenue || 0)), 1);
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
          <LeaderboardRow key={row.name || row.salesperson} row={row} i={i} maxVal={maxRev} />
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
  const { accessRole, accessLoading, hasResolvedAccessOnce, accessUser } = useStockAccess(user);
  const router = useRouter();
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [salespersonAnalytics, setSalespersonAnalytics] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
  const [showInsights, setShowInsights] = useState(true);
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
            <h1 className="text-5xl sm:text-7xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              <><span className="text-brand-primary"> {t('executiveDashboard').split(' ')[0]}</span><br className="sm:hidden" /> {t('executiveDashboard').split(' ')[1] || 'Dashboard'}</>
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
            <TopDivisionsChart data={divisionPerformance} showInsight={showInsights} />
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
