'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  TrendingDown,
  Clock,
  Hourglass,
  ChevronRight,
  X,
  PackageX,
  Archive,
  Check,
  Loader2,
  Tags,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  AnalyticsCard,
  CsvExportButton,
  EmptyState,
  TrendCapsule,
  paceAdjustedTarget,
  formatRelativeTime,
  formatBucketLabel,
  formatBucketLong,
  formatRangeLabel,
  formatCompactNumber,
  formatINR,
  formatCompactINR,
  formatHours,
} from '../../components/dashboard-ui';
import { deriveSpotlight } from '../lib/spotlight.mjs';
import { deriveStreak, streakTier, goalTier, projectMonth } from '../lib/streak.mjs';
import { ACTIVE_DOT, BAR, BAR_CURSOR, CHART_MARGIN, DataTable, GRID, KitTooltip, LINE_CURSOR, Legend, OTHER, RankedBars, SERIES, ScopeTag, Sparkline, X_AXIS, Y_AXIS, useTableView } from './chart-kit';
import { SelectField } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// Bars animate from 0 on mount so the hero visibly "fills in" - purely cosmetic,
// so it degrades to the final width if the effect never runs.
function useGrowth(pct) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return width;
}

const KNOWN_STATUSES = ['draft', 'dispatched', 'delivered', 'cancelled'];

// stock.analytics.me.* with {slots} filled from vars, the same shape as
// useAttendanceText(). Returns the language too, for dates and month names.
function useMeText() {
  const { language } = useLanguage();
  const t = (key, vars) =>
    String(getTranslation(`stock.analytics.me.${key}`, language)).replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? '');
  return { t, locale: language === 'hi' ? 'hi-IN' : 'en-IN' };
}

// "2026-09" -> "Sep 2026" / "सित॰ 2026".
function formatMonthKey(key, locale) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return key || '—';
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

function formatDay(value, locale) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

// One person's own numbers: headline tiles, what to do next, the six-month
// trend, recent dispatches.
//
// Rendered in two places and deliberately identical in both — as the whole page
// for a salesperson, and as the "My Performance" tab for an admin who also
// sells. Both read /api/stock/salesperson-analytics, which is always scoped to
// the caller, so neither can see anyone else here.
//
// Built from the same parts as the company analytics (StockHealthScorecard's
// tile, AnalyticsCard, chart-kit), so a salesperson's page reads as the same
// product as their manager's.
export function useMyPerformanceWidgets({ data, goal }) {
  const { t } = useMeText();
  const monthlyTrend = data?.monthlyTrend || [];
  const thisMonth = data?.thisMonth || { count: 0, value: 0 };
  const recentDispatches = data?.recentDispatches || [];
  const sellFirst = data?.sellFirst || [];
  const followUps = data?.followUps || [];

  // `today` is the IST date from the API; fall back to the browser's own date so
  // the page still renders while the payload is in flight.
  const [year, month, dayOfMonth] = (data?.today || new Date().toISOString().slice(0, 10)).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Without a goal, the best finished month is the target: something to beat
  // beats a page with no finish line.
  const pastMonths = monthlyTrend.filter((r) => !r.isCurrent);
  const bestPast = Math.max(0, ...pastMonths.map((r) => r.totalValue));
  const target = Number(goal || 0) > 0 ? Number(goal) : bestPast;
  const targetKind = Number(goal || 0) > 0 ? 'goal' : bestPast > 0 ? 'best' : null;

  const value = Number(thisMonth?.value || 0);
  const pct = target > 0 ? (value / target) * 100 : 0;
  const expectedPct = (dayOfMonth / daysInMonth) * 100;
  const standing = target > 0 ? goalTier(pct, expectedPct) : null;
  const projection = projectMonth({ value, target, dayOfMonth, daysInMonth });
  // The lead on both "what to do" cards: the gap when behind, easy wins otherwise.
  const gap = standing?.behind ? projection.remaining : 0;
  const lead = gap > 0 ? t('closeGapTitle', { amount: formatCompactINR(gap) }) : t('easyWinsTitle');

  // Ids missing from this map are skipped by WidgetGrid, so a card with
  // nothing to say simply isn't there.
  return {
    hero: {
      title: t('heroTitle'),
      node: (
        <MyPerformanceHero
          data={data}
          target={target}
          targetKind={targetKind}
          pct={pct}
          expectedPct={expectedPct}
          standing={standing}
          projection={projection}
          pastMonths={pastMonths}
        />
      ),
    },
    ...(sellFirst.length ? { sellFirst: { title: t('sellFirstTitle'), node: <SellFirstCard items={sellFirst} lead={lead} /> } } : {}),
    ...(followUps.length ? { followUps: { title: t('followUpTitle'), node: <FollowUpsCard customers={followUps} lead={lead} today={data?.today} /> } } : {}),
    ...(monthlyTrend.some((r) => r.totalValue > 0)
      ? { trend: { title: t('trendTitle'), node: <MyTrend rows={monthlyTrend} goal={targetKind === 'goal' ? target : 0} projected={projection.projected} /> } }
      : {}),
    ...(recentDispatches.length ? { recent: { title: t('recentDispatches'), node: <RecentDispatches rows={recentDispatches} /> } } : {}),
  };
}

// Default arrangement of the cards above. The two "what to do" lists share a
// row when both are there and take it whole when only one is. Memoise on the
// two flags: useLayoutPref wants a stable array.
export function myPerformanceLayout(hasSellFirst, hasFollowUps) {
  const half = hasSellFirst && hasFollowUps ? 6 : 12;
  return [
    { id: 'hero', span: 12 },
    { id: 'sellFirst', span: half },
    { id: 'followUps', span: half },
    { id: 'trend', span: 12 },
    { id: 'recent', span: 12 },
  ];
}

// The headline tile, StockHealthScorecard's recipe: label and chip, the figure,
// one muted line, and a sparkline or meter pinned to the bottom.
const TILE = 'glass-panel flex flex-col rounded-lg p-4 sm:p-5';
// Tiles wrap by the width of the card they are in, not the window's, so the
// row reads right at any width the layout gives it: a wide tile counts double.
const WIDE = 'min-w-[min(100%,20rem)] flex-[2_1_0%]';
const NARROW = 'min-w-[min(100%,13rem)] flex-[1_1_0%]';
const FIGURE = 'text-3xl font-semibold tracking-tight tabular-nums text-foreground';

function TileHead({ label, right }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      {right}
    </div>
  );
}

// A tier from streak.mjs (goal standing, streak level) as a small chip.
function TierChip({ tier, children }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${tier.color} ${tier.bg}`}>
      {children}
    </span>
  );
}

function StatTile({ label, value, sub, change, spark }) {
  return (
    <div className={`${TILE} ${NARROW}`}>
      <TileHead label={label} right={change == null ? null : <TrendCapsule value={change} isPositive={change >= 0} />} />
      <div className={`mt-2 ${FIGURE}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
      <div className="mt-auto pt-3">{spark}</div>
    </div>
  );
}

export function MyPerformanceHero({ data, target, targetKind, pct, expectedPct, standing, projection, pastMonths }) {
  const { t } = useMeText();
  const streak = useMemo(() => deriveStreak(data?.activeDays, data?.today, data?.daysOff), [data?.activeDays, data?.today, data?.daysOff]);
  const tier = streakTier(streak.current);
  const thisMonth = data?.thisMonth || { count: 0, value: 0 };
  const lastMonth = data?.lastMonth || {};
  const value = Number(thisMonth.value || 0);
  const { remaining, daysLeft, perDayNeeded, projected, projectedPct } = projection;
  const rank = data?.rank;

  const goalWidth = useGrowth(Math.min(100, Math.round(pct)));

  // Month so far against the same days of last month. Against all of last
  // month, a strong start reads as -85% on the 5th.
  const change = (now, then) => (Number(then || 0) > 0 ? ((now - then) / then) * 100 : null);
  const countChange = change(Number(thisMonth.count || 0), lastMonth.mtdCount);
  const valueChange = change(value, lastMonth.mtdValue);

  // ponytail: judged against today's goal - goal history isn't stored, so a
  // month is "hit" if it would clear the goal as it stands now.
  const hitMonths = targetKind === 'goal' ? pastMonths.filter((r) => r.totalValue >= target).length : 0;

  const headline =
    remaining <= 0
      ? t('goalCleared', { days: daysLeft })
      : standing?.behind
        ? t('perDayHeadline', { amount: formatCompactINR(perDayNeeded) })
        : t('remainingLine', { amount: formatCompactINR(remaining), days: daysLeft });

  // Finished months only: this month is still filling, and as the last point it
  // would bend every sparkline down on the 5th.
  const spark = (key) => pastMonths.map((r) => ({ v: Number(r[key] || 0) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {target > 0 ? (
          <div className={`${TILE} ${WIDE}`}>
            <TileHead
              label={targetKind === 'goal' ? t('monthlyGoal') : t('beatYourBest')}
              right={<TierChip tier={standing}>{t(standing.key)}</TierChip>}
            />
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className={FIGURE}>{formatCompactINR(value)}</span>
              <span className="text-sm tabular-nums text-muted-foreground">/ {formatCompactINR(target)}</span>
              <span className={`text-sm font-semibold tabular-nums ${standing.color}`}>{Math.round(pct)}%</span>
            </div>
            {/* The way forward: the daily figure when behind, what is left otherwise. */}
            <p className="mt-1 text-sm font-medium text-foreground">{headline}</p>
            {remaining > 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  standing.behind ? t('remainingLine', { amount: formatCompactINR(remaining), days: daysLeft }) : null,
                  value > 0 ? t('atPace', { amount: formatCompactINR(projected), pct: Math.round(projectedPct) }) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <div className="mt-auto pt-3">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-[width] duration-200 ease-out ${standing.bar}`} style={{ width: `${goalWidth}%` }} />
                {/* Where they should be by today - the bar is only "behind" relative to this. */}
                <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, expectedPct)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {[
                  t('paceMarker', { pct: Math.round(expectedPct) }),
                  targetKind === 'goal' && pastMonths.length > 0 ? t('goalHistory', { hit: hitMonths, total: pastMonths.length }) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        ) : (
          <StreakTile streak={streak} tier={tier} className={WIDE} />
        )}
        <StatTile
          label={t('dispatches')}
          value={Number(thisMonth.count || 0).toLocaleString('en-IN')}
          sub={t('activeDays', { n: streak.activeThisMonth })}
          change={countChange}
          spark={<Sparkline id="me-count" data={spark('dispatchCount')} dataKey="v" color={SERIES[1]} />}
        />
        <StatTile
          label={t('dispatchValue')}
          value={formatCompactINR(value)}
          sub={Number(lastMonth.mtdValue || 0) > 0 ? t('vsLastMonthSoFar', { amount: formatCompactINR(lastMonth.mtdValue) }) : t('noBaseline')}
          change={valueChange}
          spark={<Sparkline id="me-value" data={spark('totalValue')} dataKey="v" color={SERIES[0]} />}
        />
      </div>
      {target > 0 || rank ? (
        <div className="flex flex-wrap gap-4">
          {target > 0 ? <StreakTile streak={streak} tier={tier} className={WIDE} /> : null}
          {rank ? <RankTile rank={rank} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// Where they stand among everyone with a goal, by % of goal. Anonymous by
// design: the API sends only a position and gaps in their own rupees.
function RankTile({ rank }) {
  const { t } = useMeText();
  const leading = rank.position === 1;
  const line = leading
    ? rank.leadOverNext != null
      ? t('rankLead', { amount: formatCompactINR(rank.leadOverNext) })
      : t('rankAlone')
    : t('rankGap', { amount: formatCompactINR(rank.gapToNext), next: rank.position - 1 });
  return (
    <div className={`${TILE} ${NARROW}`}>
      <TileHead
        label={t('teamRank')}
        right={rank.mostImproved ? <TierChip tier={{ color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' }}>{t('mostImproved')}</TierChip> : null}
      />
      <div className="mt-2 flex items-baseline gap-2">
        <span className={FIGURE}>#{rank.position}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{t('ofTotal', { total: rank.total })}</span>
      </div>
      <p className="mt-1 text-xs font-medium text-foreground">{line}</p>
      <p className="mt-auto pt-3 text-[11px] leading-relaxed text-muted-foreground">{t('rankHint')}</p>
    </div>
  );
}

// One look per day state on the streak tile. A day off is a dashed outline,
// not a grey cell: grey reads as a miss, and a day off is not one.
const STREAK_DAY = {
  active: { icon: Check, label: 'legendActive', className: 'bg-emerald-500 text-white' },
  missed: { icon: X, label: 'legendMissed', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
  off: { icon: null, label: 'legendOff', className: 'border border-dashed border-border' },
  today: { icon: Clock, label: 'legendToday', className: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/40 dark:text-amber-400' },
};

// "2026-09-15" -> "Tue", or "Tue, 15 Sept" with `withDate`. The key is an IST
// calendar date, so it is read as UTC to keep the weekday from shifting.
function formatWeekday(key, locale, withDate = false) {
  const [y, m, d] = String(key).split('-').map(Number);
  const opts = withDate ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } : { weekday: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, opts).format(Date.UTC(y, m - 1, d));
}

function StreakTile({ streak, tier, className = '' }) {
  const { t, locale } = useMeText();
  const atRisk = streak.current > 0 && !streak.activeToday;
  return (
    <div className={`${TILE} ${className}`}>
      <TileHead label={t('salesStreak')} right={<TierChip tier={tier}>{t(tier.key)}</TierChip>} />
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className={FIGURE}>{streak.current}</span>
        <span className="text-sm text-muted-foreground">{streak.current === 1 ? t('day') : t('days')}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t('bestRun', { n: streak.best })}
          {streak.current > 0 && streak.current >= streak.best ? ` · ${t('personalRecord')}` : ''}
        </span>
      </div>

      {/* Last 7 days, oldest first, each labelled with its weekday and one
          unmistakable state. Dispatched days stay green whatever the tier,
          so an old run doesn't turn grey and read as misses once it ends. */}
      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {streak.last7.map((d) => {
          const cell = STREAK_DAY[d.state];
          const Icon = cell.icon;
          return (
            <li key={d.date} className="flex flex-col items-center gap-1" title={`${formatWeekday(d.date, locale, true)} · ${t(cell.label)}`}>
              <span className={`text-[11px] ${d.state === 'today' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {d.state === 'today' ? t('today') : formatWeekday(d.date, locale)}
              </span>
              <span className={`flex h-6 w-full items-center justify-center rounded-md ${cell.className}`}>
                {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                <span className="sr-only">{t(cell.label)}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* What happened and what to do about it, in words, then the key. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-3">
        <p className={`text-xs ${atRisk ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {streak.current === 0
            ? streak.brokenOn
              ? t('streakBroke', { date: formatWeekday(streak.brokenOn, locale, true) })
              : t('startStreak')
            : streak.activeToday
              ? t('safeToday')
              : t('keepAlive', { n: streak.current + 1 })}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
          {['active', 'missed', 'off'].map((state) => (
            <span key={state} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-[3px] ${STREAK_DAY[state].className}`} />
              {t(STREAK_DAY[state].label)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// What to do about the gap, as two cards: dead stock in their divisions, and
// customers who have gone quiet. `lead` names the gap when behind.
function SellFirstCard({ items, lead }) {
  const { t } = useMeText();
  const unit = (u) => (u === 'sqft' ? 'sqft' : u === 'bag' ? t('unitBags') : t('unitBoxes'));
  return (
    <AnalyticsCard title={t('sellFirstTitle')} subtitle={`${lead}. ${t('sellFirstHint')}`}>
      <ul className="-my-2 divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
              <p className="truncate text-xs text-muted-foreground">{[item.brandName, item.sizeLabel, item.divisionName].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="shrink-0 text-right text-xs tabular-nums">
              <p className="font-semibold text-foreground">
                {Number(item.availableQty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit(item.unitOfMeasure)}
              </p>
              <p className={item.daysIdle >= 120 ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}>
                {t('daysIdle', { n: item.daysIdle })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </AnalyticsCard>
  );
}

function FollowUpsCard({ customers, lead, today }) {
  const { t, locale } = useMeText();
  const todayMs = Date.parse(`${today || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return (
    <AnalyticsCard title={t('followUpTitle')} subtitle={`${lead}. ${t('followUpHint')}`}>
      <ul className="-my-2 divide-y divide-border">
        {customers.map((c) => {
          const quietDays = Math.round((todayMs - Date.parse(`${c.lastOrderOn}T00:00:00Z`)) / 86400000);
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t('lastOrder', { date: formatDay(c.lastOrderOn, locale), days: quietDays })}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums">
                <p className="font-semibold text-foreground">{formatCompactINR(c.lifetimeValue)}</p>
                <p className="text-muted-foreground">{t('lifetime')}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </AnalyticsCard>
  );
}

// Six calendar months as bars on the shared chart kit. The current month is
// still filling, so a faint bar behind it shows where it lands at today's
// rate - a month a third done shouldn't read as the worst on the chart. The
// goal is a dashed line.
function MyTrend({ rows, goal, projected }) {
  const { t, locale } = useMeText();
  const [table, tableButton] = useTableView();
  const data = rows.map((r) => ({
    month: formatMonthKey(r.monthKey, locale),
    value: Number(r.totalValue || 0),
    pace: r.isCurrent && projected > r.totalValue ? projected : null,
    orders: Number(r.dispatchCount || 0),
    isCurrent: Boolean(r.isCurrent),
  }));
  const hasPace = data.some((d) => d.pace != null);
  const paceColor = 'color-mix(in srgb, var(--series-1) 28%, transparent)';

  return (
    <AnalyticsCard
      title={t('trendTitle')}
      subtitle={t('trendSubtitle')}
      topRight={
        <>
          <Legend
            items={[
              { label: t('dispatchValue'), color: SERIES[0] },
              ...(hasPace ? [{ label: t('legendPace'), color: paceColor }] : []),
              ...(goal > 0 ? [{ label: t('goalLine'), color: 'var(--chart-axis)', kind: 'line' }] : []),
            ]}
          />
          {tableButton}
        </>
      }
    >
      {table ? (
        <DataTable
          columns={[
            { key: 'month', label: t('colDate') },
            { key: 'value', label: t('dispatchValue'), format: formatINR },
            { key: 'orders', label: t('dispatches') },
          ]}
          rows={data}
        />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            {/* barGap -100%: the pace bar sits exactly behind this month's bar. */}
            <BarChart data={data} margin={CHART_MARGIN} barGap="-100%">
              <CartesianGrid {...GRID} />
              <XAxis dataKey="month" {...X_AXIS} />
              <YAxis {...Y_AXIS} tickFormatter={formatCompactINR} />
              <RechartsTooltip
                cursor={BAR_CURSOR}
                content={(props) => {
                  const row = props.payload?.[0]?.payload;
                  return (
                    <KitTooltip
                      {...props}
                      payload={props.payload?.filter((p) => p.dataKey === 'value')}
                      formatter={formatINR}
                      hint={row ? [
                        t('orders', { n: row.orders }),
                        row.isCurrent ? t('inProgress') : null,
                        row.pace != null ? t('atPace', { amount: formatCompactINR(row.pace), pct: goal > 0 ? Math.round((row.pace / goal) * 100) : '—' }) : null,
                      ].filter(Boolean).join(' · ') : null}
                    />
                  );
                }}
              />
              {hasPace ? <Bar dataKey="pace" name={t('legendPace')} fill={paceColor} {...BAR} isAnimationActive={false} /> : null}
              <Bar dataKey="value" name={t('dispatchValue')} fill={SERIES[0]} {...BAR} />
              {goal > 0 ? <ReferenceLine y={goal} stroke="var(--chart-axis)" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsCard>
  );
}

// Delivered reads as done, cancelled as stopped; everything else is in motion.
const DISPATCH_VARIANT = { delivered: 'approved', cancelled: 'rejected' };

function DispatchStatus({ d, t }) {
  return (
    <>
      <Badge variant={DISPATCH_VARIANT[d.status] || 'neutral'}>
        {KNOWN_STATUSES.includes(d.status) ? t(`status_${d.status}`) : d.status}
      </Badge>
      {/* Counted in the month already (see shippedFilter); the badge just says an approver hasn't looked yet. */}
      {d.approvalStatus === 'pending' ? <Badge variant="pending">{t('awaitingApproval')}</Badge> : null}
    </>
  );
}

// The dashboard list's look: a list of rows on a phone, a compact table wider.
function RecentDispatches({ rows }) {
  const { t, locale } = useMeText();
  const href = (d) => `/stock?entityType=outbound_shipment&entityId=${d.id}`;
  return (
    <AnalyticsCard title={t('recentDispatches')}>
      <ul className="-my-2 divide-y divide-border sm:hidden">
        {rows.map((d) => (
          <li key={d.id}>
            <Link href={href(d)} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{d.customerName || '—'}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {d.shipmentNumber || `#${d.id}`} · {formatDay(d.dispatchDate, locale)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1"><DispatchStatus d={d} t={t} /></div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatINR(d.totalValue)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">{t('colShipment')}</th>
              <th className="py-2 pr-3 font-semibold">{t('colDate')}</th>
              <th className="py-2 pr-3 font-semibold">{t('colCustomer')}</th>
              <th className="py-2 pr-3 font-semibold">{t('colStatus')}</th>
              <th className="py-2 text-right font-semibold">{t('colValue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((d) => (
              <tr key={d.id} className="transition-colors hover:bg-muted/60">
                <td className="py-2 pr-3 font-medium">
                  <Link href={href(d)} className="text-brand-primary underline-offset-2 hover:underline">{d.shipmentNumber || `#${d.id}`}</Link>
                </td>
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{formatDay(d.dispatchDate, locale)}</td>
                <td className="max-w-[16rem] truncate py-2 pr-3 text-foreground">{d.customerName || '—'}</td>
                <td className="py-2 pr-3"><div className="flex flex-wrap gap-1"><DispatchStatus d={d} t={t} /></div></td>
                <td className="py-2 text-right font-semibold tabular-nums text-foreground">{formatINR(d.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsCard>
  );
}

// The four headline tiles. Money tiles are the range against the same number
// of days just before it; stock is a snapshot and says so.
export function StockHealthScorecard({ data, stockRisk, approvalOps, periodTotals, revenueTrend = [], profitTrend = [], range }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const cur = periodTotals?.current || {};
  const prev = periodTotals?.previous || {};
  const change = (a, b) => (Number(b) > 0 ? ((Number(a) - Number(b)) / Number(b)) * 100 : null);
  const costed = Number(cur.revenue || 0) - Number(cur.uncostedRevenue || 0);
  const margin = costed > 0 ? (Number(cur.profit || 0) / costed) * 100 : null;

  const healthy = data.reduce((s, d) => s + Math.max(0, Number(d.total_items || 0) - Number(d.at_risk || 0)), 0);
  const totalItems = data.reduce((s, d) => s + Number(d.total_items || 0), 0);
  const zeroStock = Number(stockRisk?.zeroStock || 0);
  const lowStock = Number(stockRisk?.lowStock || 0);
  const medianLagHours = Number(approvalOps?.medianLagHours || 0);
  const spark = (rows, key) => rows.map((r) => ({ v: Number(r[key] || 0) }));

  const tiles = [
    {
      label: t('revenue'),
      value: formatCompactINR(cur.revenue),
      sub: `${t('vsPrevious')} ${formatCompactINR(prev.revenue)} · ${formatCompactNumber(cur.dispatches || 0)} ${t('dispatchesUnit')}`,
      change: change(cur.revenue, prev.revenue),
      spark: <Sparkline id="revenue" data={spark(revenueTrend, 'revenue')} dataKey="v" color={SERIES[0]} />,
    },
    {
      label: t('grossProfit'),
      value: formatCompactINR(cur.profit),
      sub: `${margin != null ? `${margin.toFixed(1)}% ${t('margin')}` : '—'}${Number(cur.uncostedRevenue) > 0 ? ` · ${formatCompactINR(cur.uncostedRevenue)} ${t('uncostedShort')}` : ''}`,
      change: change(cur.profit, prev.profit),
      spark: <Sparkline id="profit" data={spark(profitTrend, 'profit')} dataKey="v" color={SERIES[2]} />,
    },
    {
      label: t('stockRisk'),
      tag: t('scopeNow'),
      value: formatCompactNumber(zeroStock + lowStock),
      sub: `${zeroStock} ${t('zeroStock')} · ${lowStock} ${t('lowStock')}`,
      meter: totalItems > 0 ? healthy / totalItems : null,
      meterLabel: totalItems > 0 ? `${((healthy / totalItems) * 100).toFixed(0)}% ${t('healthyLineItems')}` : null,
    },
    {
      label: t('approvalLag'),
      value: formatHours(medianLagHours),
      sub: t('medianHoursToApprove'),
      tone: medianLagHours > 24 ? 'text-amber-600 dark:text-amber-400' : null,
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
      {tiles.map((m) => (
        <div key={m.label} className="glass-panel flex flex-col rounded-lg p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
            {m.tag ? <ScopeTag>{m.tag}</ScopeTag> : m.change != null ? (
              <span title={`${t('vsPrevious')} ${formatRangeLabel({ from: range?.prevFrom, to: range?.prevTo })}`}>
                <TrendCapsule value={m.change} isPositive={m.change >= 0} />
              </span>
            ) : null}
          </div>
          <div className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${m.tone || 'text-foreground'}`}>{m.value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{m.sub}</div>
          <div className="mt-auto pt-3">
            {m.spark || (m.meter != null ? (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${m.meter * 100}%`, backgroundColor: 'var(--status-good)' }} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{m.meterLabel}</p>
              </div>
            ) : <div className="h-10" />)}
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
      tone: stockedOut > 0 ? 'text-rose-700 bg-muted  dark:text-rose-400 border-border ' : 'text-emerald-700 bg-muted  dark:text-emerald-400 border-border ',
      tab: 'overview',
      target: 'widget-reorder',
    },
    {
      icon: Hourglass,
      value: approvalsWaiting,
      label: t('approvalsWaiting'),
      hint: approvalsWaiting > 0 ? `${formatHours(oldestPendingHours)} ${t('oldestPending')}` : null,
      tone: approvalsWaiting > 10 ? 'text-rose-700 bg-muted  dark:text-rose-400 border-border ' : approvalsWaiting > 0 ? 'text-amber-700 bg-muted  dark:text-amber-400 border-border ' : 'text-emerald-700 bg-muted  dark:text-emerald-400 border-border ',
      tab: 'overview',
      target: 'widget-pending',
    },
    {
      icon: TrendingDown,
      value: salespeopleBehindPace,
      label: t('salespeopleBehindPace'),
      tone: salespeopleBehindPace > 0 ? 'text-amber-700 bg-muted  dark:text-amber-400 border-border ' : 'text-emerald-700 bg-muted  dark:text-emerald-400 border-border ',
      tab: 'team',
      target: 'widget-pace',
    },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onNavigate?.(p.tab, p.target)}
          className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold transition-shadow duration-200 hover:shadow-card focus-ring ${p.tone}`}
        >
          <p.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums text-sm leading-none">{p.value}</span>
          <span className="whitespace-nowrap">{p.label}</span>
          {p.hint ? <span className="whitespace-nowrap text-[11px] opacity-70">· {p.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Individual salesperson view. Derived entirely from the payload the Team tab
// already has: salespersonTrend carries every salesperson x month row (no LIMIT),
// so no extra fetch is needed to scope down to one person.
export function SalespersonSpotlight({ trend, ranking, goals, selected, onSelect, range, onDrill }) {
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
      contextBar={`${formatRangeLabel(range)} · ${rank != null ? `${t('rank')} ${rank} ${t('ofLabel')} ${outOf}` : t('noData')}`}
      topRight={
        <label className="flex items-center gap-2">
          {onDrill && active ? (
            <button
              type="button"
              onClick={() => onDrill({ title: active, filter: { salesperson: active }, by: 'customer' })}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
            >
              {t('details')} <ChevronRight className="h-3 w-3" />
            </button>
          ) : null}
          <span className="sr-only">{t('selectSalesperson')}</span>
          <SelectField
            value={active || ''}
            onChange={(e) => onSelect?.(e.target.value)}
            className="max-w-[14rem] rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus-ring"
          >
            {roster.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SelectField>
        </label>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <p className="text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">{active}</p>
        {growthRatio != null ? <TrendCapsule value={growthRatio * 100} isPositive={growthRatio >= 0} /> : null}
        <span className="text-xs font-medium text-slate-400">{t('growthVsLastPeriod')}</span>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-muted/30 px-4 py-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="mt-1 text-lg font-bold font-sans tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {goal > 0 ? (
        <div className="space-y-1 mb-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('salesPace')}</span>
            <span className={`text-xs font-bold tabular-nums ${behindPace ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
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
          <p className="text-[11px] font-bold text-slate-400 tabular-nums">
            {formatCompactINR(goalActual)} / {formatCompactINR(goal)} · {t('expectedPace')} {formatCompactINR(expected)}
          </p>
        </div>
      ) : (
        <p className="mb-4 text-xs font-medium text-slate-400">{t('noGoal')}</p>
      )}

      {series.length === 0 ? (
        <EmptyState label={t('noData')} />
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            {/* ponytail: only buckets with sales are plotted; zero-fill if day ranges look gappy. */}
            <LineChart data={series} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="bucket" {...X_AXIS} tickFormatter={(v) => formatBucketLabel(v, range?.bucket)} />
              <YAxis {...Y_AXIS} tickFormatter={formatCompactINR} />
              <RechartsTooltip cursor={LINE_CURSOR} content={<KitTooltip formatter={formatINR} labelFormatter={(v) => formatBucketLong(v, range?.bucket)} />} />
              <Line
                type="monotone"
                dataKey="revenue"
                name={t('revenue')}
                stroke={SERIES[0]}
                strokeWidth={2}
                dot={series.length <= 12 ? { r: 2.5, fill: SERIES[0], strokeWidth: 0 } : false}
                activeDot={ACTIVE_DOT}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsCard>
  );
}

function LeaderboardRow({ row, i, maxVal, onSelect, isSelected, blendedMargin, goalRow }) {
  const growthRatio = row.growth_ratio != null ? Number(row.growth_ratio) : null;
  const margin = row.margin_pct != null ? Number(row.margin_pct) : null;
  // Red means this person sells at a worse margin than the business as a whole,
  // which is the only comparison that says anything - a "good" margin is set by
  // what the range actually achieved, not by a number picked here.
  const marginLags = margin != null && blendedMargin != null && margin < blendedMargin;
  const name = row.salesperson || row.name;
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  // Row is a button only when the parent wired a handler, same as PendingQueueWidget.
  const Wrapper = onSelect ? 'button' : 'div';
  const interactiveProps = onSelect
    ? { type: 'button', onClick: () => onSelect(name) }
    : {};

  // revenue = profit + cost + uncosted. A loss has no segment of its own; the
  // header shows the negative figure and the bar is just cost + uncosted.
  const profit = Number(row.gross_profit || 0);
  const cost = Number(row.cost || 0);
  const uncosted = Number(row.uncosted_revenue || 0);
  const barTotal = Math.max(0, profit) + cost + uncosted;

  // This month vs goal, independent of the range selector above it.
  const goal = Number(goalRow?.goal || 0);
  const actual = Number(goalRow?.actual || 0);
  const goalPct = goal > 0 ? (actual / goal) * 100 : 0;
  const expectedPct = goal > 0 ? (paceAdjustedTarget(goal) / goal) * 100 : 0;
  const behindPace = goalPct < expectedPct;

  return (
    <Wrapper
      {...interactiveProps}
      className={`flex w-full items-start gap-2 py-2 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0 ${onSelect ? 'text-left cursor-pointer focus-ring' : ''} ${isSelected ? 'bg-muted ring-1 ring-border rounded-lg px-2 -mx-2 border-b-transparent' : ''}`}
    >
      <span className="w-6 text-xs font-bold text-slate-400 text-right tabular-nums">{i + 1}.</span>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{name}</p>
          <div className="flex items-center gap-2 shrink-0 tabular-nums">
            <p className="text-xs font-bold font-sans text-slate-900 dark:text-white">{formatCompactINR(row.revenue)}</p>
            <span className={`text-[11px] font-bold ${profit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {formatCompactINR(profit)} {t('profit')}
            </span>
            {margin != null ? (
              <span className={`text-[11px] font-bold ${marginLags ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                {margin.toFixed(1)}%
              </span>
            ) : null}
            {growthRatio != null ? (
              <span className={`text-[11px] font-bold ${growthRatio >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {growthRatio >= 0 ? '+' : ''}{(growthRatio * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
        </div>
        <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="flex h-full" style={{ width: `${Math.min(100, (barTotal / (maxVal || 1)) * 100)}%` }}>
            <div className="h-full bg-emerald-500" style={{ flexGrow: Math.max(0, profit) }} title={`${t('profit')} ${formatCompactINR(profit)}`} />
            <div className="h-full bg-slate-400 dark:bg-slate-500" style={{ flexGrow: cost }} title={`${t('cost')} ${formatCompactINR(cost)}`} />
            <div className="h-full bg-slate-200 dark:bg-slate-700" style={{ flexGrow: uncosted }} title={`${t('uncostedRevenue')} ${formatCompactINR(uncosted)}`} />
          </div>
        </div>
        {goal > 0 ? (
          <div className="flex items-center gap-2">
            <div className="relative h-1 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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
            <span className="shrink-0 text-[11px] font-bold text-slate-400 tabular-nums">
              <span className={behindPace ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>{Math.round(goalPct)}%</span>
              {' '}{formatCompactINR(actual)} / {formatCompactINR(goal)} · {goalRow.shipments} {t('dispatchesShort')}
            </span>
          </div>
        ) : (
          <p className="text-[11px] font-bold text-slate-400">{t('thisMonthVsGoal')}: {t('noGoal')}</p>
        )}
      </div>
    </Wrapper>
  );
}

export function Leaderboard({ ranking, goals = [], query, onSelect, selected }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  // ponytail: joined by name - ranking rows only carry the salesperson label.
  // Two users sharing a name would collide; key both queries by user id if so.
  const goalsByName = new Map(goals.map((g) => [g.name, g]));
  const ranked = new Set(ranking.map((r) => r.salesperson || r.name));
  // Goal holders with nothing sold in the range still get a row.
  const rows = [
    ...ranking,
    ...goals.filter((g) => !ranked.has(g.name)).map((g) => ({ salesperson: g.name, revenue: 0, cost: 0, uncosted_revenue: 0, gross_profit: 0 })),
  ];
  const maxVal = Math.max(...rows.map((r) => Math.max(0, Number(r.gross_profit || 0)) + Number(r.cost || 0) + Number(r.uncosted_revenue || 0)), 1);
  // The whole range's margin, not the average of the per-person margins, so a
  // small seller cannot drag the bar the big sellers are measured against.
  const costedRevenue = ranking.reduce((sum, r) => sum + Number(r.revenue || 0) - Number(r.uncosted_revenue || 0), 0);
  const totalProfit = ranking.reduce((sum, r) => sum + Number(r.gross_profit || 0), 0);
  const blendedMargin = costedRevenue > 0 ? (totalProfit / costedRevenue) * 100 : null;
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (
    <AnalyticsCard
      title={t('salesPerformance')}
      subtitle={t('personnelRanking')}
      topRight={<CsvExportButton type="leaderboard" query={query} label={t('exportCsv')} />}
      contextBar={`${t('thisMonthVsGoal')}: ${t('dayLabel')} ${day} ${t('ofLabel')} ${daysInMonth} · ${t('expectedPace')} ${Math.round((day / daysInMonth) * 100)}%`}
    >
      {rows.length === 0 ? (
        <EmptyState label={t('noData')} />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-lg bg-emerald-500" />{t('profit')}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-lg bg-slate-400 dark:bg-slate-500" />{t('cost')}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-lg bg-slate-200 dark:bg-slate-700" />{t('uncostedRevenue')}</span>
          </div>
          <div className="max-h-[28rem] overflow-y-auto pr-1">
            {rows.map((row, i) => {
              const name = row.salesperson || row.name;
              return (
                <LeaderboardRow
                  key={name}
                  row={row}
                  i={i}
                  maxVal={maxVal}
                  blendedMargin={blendedMargin}
                  goalRow={goalsByName.get(name)}
                  onSelect={onSelect}
                  isSelected={selected != null && selected === name}
                />
              );
            })}
          </div>
        </>
      )}
    </AnalyticsCard>
  );
}

export function ReorderNowWidget({ items, query, range, onDrill }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const Row = onDrill ? 'button' : 'div';
  return (
    <AnalyticsCard
      title={t('reorderNow')}
      subtitle={`${t('reorderRangeSubtitle')} · ${formatRangeLabel(range)}`}
      topRight={items.length > 0 ? <CsvExportButton type="reorder" query={query} label={t('exportCsv')} /> : null}
    >
      {items.length === 0 ? (
        <EmptyState label={t('noData')} />
      ) : (
        <div className="divide-y divide-border/50">
          {items.map((item) => {
            const cover = Number(item.days_cover || 0);
            const isCritical = cover <= 0;
            return (
              <Row
                key={item.id}
                {...(onDrill ? { type: 'button', onClick: () => onDrill({ title: item.name, filter: { item: item.id }, by: 'customer' }) } : {})}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left ${onDrill ? 'transition-colors hover:bg-muted/60 focus-ring' : ''}`}
              >
                <PackageX className={`h-4 w-4 shrink-0 ${isCritical ? 'text-rose-500' : 'text-amber-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground" title={item.name}>{item.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.division} · {item.sku}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-xs font-semibold text-foreground">{formatCompactNumber(item.sold_in_range)}</p>
                  <p className="text-[11px] text-muted-foreground">{t('soldInRange')}</p>
                </div>
                <div className={`w-16 shrink-0 rounded-md px-2 py-1 text-right tabular-nums ${isCritical ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                  <p className="text-xs font-semibold">{cover.toFixed(1)}d</p>
                  <p className="text-[10px] leading-none">{t('daysCover')}</p>
                </div>
              </Row>
            );
          })}
        </div>
      )}
    </AnalyticsCard>
  );
}

export function DeadStockWidget({ data, query, range }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const count = Number(data?.itemCount || 0);
  const units = Number(data?.unitsIdle || 0);
  const value = Number(data?.estimatedValue || 0);
  const uncosted = Number(data?.uncostedItems || 0);
  return (
    <AnalyticsCard
      title={t('deadStock')}
      subtitle={`${t('deadStockRangeSubtitle')} ${formatRangeLabel({ from: range?.from, to: range?.from })}`}
      topRight={count > 0 ? <CsvExportButton type="deadstock" query={query} label={t('exportCsv')} /> : null}
    >
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 shrink-0">
          <Archive className="h-7 w-7 text-slate-500" />
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-4">
          <div>
            <p className="text-2xl font-bold font-sans text-slate-900 dark:text-white tabular-nums leading-none">{count}</p>
            <p className="text-xs font-medium text-slate-400 mt-1">{t('items')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-sans text-slate-900 dark:text-white tabular-nums leading-none">{formatCompactNumber(units)}</p>
            <p className="text-xs font-medium text-slate-400 mt-1">{t('unitsIdle')}</p>
          </div>
          {value > 0 ? (
            <div>
              <p className="text-xl font-bold font-sans text-slate-900 dark:text-white tabular-nums leading-none">{formatCompactINR(value)}</p>
              <p className="text-xs font-medium text-slate-400 mt-1">{t('capitalIdle')}</p>
              {uncosted > 0 ? (
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {uncosted} {t('uncostedItems')}
                </p>
              ) : null}
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
    <AnalyticsCard title={t('pendingQueueTitle')} subtitle={t('pendingQueueSubtitle')} topRight={<ScopeTag>{t('scopeNow')}</ScopeTag>}>
      {items.length === 0 ? (
        <EmptyState label={t('noData')} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const hrs = Number(item.hours_pending || 0);
            const ageColor = hrs > 48 ? 'bg-muted text-rose-700  dark:text-rose-400' : hrs > 24 ? 'bg-muted text-amber-700  dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
            const isLoading = actionLoading === `${item.id}`;
            return (
              <div key={item.id} className="flex items-center gap-2 py-2 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.shipment_number}</p>
                  <p className="text-[11px] text-slate-400 font-bold truncate">{item.customer_name || '—'} · {item.salesperson_name || '—'}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg tabular-nums ${ageColor}`}>{formatHours(hrs)}</span>
                <div className="flex gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading || !onApprove}
                        onClick={() => onApprove?.(item)}
                        className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition disabled:opacity-50 focus-ring"
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
                        className="p-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition disabled:opacity-50 focus-ring"
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

// Share of total revenue at which one customer counts as a dependency worth
// flagging. ponytail: a flat threshold, not a Herfindahl index - raise it if
// the customer list is long enough that a fifth is normal.
const CONCENTRATION_ALERT_PCT = 20;

export function CustomerConcentrationWidget({ rows, onDrill }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  if (!rows || rows.length === 0) {
    return (
      <AnalyticsCard title={t('topCustomers')} subtitle={t('concentrationSubtitle')}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }
  // Same blended-margin yardstick the leaderboard uses, measured over the
  // customers shown rather than all of them - those are the rows being compared.
  const costedRevenue = rows.reduce((sum, r) => sum + Number(r.revenue || 0) - Number(r.uncosted_revenue || 0), 0);
  const totalProfit = rows.reduce((sum, r) => sum + Number(r.gross_profit || 0), 0);
  const blendedMargin = costedRevenue > 0 ? (totalProfit / costedRevenue) * 100 : null;
  const allRevenue = Number(rows[0]?.all_customer_revenue || 0);
  const otherRevenue = Math.max(0, allRevenue - rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0));
  const topShare = Number(rows[0]?.share_pct || 0);
  const bars = rows.map((row) => {
    const margin = row.margin_pct != null ? Number(row.margin_pct) : null;
    return {
      key: String(row.id),
      id: row.id,
      label: row.name,
      value: Number(row.revenue || 0),
      share: Number(row.share_pct || 0),
      // One hue for every customer: the bar length is the comparison, and a
      // customer above the concentration line is flagged in status red.
      color: Number(row.share_pct || 0) >= CONCENTRATION_ALERT_PCT ? 'var(--status-bad)' : SERIES[0],
      extra: margin != null ? `${margin.toFixed(1)}% ${t('margin')}${blendedMargin != null && margin < blendedMargin ? ' ↓' : ''}` : null,
    };
  });
  if (otherRevenue > 0 && allRevenue > 0) {
    bars.push({ key: '__other', label: t('otherCustomers'), value: otherRevenue, share: (otherRevenue / allRevenue) * 100, color: OTHER });
  }
  return (
    <AnalyticsCard
      title={t('topCustomers')}
      subtitle={t('concentrationSubtitle')}
      contextBar={topShare >= CONCENTRATION_ALERT_PCT ? `${rows[0].name}: ${topShare.toFixed(1)}% ${t('ofSales')} · ${t('concentrationAlert')}` : null}
    >
      <RankedBars
        rows={bars}
        format={formatCompactINR}
        onSelect={onDrill ? (row) => row.key !== '__other' && onDrill({ title: row.label, filter: { customer: row.id }, by: 'item' }) : undefined}
      />
    </AnalyticsCard>
  );
}

// How far below its own typical rate a sale has to sit before the row is worth
// arguing about. Under this the spread is rounding, freight adjustments and
// odd-lot pricing rather than a discount anyone chose.
const RATE_GAP_ALERT_PCT = 10;

// The query hands back 'YYYY-MM-DD' as text for exactly this reason: parsing a
// date here and formatting it back would shift it a day west of UTC.
// Price Dispersion: the same item billed at a different rate on every dispatch.
//
// The table is sorted by uplift, not by spread, because a 30% spread on an item
// that sold twice is worth less than a 5% spread on the item that carries the
// month. Uplift is already the answer to "where do I start".
export function PriceDispersionWidget({ rows, onDrill }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);

  if (!rows || rows.length === 0) {
    return (
      <AnalyticsCard title={t('priceDispersion')} subtitle={t('priceDispersionSubtitle')}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }

  // Every row carries the same all-item total from the query, so the headline
  // counts the items the table had to cut as well as the twelve it shows.
  const totalUplift = Number(rows[0]?.all_item_uplift ?? 0)
    || rows.reduce((sum, r) => sum + Number(r.uplift || 0), 0);
  const gapPct = (row) => {
    const median = Number(row.median_rate || 0);
    return median > 0 ? ((median - Number(row.min_rate || 0)) / median) * 100 : 0;
  };

  return (
    <AnalyticsCard
      title={t('priceDispersion')}
      subtitle={t('priceDispersionSubtitle')}
      topRight={
        <div className="flex items-center gap-2">
          <Tags className="w-3.5 h-3.5 text-amber-500" />
          <span className="font-sans text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {formatCompactINR(totalUplift)}
          </span>
          <span className="text-xs font-medium text-slate-400">{t('uplift')}</span>
        </div>
      }
    >
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('itemName')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('typicalRate')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('rateRange')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('belowTypical')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('uplift')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => {
              const wideGap = gapPct(row) >= RATE_GAP_ALERT_PCT;
              return (
                <tr
                  key={row.item_id}
                  onClick={onDrill ? () => onDrill({ title: row.name, filter: { item: row.item_id }, by: 'salesperson' }) : undefined}
                  className={`group hover:bg-muted/50 transition-colors ${onDrill ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate max-w-[240px]" title={row.name}>{row.name}</p>
                    <p className="text-[11px] text-slate-500 mt-1 truncate max-w-[240px]" title={row.sku}>{row.sku}</p>
                  </td>
                  <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-900 dark:text-white">{formatINR(row.median_rate)}</td>
                  <td className={`px-6 py-4 text-right font-sans font-bold text-xs ${wideGap ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                    {formatINR(row.min_rate)} – {formatINR(row.max_rate)}
                  </td>
                  <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-500 tabular-nums">
                    {row.below_count} / {row.sale_count}
                  </td>
                  <td className="px-6 py-4 text-right font-sans font-bold text-xs text-amber-600 dark:text-amber-400">{formatCompactINR(row.uplift)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-4">
        {rows.map((row) => {
          const wideGap = gapPct(row) >= RATE_GAP_ALERT_PCT;
          return (
            <div
              key={`disp-mob-${row.item_id}`}
              onClick={onDrill ? () => onDrill({ title: row.name, filter: { item: row.item_id }, by: 'salesperson' }) : undefined}
              className="p-4 rounded-lg border border-border/60 space-y-4"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">{row.sku}</p>
                </div>
                <span className="font-sans text-sm font-bold text-amber-600 dark:text-amber-400 shrink-0">{formatCompactINR(row.uplift)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border/60">
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('typicalRate')}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{formatINR(row.median_rate)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('rateRange')}</p>
                  <p className={`text-xs font-bold ${wideGap ? 'text-rose-600' : 'text-slate-500'}`}>{formatINR(row.min_rate)} – {formatINR(row.max_rate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('belowTypical')}</p>
                  <p className="text-xs font-bold text-slate-500">{row.below_count} / {row.sale_count}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">{t('priceDispersionNote')}</p>
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
          <div key={e.id} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${eventColor(e.event_type)}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{eventLabel(e.event_type)}</p>
              <p className="text-[11px] text-slate-400 truncate">{e.summary || `${e.entity_type} #${e.entity_id}`}{e.actor_name ? ` · ${e.actor_name}` : ''}</p>
            </div>
            <span className="text-[11px] font-bold text-slate-400 shrink-0 tabular-nums">{formatRelativeTime(e.occurred_at)}</span>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function RiskInventoryTable({ divisionRisk, query }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  return (
    <AnalyticsCard
      title={t('riskInventory')}
      subtitle={t('divisionsNeedingAttention')}
      topRight={<><ScopeTag>{t('scopeNow')}</ScopeTag><CsvExportButton type="risk" query={query} label={t('exportCsv')} /></>}
    >
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('divisionName')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('available')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('outOfStock')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('lowStock')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {divisionRisk.slice(0, 8).map((d) => {
              const riskRatio = (d.at_risk || 0) / (d.total_items || 1);
              const isCritical = riskRatio > 0.4;

              return (
                <tr key={d.division} className="group hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">{d.division}</p>
                    {d.critical_items_list && (
                      <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] truncate" title={d.critical_items_list}>⚠️ {d.critical_items_list}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-sans text-emerald-600 dark:text-emerald-400 font-bold text-xs">{formatCompactNumber(d.current_stock)}</td>
                  <td className="px-6 py-4 text-right font-sans text-rose-600 dark:text-rose-400 font-bold text-xs">{formatCompactNumber(d.out_of_stock)}</td>
                  <td className="px-6 py-4 text-right font-sans text-amber-600 dark:text-amber-400 font-bold text-xs">{formatCompactNumber(d.low_stock)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-xs font-semibold">
                      <span className={isCritical ? 'text-rose-500' : 'text-emerald-500'}>
                        {isCritical ? t('actionRequired') : t('stable')}
                      </span>
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ring-1 ${isCritical ? 'bg-rose-500 ring-border' : 'bg-emerald-500 ring-border'}`} />
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
          const riskRatio = (d.at_risk || 0) / (d.total_items || 1);
          const isCritical = riskRatio > 0.4;
          return (
            <div
              key={`risk-mob-${d.division}`}
              className="p-6 rounded-lg border border-border/60 bg-muted/20 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{d.division}</p>
                  {d.critical_items_list && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">⚠️ {d.critical_items_list}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={isCritical ? 'text-rose-500' : 'text-emerald-500'}>{isCritical ? t('critical') : t('stable')}</span>
                  <span className={`w-2 h-2 rounded-full ${isCritical ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border/60">
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('available')}</p>
                  <p className="text-xs font-bold text-emerald-600">{formatCompactNumber(d.current_stock)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('outOfStock')}</p>
                  <p className="text-xs font-bold text-rose-600">{formatCompactNumber(d.out_of_stock)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('lowStock')}</p>
                  <p className="text-xs font-bold text-amber-600">{formatCompactNumber(d.low_stock)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}
