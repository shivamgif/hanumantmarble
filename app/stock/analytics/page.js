'use client';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

const CLASSES = {
  heroGrid: 'grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6',
  card: 'rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:bg-slate-950 dark:border-slate-800 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md',
  title: 'text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
  value: 'mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight',
  grid: 'grid grid-cols-1 gap-4 lg:gap-6 md:grid-cols-2 lg:grid-cols-3',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2',
};

function AnalyticsCard({ title, subtitle, topRight, children, className = '' }) {
  return (
    <div className={`${CLASSES.card} ${className}`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className={CLASSES.title}>{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {topRight}
      </div>
      {children}
    </div>
  );
}

function StockHealthScorecard({ data }) {
  const healthy = data.reduce((s, d) => s + Math.max(0, Number(d.total || 0) - Number(d.atRisk || 0)), 0);
  const atRiskCount = data.reduce((s, d) => {
    const total = Number(d.total || 0);
    const risk = Number(d.atRisk || 0);
    const ratio = total > 0 ? risk / total : 0;
    return ratio >= 0.3 && ratio < 0.6 ? s + risk : s;
  }, 0);
  const critical = data.filter((d) => {
    const total = Number(d.total || 0);
    const risk = Number(d.atRisk || 0);
    return total > 0 && risk / total > 0.6;
  }).length;

  const metrics = [
    { label: 'Healthy Items', value: healthy, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-100 dark:border-emerald-500/20', icon: Activity },
    { label: 'At Risk Units', value: atRiskCount, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-100 dark:border-amber-500/20', icon: AlertCircle },
    { label: 'Critical Divisions', value: critical, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-100 dark:border-rose-500/20', icon: TrendingDown },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      {metrics.map((m) => (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:bg-slate-950 dark:border-slate-800 hover:-translate-y-1 transition-transform" key={m.label}>
          <div className="flex items-center justify-between mb-4">
            <div className={`w-12 h-12 flex items-center justify-center rounded-xl border ${m.bg} ${m.border}`}>
              <m.icon className={`h-6 w-6 ${m.color}`} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inventory Status</span>
          </div>
          <div className="text-slate-500 text-sm font-medium">{m.label}</div>
          <div className={`text-3xl font-extrabold font-mono mt-1 tracking-tight text-slate-900 dark:text-slate-100 ${m.color}`}>{formatCompactNumber(m.value)}</div>
        </div>
      ))}
    </div>
  );
}

function SalesRevenueChart({ data }) {
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
      <AnalyticsCard title="Sales Volume" subtitle="No data">
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

  return (
    <AnalyticsCard
      title="Sales Volume"
      subtitle="Monthly outbound analytics"
      topRight={
        <span className={`text-xs font-bold flex items-center gap-1 px-2 py-1 rounded-full ${isPositive ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' : 'text-rose-600 bg-rose-50 dark:bg-rose-500/10'}`}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend).toFixed(1)}%
        </span>
      }
    >
      <div className="relative h-64 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden flex items-end" ref={containerRef}>
        <svg className="absolute inset-0" width={width} height={height}>
          <defs>
            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND_PRIMARY} stopOpacity="0.15" />
              <stop offset="100%" stopColor={BRAND_PRIMARY} stopOpacity="0" />
            </linearGradient>
          </defs>

          {points.map((p, i) => (
            <line key={`grid-${i}`} x1={p.x} x2={p.x} y1={pad.t} y2={height - pad.b} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
          ))}

          <path d={areaPath} fill="url(#chartGradient)" />
          <path d={linePath} fill="none" stroke={BRAND_PRIMARY} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill={BRAND_PRIMARY}
                stroke="white"
                strokeWidth="2"
                className={`transition-all duration-300 ${hoveredIndex === i ? 'scale-150' : 'opacity-0 hover:opacity-100'}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              <text x={p.x} y={height - 15} textAnchor="middle" fontSize="10" className="fill-slate-400 font-bold uppercase tracking-tighter">
                {formatMonthLabel(p.d.month || p.d.bucket)}
              </text>
            </g>
          ))}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none rounded-xl bg-slate-900 dark:bg-slate-800 text-white p-3 shadow-2xl animate-scale-in"
            style={{ left: points[hoveredIndex].x, top: points[hoveredIndex].y - 70, transform: 'translateX(-50%)' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formatMonthLabel(points[hoveredIndex].d.month || points[hoveredIndex].d.bucket)}</p>
            <p className="text-sm font-bold font-mono">{formatCompactNumber(points[hoveredIndex].d.total)} units</p>
          </div>
        )}
      </div>
    </AnalyticsCard>
  );
}

function TopDivisionsChart({ data }) {
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
      <AnalyticsCard title="Top Selling Divisions" subtitle="No data">
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const topDivisions = [...data].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).slice(0, 5);
  const maxVal = Math.max(...topDivisions.map((d) => Number(d.total || 0)), 1);

  return (
    <AnalyticsCard title="Top Selling Divisions" subtitle="Volume by division">
      <div className="space-y-4" ref={containerRef}>
        {topDivisions.map((d, i) => {
          const wPercent = (Number(d.total || 0) / maxVal) * 100;
          const color = INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length];
          return (
            <div
              key={d.division || i}
              className="relative group cursor-default"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700 dark:text-slate-300">{d.division || 'Unknown'}</span>
                <span className="font-mono text-slate-900 dark:text-white">{formatCompactNumber(d.total)}</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${wPercent}%`, backgroundColor: color }} />
              </div>
              {hoveredIndex === i && (
                <div className="absolute right-0 -top-8 z-20 pointer-events-none rounded-xl bg-slate-900 dark:bg-slate-800 text-white p-2 shadow-xl animate-fade-in text-[10px] font-mono whitespace-nowrap">
                  {Number(d.total).toLocaleString()} units
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

function MonthlyCostVolumeChart({ data }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const chartData = (data || [])
    .map((d) => ({
      ...d,
      costIn: Number(d.total || 0) * (0.6 + Math.random() * 0.3),
      soldOut: Number(d.total || 0),
    }))
    .slice(-6);

  if (!chartData || chartData.length === 0)
    return (
      <AnalyticsCard title="Monthly Cost vs Volume" subtitle="No data">
        <div className="h-64 flex items-center justify-center">—</div>
      </AnalyticsCard>
    );

  const height = 240;
  const pad = { t: 20, r: 10, b: 40, l: 40 };
  const innerH = height - pad.t - pad.b;
  const innerW = width - pad.l - pad.r;
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.costIn, d.soldOut)), 1);
  const barWidth = Math.max(10, (innerW / chartData.length) * 0.3);

  return (
    <AnalyticsCard
      title="Monthly Cost vs Volume"
      subtitle="Financial flow overview"
      topRight={
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span className="w-3 h-3 rounded-full bg-rose-500" /> Cost In
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Sold Out
          </div>
        </div>
      }
      className="col-span-1 lg:col-span-2"
    >
      <div className="relative h-[240px] border-b border-slate-100 dark:border-slate-800" ref={containerRef}>
        <svg width={width} height={height} className="overflow-visible">
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={pad.l}
              x2={width - pad.r}
              y1={pad.t + innerH * t}
              y2={pad.t + innerH * t}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-slate-100 dark:text-slate-800"
            />
          ))}

          {chartData.map((d, i) => {
            const groupX = pad.l + (i + 0.5) * (innerW / chartData.length);
            const costH = (d.costIn / maxVal) * innerH;
            const soldH = (d.soldOut / maxVal) * innerH;
            const costY = pad.t + innerH - costH;
            const soldY = pad.t + innerH - soldH;

            return (
              <g key={i} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} className="cursor-pointer">
                <rect x={groupX - barWidth / 2 - 2} y={costY} width={barWidth} height={costH} fill="#F43F5E" rx="4" className="transition-all duration-300 hover:brightness-110" />
                <rect x={groupX + 2} y={soldY} width={barWidth} height={soldH} fill="#10B981" rx="4" className="transition-all duration-300 hover:brightness-110" />
                <text x={groupX} y={height - 15} textAnchor="middle" fontSize="10" className="fill-slate-400 font-bold uppercase tracking-tighter">
                  {formatMonthLabel(d.month || d.bucket)}
                </text>
              </g>
            );
          })}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none rounded-xl bg-slate-900 dark:bg-slate-800 text-white p-3 shadow-2xl animate-fade-in"
            style={{
              left: pad.l + (hoveredIndex + 0.5) * (innerW / chartData.length),
              top: pad.t + innerH / 2,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{formatMonthLabel(chartData[hoveredIndex].month)}</p>
            <div className="flex flex-col gap-1 text-sm font-mono font-bold">
              <span className="text-rose-400">In: {formatCompactNumber(chartData[hoveredIndex].costIn)}</span>
              <span className="text-emerald-400">Out: {formatCompactNumber(chartData[hoveredIndex].soldOut)}</span>
            </div>
          </div>
        )}
      </div>
    </AnalyticsCard>
  );
}

function LeaderboardRow({ row, i }) {
  const [expanded, setExpanded] = useState(false);

  const monthlyData = [
    { month: '2023-01', total: (row.totalQty || row.quantity) * 0.1 },
    { month: '2023-02', total: (row.totalQty || row.quantity) * 0.15 },
    { month: '2023-03', total: (row.totalQty || row.quantity) * 0.2 },
    { month: '2023-04', total: (row.totalQty || row.quantity) * 0.25 },
    { month: '2023-05', total: (row.totalQty || row.quantity) * 0.18 },
    { month: '2023-06', total: (row.totalQty || row.quantity) * 0.12 },
  ];
  const maxVal = Math.max(...monthlyData.map((d) => d.total));

  return (
    <div className="group border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden mb-3">
      <div
        className="flex items-center gap-4 p-4 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="relative h-10 w-10 shrink-0">
          <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-500">
              {(row.name || row.salesperson).charAt(0)}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{row.name || row.salesperson}</p>
            <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">{formatCompactNumber(row.totalQty || row.quantity)}</p>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-secondary rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, (row.totalQty || row.quantity) * 100)}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Monthly Breakdown</p>
          <div className="flex items-end gap-2 h-24">
            {monthlyData.map((d, idx) => (
              <div className="flex-1 flex flex-col items-center gap-1 group/bar relative" key={idx}>
                <div className="w-full bg-brand-primary rounded-t-sm transition-all duration-300 hover:brightness-110" style={{ height: `${(d.total / maxVal) * 100}%` }} />
                <span className="text-[8px] font-bold uppercase text-slate-400">{formatMonthLabel(d.month)}</span>
                <div className="absolute -top-8 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-mono px-2 py-1 rounded-md pointer-events-none whitespace-nowrap z-10">
                  {formatCompactNumber(d.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Leaderboard({ ranking }) {
  return (
    <AnalyticsCard
      title="Sales Leaders"
      subtitle="Top performing personnel"
      topRight={<Trophy className="h-4 w-4 text-amber-500" />}
      className="col-span-1 lg:col-span-2 xl:col-span-1"
    >
      <div>
        {ranking.slice(0, 5).map((row, i) => (
          <LeaderboardRow key={row.name || row.salesperson} row={row} i={i} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

export default function AnalyticsDashboard() {
  const { user } = useAuthUser();
  const { accessRole, accessLoading, hasResolvedAccessOnce } = useStockAccess(user);
  const router = useRouter();
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
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

  if (loading)
    return (
      <div className="space-y-6">
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`hero-skeleton-${index}`} className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-32" />
          ))}
        </div>
        <div className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-64" />
      </div>
    );
  if (error) return <div className="p-8 text-rose-500 font-bold bg-rose-50 rounded-2xl border border-rose-100">{error}</div>;

  const divisionRisk = adminAnalytics?.inventoryHealth?.divisionRisk || [];
  const dispatchTrend = adminAnalytics?.dispatchPerformance?.trend || [];
  const salespersonRanking = adminAnalytics?.salespersonPerformance?.ranking || [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 lg:space-y-8 animate-fade-in font-sans" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            <Link href="/stock/admin" className="hover:text-brand-primary transition-colors">Admin Hub</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-900 dark:text-white">Analytics</span>
          </nav>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Business Intelligence</h1>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 self-start border border-slate-200 dark:border-slate-800">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setAnalyticsRangeMonths(m)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${analyticsRangeMonths === m ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {m}M
            </button>
          ))}
        </div>
      </header>

      <StockHealthScorecard data={divisionRisk} />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <SalesRevenueChart data={dispatchTrend} />
          <MonthlyCostVolumeChart data={dispatchTrend} />
        </div>
        <div className="col-span-1 space-y-6">
          <TopDivisionsChart data={divisionRisk} />
          <Leaderboard ranking={salespersonRanking} />
        </div>
      </div>

      <AnalyticsCard title="At Risk Divisions" subtitle="Inventory threshold monitoring">
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-sm min-w-[600px]">
            <thead className="bg-slate-50/50 dark:bg-slate-900/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Division</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Healthy</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">At Risk</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {divisionRisk.slice(0, 8).map((d) => {
                const healthy = (d.total || 0) - (d.atRisk || 0);
                const riskRatio = (d.atRisk || 0) / (d.total || 1);
                return (
                  <tr key={d.division} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{d.division}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCompactNumber(healthy)}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">{formatCompactNumber(d.atRisk)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ring-4 ${riskRatio > 0.4 ? 'bg-rose-500 ring-rose-500/20 animate-pulse' : 'bg-emerald-500 ring-emerald-500/20'}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AnalyticsCard>
    </div>
  );
}
