'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import {
  AnalyticsCard,
  ChartTooltip,
  TrendCapsule,
  EmptyState,
  CHART_ORANGE,
  INDUSTRIAL_COLORS,
  SERIES_COLORS,
  formatMonthLabel,
  formatCompactNumber,
  formatCompactINR,
} from '../../components/dashboard-ui';

export function SalesRevenueChart({ data, partial = false }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  if (!data || data.length === 0)
    return (
      <AnalyticsCard title={t('salesVolume')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center"><EmptyState label={t('noData')} className="w-full max-w-xs border-none bg-transparent" /></div>
      </AnalyticsCard>
    );

  const chartData = data.map((d, i) => ({
    month: formatMonthLabel(d.month || d.bucket) + (partial && i === data.length - 1 ? '*' : ''),
    total: Number(d.total || 0),
  }));

  // The last bucket is the month we are standing in, so comparing it against a
  // full prior month always reads as a fall. Trend and peak both use complete
  // months only; the partial bucket still draws, marked with an asterisk.
  const complete = partial ? data.slice(0, -1) : data;
  const trend =
    complete.length >= 2
      ? ((Number(complete[complete.length - 1].total || 0) - Number(complete[complete.length - 2].total || 0)) /
        Number(complete[complete.length - 2].total || 1)) *
      100
      : 0;
  const isPositive = trend >= 0;

  const peakPool = complete.length > 0 ? complete : data;
  const peak = peakPool.reduce((best, d) => (Number(d.total || 0) > Number(best.total || 0) ? d : best), peakPool[0]);
  const peakLabel = peak ? `${t('highestActivity')}: ${formatCompactNumber(peak.total)} ${t('unitsIn')} ${formatMonthLabel(peak.month || peak.bucket)}` : null;
  const contextBar = partial ? `${peakLabel} · ${t('partialMonthNote')}` : peakLabel;

  return (
    <AnalyticsCard
      title={t('activityTrend')}
      subtitle={t('monthlyOutboundVolume')}
      contextBar={contextBar}
      topRight={<TrendCapsule value={trend} isPositive={isPositive} />}
    >
      <div className="h-72 lg:h-80 rounded-xl border border-border/60 bg-muted/20 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={CHART_ORANGE} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART_ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-800" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactNumber} width={40} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => `${formatCompactNumber(v)} ${t('dispatchesUnit')}`} />} />
            <Area type="monotone" dataKey="total" name={t('dispatchesUnit')} stroke={CHART_ORANGE} strokeWidth={2} fill="url(#salesArea)" dot={false} activeDot={{ r: 6, stroke: 'rgb(var(--card))', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

export function TopDivisionsChart({ data }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  if (!data || data.length === 0)
    return (
      <AnalyticsCard title={t('topSellingDivisions')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center"><EmptyState label={t('noData')} className="w-full max-w-xs border-none bg-transparent" /></div>
      </AnalyticsCard>
    );

  const topDivisions = [...data].sort((a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0)).slice(0, 5);
  // Share is of every division, not just the five shown, so a top-five list
  // cannot imply it is the whole business.
  const totalRev = data.reduce((s, d) => s + Number(d.total_revenue || 0), 0) || 1;
  const shownRev = topDivisions.reduce((s, d) => s + Number(d.total_revenue || 0), 0);
  const otherRev = Math.max(0, totalRev - shownRev);
  const pieData = topDivisions.map((d, i) => ({
    name: d.division || t('unknown'),
    value: Number(d.total_revenue || 0),
    color: INDUSTRIAL_COLORS[i % INDUSTRIAL_COLORS.length],
  }));
  if (otherRev > 0) {
    pieData.push({ name: t('otherDivisions'), value: otherRev, color: '#94a3b8' });
  }

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
              <span className="font-medium text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">{d.division || t('unknown')}</span>
              <span className="font-sans font-bold text-slate-900 dark:text-white tracking-wider">{formatCompactINR(d.total_revenue)}</span>
              <span className="text-[11px] font-bold text-slate-400 w-10 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

export function MonthlyCostVolumeChart({ dispatchTrend, inboundTrend, partial = false }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  const chartData = useMemo(() => {
    const byMonth = {};
    (inboundTrend || []).forEach((d) => {
      const k = d.bucket || d.month;
      if (!k) return;
      byMonth[k] = { ...byMonth[k], month: k, inboundValue: Number(d.inbound_value || 0) };
    });
    (dispatchTrend || []).forEach((d) => {
      const k = d.bucket || d.month;
      if (!k) return;
      byMonth[k] = { ...byMonth[k], month: k, outboundValue: Number(d.revenue || 0) };
    });
    const ordered = Object.values(byMonth)
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-6);
    return ordered.map((d, i) => ({
      month: formatMonthLabel(d.month) + (partial && i === ordered.length - 1 ? '*' : ''),
      inbound: d.inboundValue || 0,
      outbound: d.outboundValue || 0,
    }));
  }, [inboundTrend, dispatchTrend, partial]);

  if (!chartData || chartData.length === 0)
    return (
      <AnalyticsCard title={t('flowAnalysis')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center"><EmptyState label={t('noData')} className="w-full max-w-xs border-none bg-transparent" /></div>
      </AnalyticsCard>
    );

  return (
    <AnalyticsCard
      title={t('businessFlow')}
      subtitle={t('inboundOutboundMatch')}
      contextBar={partial ? t('partialMonthNote') : null}
      topRight={
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-card px-3 py-1.5 rounded-full border border-border">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> {t('inbound')}
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-card px-3 py-1.5 rounded-full border border-border">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {t('outbound')}
          </div>
        </div>
      }
    >
      <div className="h-[280px] rounded-xl border border-border/60 bg-muted/20 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-800" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactINR} width={56} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => formatCompactINR(v)} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="inbound" name={t('inbound')} fill="#F43F5E" radius={[4, 4, 0, 0]} />
            <Bar dataKey="outbound" name={t('outbound')} fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

export function MonthlyProfitChart({ data, partial = false }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  const rows = data || [];
  const chartData = rows.map((d, i) => ({
    month: formatMonthLabel(d.bucket || d.month) + (partial && i === rows.length - 1 ? '*' : ''),
    revenue: Number(d.revenue || 0),
    profit: Number(d.profit || 0),
  }));

  if (chartData.length === 0)
    return (
      <AnalyticsCard title={t('profitPerMonth')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center"><EmptyState label={t('noData')} className="w-full max-w-xs border-none bg-transparent" /></div>
      </AnalyticsCard>
    );

  // Margin is measured against the revenue that could be costed. Revenue from
  // items with no recorded purchase cost is called out separately rather than
  // being counted as pure profit.
  const latestRow = rows[rows.length - 1] || {};
  const latest = chartData[chartData.length - 1];
  const costedRevenue = Number(latestRow.costed_revenue ?? latestRow.revenue ?? 0);
  const uncostedRevenue = Number(latestRow.uncosted_revenue || 0);
  const marginPct = costedRevenue > 0 ? (Number(latestRow.profit || 0) / costedRevenue) * 100 : 0;
  const contextBar = [
    `${latest.month}${partial ? ` (${t('partialMonth')})` : ''}: ${formatCompactINR(latest.profit)} ${t('profit')} · ${marginPct.toFixed(1)}% ${t('margin')}`,
    uncostedRevenue > 0 ? `${formatCompactINR(uncostedRevenue)} ${t('uncostedRevenue')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <AnalyticsCard
      title={t('profitPerMonth')}
      subtitle={t('profitSubtitle')}
      contextBar={contextBar}
      topRight={
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-card px-3 py-1.5 rounded-full border border-border">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> {t('revenue')}
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-card px-3 py-1.5 rounded-full border border-border">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> {t('profit')}
          </div>
        </div>
      }
    >
      <div className="h-[280px] rounded-xl border border-border/60 bg-muted/20 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-800" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactINR} width={56} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => formatCompactINR(v)} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="revenue" name={t('revenue')} fill="#2563EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit" name={t('profit')} fill="#059669" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

export function SalespersonTrendChart({ trend }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  const { chartData, people } = useMemo(() => {
    const totals = {};
    (trend || []).forEach((r) => {
      totals[r.salesperson] = (totals[r.salesperson] || 0) + Number(r.total_revenue || 0);
    });
    const people = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    const byMonth = {};
    (trend || []).forEach((r) => {
      const k = r.bucket || r.month;
      if (!k) return;
      if (!byMonth[k]) {
        byMonth[k] = { month: k };
        people.forEach((p) => { byMonth[k][p] = 0; });
      }
      if (people.includes(r.salesperson)) byMonth[k][r.salesperson] = Number(r.total_revenue || 0);
    });
    const chartData = Object.values(byMonth)
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .map((d) => ({ ...d, month: formatMonthLabel(d.month) }));
    return { chartData, people };
  }, [trend]);

  if (chartData.length === 0)
    return (
      <AnalyticsCard title={t('salespersonMonthly')} subtitle={t('noData')}>
        <div className="h-64 flex items-center justify-center"><EmptyState label={t('noData')} className="w-full max-w-xs border-none bg-transparent" /></div>
      </AnalyticsCard>
    );

  return (
    <AnalyticsCard title={t('salespersonMonthly')} subtitle={t('salespersonMonthlySubtitle')}>
      <div className="h-[280px] rounded-xl border border-border/60 bg-muted/20 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-800" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactINR} width={56} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => formatCompactINR(v)} />} />
            {people.map((p, i) => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                name={p}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, stroke: 'rgb(var(--card))', strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-1">
        {people.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            <span className="truncate max-w-[10rem]">{p}</span>
          </span>
        ))}
      </div>
    </AnalyticsCard>
  );
}

// Days of stock left below which a best seller is flagged. ponytail: flat
// thresholds; per-item lead times would be the upgrade if suppliers differ a lot.
const DAYS_LEFT_URGENT = 15;
const DAYS_LEFT_SOON = 30;

export function TopSellersWidget({ items }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!items || items.length === 0) {
    return (
      <AnalyticsCard title={t('topSellers')} subtitle={t('topSellersSubtitle')}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }
  const totalItems = Number(items[0]?.total_items_with_sales || items.length);
  const top80Count = Number(items[0]?.rank_at_80 || 0);
  const maxRev = Number(items[0]?.revenue || 1);
  const headCell = 'text-xs font-medium text-slate-400';
  const cols = 'md:grid md:grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4';
  return (
    <AnalyticsCard
      title={t('topSellers')}
      subtitle={t('topSellersSubtitle')}
      contextBar={top80Count > 0 ? `${top80Count} ${t('ofLabel')} ${totalItems} ${t('itemsEqual80')}` : null}
    >
      <div className={`hidden ${cols} px-1 pb-2 border-b border-border/60`}>
        <span />
        <span className={headCell}>{t('item')}</span>
        <span className={headCell}>{t('revenue')}</span>
        <span className={`${headCell} text-right`}>{t('sold')}</span>
        <span className={`${headCell} text-right`}>{t('profit')}</span>
        <span className={`${headCell} text-right`}>{t('stockLeft')}</span>
      </div>
      <div className="max-h-[32rem] overflow-y-auto pr-1">
        {items.map((it) => {
          const revenue = Number(it.revenue || 0);
          const profit = Number(it.gross_profit || 0);
          const margin = it.margin_pct != null ? Number(it.margin_pct) : null;
          const daysLeft = it.days_left != null ? Number(it.days_left) : null;
          const daysTone = daysLeft == null
            ? 'text-slate-400'
            : daysLeft <= DAYS_LEFT_URGENT
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
              : daysLeft <= DAYS_LEFT_SOON
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400';
          return (
            <div key={it.id} className={`${cols} grid grid-cols-2 gap-x-3 gap-y-1.5 py-2.5 px-1 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0`}>
              <span className="hidden md:block text-xs font-bold text-slate-400 text-right tabular-nums">{it.rank}.</span>
              <div className="col-span-2 md:col-span-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={it.name}>
                  <span className="md:hidden text-slate-400 tabular-nums">{it.rank}. </span>{it.name}
                </p>
                <p className="text-[11px] font-bold text-slate-400 truncate">{it.division}{it.sku ? ` · ${it.sku}` : ''}</p>
              </div>
              <div className="col-span-2 md:col-span-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{formatCompactINR(revenue)}</span>
                  <span className="text-[11px] font-bold text-slate-400">{Number(it.share_pct || 0).toFixed(1)}% {t('ofSales')}</span>
                </div>
                <div className="mt-1 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-secondary rounded-full" style={{ width: `${Math.min(100, (revenue / maxRev) * 100)}%` }} />
                </div>
              </div>
              <div className="md:text-right tabular-nums">
                <span className="md:hidden text-xs font-medium text-slate-400">{t('sold')} </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{formatCompactNumber(it.units)}</span>
              </div>
              <div className="text-right tabular-nums">
                <p className={`text-xs font-bold ${profit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  <span className="md:hidden text-xs text-slate-400">{t('profit')} </span>
                  {formatCompactINR(profit)}
                </p>
                {margin != null ? <p className="text-[11px] font-bold text-slate-400">{margin.toFixed(1)}% {t('margin')}</p> : null}
              </div>
              <div className="col-span-2 md:col-span-1 flex items-center justify-between md:justify-end gap-2 tabular-nums">
                <span className="text-[11px] font-bold text-slate-400">{formatCompactNumber(it.in_stock)} {t('onHandShort')}</span>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${daysTone}`}>
                  {daysLeft != null ? `${daysLeft}${t('daysShort')}` : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}
