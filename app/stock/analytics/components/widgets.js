'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  TrendingDown,
  AlertCircle,
  Clock,
  Package,
  Hourglass,
  X,
  PackageX,
  Archive,
  Check,
  Loader2,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  AnalyticsCard,
  ChartTooltip,
  CsvExportButton,
  EmptyState,
  TrendCapsule,
  CHART_ORANGE,
  INDUSTRIAL_COLORS,
  paceAdjustedTarget,
  formatRelativeTime,
  formatMonthLabel,
  formatCompactNumber,
  formatCompactINR,
  formatHours,
} from '../../components/dashboard-ui';
import { deriveSpotlight } from '../lib/spotlight.mjs';

export function StockHealthScorecard({ data, stockRisk, approvalOps }) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((m) => (
        <div className="glass-panel rounded-2xl p-5 sm:p-6 relative overflow-hidden transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover group" key={m.label}>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className={`w-16 h-16 flex items-center justify-center rounded-xl border ${m.bg} ${m.border}`}>
                <m.icon className={`h-8 w-8 ${m.color}`} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-slate-500 dark:text-slate-400 text-sm font-bold">{m.label}</div>
              <div className={`text-3xl sm:text-4xl lg:text-5xl font-black font-sans tracking-tighter text-slate-900 dark:text-white leading-none`}>{m.value}</div>
              <div className="text-xs font-medium text-slate-400 mt-3">{m.subValue}</div>
            </div>
          </div>
          <div className={`absolute -right-6 -bottom-6 w-40 h-40 opacity-[0.04] transition-opacity duration-200 pointer-events-none group-hover:opacity-[0.08]`}>
            <m.icon className="w-full h-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroCallouts({ stockedOut, approvalsWaiting, oldestPendingHours, salespeopleBehindPace, onNavigate }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const pills = [
    {
      icon: PackageX,
      value: stockedOut,
      label: t('stockedOut'),
      tone: stockedOut > 0 ? 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      tab: 'overview',
      target: 'widget-reorder',
    },
    {
      icon: Hourglass,
      value: approvalsWaiting,
      label: t('approvalsWaiting'),
      hint: approvalsWaiting > 0 ? `${formatHours(oldestPendingHours)} ${t('oldestPending')}` : null,
      tone: approvalsWaiting > 10 ? 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' : approvalsWaiting > 0 ? 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      tab: 'overview',
      target: 'widget-pending',
    },
    {
      icon: TrendingDown,
      value: salespeopleBehindPace,
      label: t('salespeopleBehindPace'),
      tone: salespeopleBehindPace > 0 ? 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      tab: 'team',
      target: 'widget-pace',
    },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {pills.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onNavigate?.(p.tab, p.target)}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-shadow duration-200 hover:shadow-card focus-ring ${p.tone}`}
        >
          <p.icon className="h-4 w-4" />
          <span className="tabular-nums text-base">{p.value}</span>
          <span>{p.label}</span>
          {p.hint ? <span className="opacity-70 text-[10px]">· {p.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Individual salesperson view. Derived entirely from the payload the Team tab
// already has: salespersonTrend carries every salesperson x month row (no LIMIT),
// so no extra fetch is needed to scope down to one person.
export function SalespersonSpotlight({ trend, ranking, goals, selected, onSelect, months }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  const { roster, active, series, totals, rank, outOf, rankRow, goalRow } = useMemo(
    () => deriveSpotlight(trend, ranking, goals, selected),
    [trend, ranking, goals, selected]
  );

  if (roster.length === 0) {
    return (
      <AnalyticsCard title={t('spotlightTitle')} subtitle={t('spotlightSubtitle')}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }

  const growthRatio = rankRow?.growth_ratio != null ? Number(rankRow.growth_ratio) : null;
  const consistency = rankRow?.consistency_score != null ? Number(rankRow.consistency_score) : null;
  const goal = Number(goalRow?.goal || 0);
  const goalActual = Number(goalRow?.actual || 0);
  const goalPct = goal > 0 ? (goalActual / goal) * 100 : 0;
  const expected = paceAdjustedTarget(goal);
  const expectedPct = goal > 0 ? (expected / goal) * 100 : 0;
  const behindPace = goalActual < expected;

  const stats = [
    { label: t('revenue'), value: formatCompactINR(totals.revenue) },
    { label: t('units'), value: formatCompactNumber(totals.qty) },
    { label: t('dispatchesShort'), value: formatCompactNumber(totals.shipments) },
    { label: t('consistencyScore'), value: consistency != null ? Math.round(consistency) : '—' },
  ];

  return (
    <AnalyticsCard
      title={t('spotlightTitle')}
      subtitle={t('spotlightSubtitle')}
      contextBar={`${months}M · ${rank != null ? `${t('rank')} ${rank} ${t('ofLabel')} ${outOf}` : t('noData')}`}
      topRight={
        <label className="flex items-center gap-2">
          <span className="sr-only">{t('selectSalesperson')}</span>
          <select
            value={active || ''}
            onChange={(e) => onSelect?.(e.target.value)}
            className="max-w-[14rem] rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus-ring"
          >
            {roster.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <p className="text-lg font-black tracking-tight text-slate-900 dark:text-white truncate">{active}</p>
        {growthRatio != null ? <TrendCapsule value={growthRatio * 100} isPositive={growthRatio >= 0} /> : null}
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('growthVsLastPeriod')}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="mt-1 text-lg font-black font-sans tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {goal > 0 ? (
        <div className="space-y-1 mb-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('salesPace')}</span>
            <span className={`text-xs font-black tabular-nums ${behindPace ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {Math.round(goalPct)}%{behindPace ? ` · ${t('behindPace')}` : ''}
            </span>
          </div>
          <div className="relative h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`absolute top-0 left-0 h-full rounded-full ${behindPace ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, goalPct)}%` }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-slate-900 dark:bg-slate-100 opacity-60"
              style={{ left: `${Math.min(100, expectedPct)}%` }}
              title={`${t('expectedPace')} ${Math.round(expectedPct)}%`}
            />
          </div>
          <p className="text-[10px] font-bold text-slate-400 tabular-nums">
            {formatCompactINR(goalActual)} / {formatCompactINR(goal)} · {t('expectedPace')} {formatCompactINR(expected)}
          </p>
        </div>
      ) : (
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('noGoal')}</p>
      )}

      {series.length === 0 ? (
        <EmptyState label={t('noData')} />
      ) : (
        <div className="h-[220px] rounded-xl border border-border/60 bg-muted/20 p-4">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <LineChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-800" />
              <XAxis dataKey="bucket" tickFormatter={formatMonthLabel} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatCompactINR} width={56} />
              <RechartsTooltip content={<ChartTooltip formatter={(v) => formatCompactINR(v)} labelFormatter={formatMonthLabel} />} />
              <Line
                type="monotone"
                dataKey="revenue"
                name={t('revenue')}
                stroke={CHART_ORANGE}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_ORANGE, strokeWidth: 0 }}
                activeDot={{ r: 6, stroke: 'rgb(var(--card))', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsCard>
  );
}

function LeaderboardRow({ row, i, maxVal, onSelect, isSelected }) {
  const growthRatio = row.growth_ratio != null ? Number(row.growth_ratio) : null;
  const name = row.salesperson || row.name;
  // Row is a button only when the parent wired a handler, same as PendingQueueWidget.
  const Wrapper = onSelect ? 'button' : 'div';
  const interactiveProps = onSelect
    ? { type: 'button', onClick: () => onSelect(name) }
    : {};

  return (
    <Wrapper
      {...interactiveProps}
      className={`flex w-full items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0 ${onSelect ? 'text-left cursor-pointer focus-ring' : ''} ${isSelected ? 'bg-brand-primary/5 ring-1 ring-brand-primary/40 rounded-lg px-2 -mx-2 border-b-transparent' : ''}`}
    >
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
    </Wrapper>
  );
}

export function Leaderboard({ ranking, months, onSelect, selected }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const maxRev = Math.max(...ranking.map(r => Number(r.revenue || 0)), 1);
  return (
    <AnalyticsCard
      title={t('salesPerformance')}
      subtitle={t('personnelRanking')}
      topRight={<CsvExportButton type="leaderboard" months={months} label={t('exportCsv')} />}
    >
      <div>
        {ranking.slice(0, 8).map((row, i) => (
          <LeaderboardRow
            key={row.name || row.salesperson}
            row={row}
            i={i}
            maxVal={maxRev}
            onSelect={onSelect}
            isSelected={selected != null && selected === (row.salesperson || row.name)}
          />
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function ReorderNowWidget({ items, months }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard
      title={t('reorderNow')}
      subtitle={t('reorderSubtitle')}
      topRight={items.length > 0 ? <CsvExportButton type="reorder" months={months} label={t('exportCsv')} /> : null}
    >
      {items.length === 0 ? (
        <EmptyState label={t('noData')} />
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

export function DeadStockWidget({ data, months }) {
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
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-black font-sans text-slate-900 dark:text-white tabular-nums leading-none">{count}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t('items')}</p>
          </div>
          <div>
            <p className="text-2xl font-black font-sans text-slate-900 dark:text-white tabular-nums leading-none">{formatCompactNumber(units)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t('unitsIdle')}</p>
          </div>
          {value > 0 ? (
            <div>
              <p className="text-xl font-black font-sans text-slate-900 dark:text-white tabular-nums leading-none">{formatCompactINR(value)}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t('capitalIdle')}</p>
            </div>
          ) : null}
        </div>
      </div>
    </AnalyticsCard>
  );
}

export function PendingQueueWidget({ items, onApprove, onReject, actionLoading }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard title={t('pendingQueueTitle')} subtitle={t('pendingQueueSubtitle')}>
      {items.length === 0 ? (
        <EmptyState label={t('noData')} />
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading || !onApprove}
                        onClick={() => onApprove?.(item)}
                        className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all disabled:opacity-50 focus-ring"
                      >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('approve')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading || !onReject}
                        onClick={() => onReject?.(item)}
                        className="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-all disabled:opacity-50 focus-ring"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('reject')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnalyticsCard>
  );
}

export function SalesPaceWidget({ rows }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!rows || rows.length === 0) {
    return (
      <AnalyticsCard title={t('salesPace')} subtitle={t('salesPaceSubtitle')}>
        <EmptyState label={t('noData')} />
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
      contextBar={`${t('dayLabel')} ${day} ${t('ofLabel')} ${total} · ${t('expectedPace')} ${pacePct}%`}
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
                  title={`${t('expectedPace')} ${Math.round(expectedPct)}%`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 tabular-nums">
                <span>{formatCompactINR(actual)} / {formatCompactINR(goal)}</span>
                <span>{row.shipments} {t('dispatchesShort')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

export function CustomerConcentrationWidget({ rows }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!rows || rows.length === 0) {
    return (
      <AnalyticsCard title={t('topCustomers')} subtitle={t('concentrationSubtitle')}>
        <EmptyState label={t('noData')} />
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

export function ActivityFeedWidget({ events }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!events || events.length === 0) {
    return (
      <AnalyticsCard title={t('activityFeed')} subtitle={t('activityFeedSubtitle')}>
        <EmptyState label={t('noData')} />
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

export function RiskInventoryTable({ divisionRisk, months }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard
      title={t('riskInventory')}
      subtitle={t('divisionsNeedingAttention')}
      topRight={<CsvExportButton type="risk" months={months} label={t('exportCsv')} />}
    >
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{t('divisionName')}</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">{t('available')}</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">{t('lowStock')}</th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {divisionRisk.slice(0, 8).map((d) => {
              const healthy = (d.total_items || 0) - (d.at_risk || 0);
              const riskRatio = (d.at_risk || 0) / (d.total_items || 1);
              const isCritical = riskRatio > 0.4;

              return (
                <tr key={d.division} className="group hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">{d.division}</p>
                    {d.critical_items_list && (
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] truncate" title={d.critical_items_list}>⚠️ {d.critical_items_list}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right font-sans text-emerald-600 dark:text-emerald-400 font-black text-xs">{formatCompactNumber(healthy)}</td>
                  <td className="px-5 py-4 text-right font-sans text-amber-600 dark:text-amber-400 font-black text-xs">{formatCompactNumber(d.at_risk)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3 text-[10px] font-black uppercase tracking-widest">
                      <span className={isCritical ? 'text-rose-500' : 'text-emerald-500'}>
                        {isCritical ? t('actionRequired') : t('stable')}
                      </span>
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ring-4 ${isCritical ? 'bg-rose-500 ring-rose-500/10' : 'bg-emerald-500 ring-emerald-500/10'}`} />
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
              className="p-5 rounded-2xl border border-border/60 bg-muted/20 space-y-4"
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
                  <span className={`w-2 h-2 rounded-full ${isCritical ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/60">
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
  );
}
