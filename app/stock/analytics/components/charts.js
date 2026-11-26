'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Brush,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { bucketSlice } from '@/lib/analytics-range.mjs';
import {
  AnalyticsCard,
  TrendCapsule,
  EmptyState,
  formatBucketLabel,
  formatBucketLong,
  formatCompactNumber,
  formatCompactINR,
  formatINR,
} from '../../components/dashboard-ui';
import {
  ACTIVE_DOT,
  BAR,
  BAR_CURSOR,
  BAR_GAP,
  BRUSH,
  BRUSH_MIN_POINTS,
  CHART_MARGIN,
  DataTable,
  GRID,
  KitTooltip,
  LINE_CURSOR,
  Legend,
  OTHER,
  RankedBars,
  SERIES,
  STATUS_BAD,
  X_AXIS,
  Y_AXIS,
  bucketClick,
  useTableView,
} from './chart-kit';

const useT = () => {
  const { language } = useLanguage();
  return (key) => getTranslation(`stock.analytics.${key}`, language);
};

function Empty({ title }) {
  const t = useT();
  return (
    <AnalyticsCard title={title}>
      <div className="flex h-64 items-center justify-center"><EmptyState label={t('noData')} className="w-full max-w-xs border-none bg-transparent" /></div>
    </AnalyticsCard>
  );
}

// Shared by every time series: axis labels for the range's bucket size, an
// asterisk on a bucket still filling, and a click that opens the drill sheet
// on that bucket's own dates.
function useBuckets(range, onDrill, by = 'division') {
  const bucket = range?.bucket || 'month';
  return useMemo(() => {
    const tick = (lastBucket) => (v) => formatBucketLabel(v, bucket) + (range?.partialLastBucket && v === lastBucket ? '*' : '');
    const long = (v) => formatBucketLong(v, bucket);
    const drill = onDrill
      ? bucketClick((b) => onDrill({ title: long(b), filter: bucketSlice(b, bucket, range), by }))
      : undefined;
    return { bucket, tick, long, drill };
  }, [bucket, range, onDrill, by]);
}

const ChartBox = ({ children, clickable, height = 'h-72' }) => (
  <div className={`${height} w-full ${clickable ? 'cursor-pointer' : ''}`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
      {children}
    </ResponsiveContainer>
  </div>
);

const pctChange = (current, previous) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

/** Revenue per bucket, with dispatch count in the tooltip; headline is the range vs the one before it. */
export function SalesRevenueChart({ data, range, periodTotals, onDrill }) {
  const t = useT();
  const [table, tableButton] = useTableView();
  const { tick, long, drill } = useBuckets(range, onDrill);
  if (!data || data.length === 0) return <Empty title={t('revenueTrend')} />;

  const rows = data.map((d) => ({ bucket: d.bucket, revenue: Number(d.revenue || 0), dispatches: Number(d.total || 0), delivered: Number(d.delivered || 0) }));
  const last = rows[rows.length - 1].bucket;
  const current = Number(periodTotals?.current?.revenue || 0);
  const previous = Number(periodTotals?.previous?.revenue || 0);
  const change = pctChange(current, previous);
  const complete = range?.partialLastBucket ? rows.slice(0, -1) : rows;
  const peak = complete.reduce((best, r) => (r.revenue > (best?.revenue ?? -1) ? r : best), null);

  return (
    <AnalyticsCard
      title={t('revenueTrend')}
      subtitle={t('revenueTrendSubtitle')}
      topRight={tableButton}
      contextBar={[
        peak && peak.revenue > 0 ? `${t('bestBucket')}: ${long(peak.bucket)} · ${formatCompactINR(peak.revenue)}` : null,
        range?.partialLastBucket ? t('partialBucketNote') : null,
        onDrill ? t('clickToDrill') : null,
      ].filter(Boolean).join(' · ')}
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{formatCompactINR(current)}</span>
        {change != null ? <TrendCapsule value={change} isPositive={change >= 0} /> : null}
        <span className="pb-1 text-xs text-muted-foreground">
          {t('vsPrevious')} {formatCompactINR(previous)} · {formatCompactNumber(periodTotals?.current?.dispatches || 0)} {t('dispatchesUnit')}
        </span>
      </div>
      {table ? (
        <DataTable
          columns={[
            { key: 'bucket', label: t('period'), format: long },
            { key: 'dispatches', label: t('dispatchesUnit') },
            { key: 'delivered', label: t('delivered') },
            { key: 'revenue', label: t('revenue'), format: formatINR },
          ]}
          rows={rows}
          onRow={drill ? (r) => drill({ activeLabel: r.bucket }) : undefined}
        />
      ) : (
        <ChartBox clickable={Boolean(drill)}>
          <AreaChart data={rows} margin={CHART_MARGIN} onClick={drill}>
            <defs>
              <linearGradient id="kit-revenue" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="bucket" {...X_AXIS} tickFormatter={tick(last)} />
            <YAxis {...Y_AXIS} tickFormatter={formatCompactINR} />
            <RechartsTooltip
              cursor={LINE_CURSOR}
              content={
                <KitTooltip
                  labelFormatter={long}
                  formatter={(v, entry) => `${formatINR(v)} · ${entry.payload.dispatches} ${t('dispatchesUnit')}`}
                />
              }
            />
            <Area type="monotone" dataKey="revenue" name={t('revenue')} stroke={SERIES[0]} strokeWidth={2} fill="url(#kit-revenue)" dot={false} activeDot={ACTIVE_DOT} />
            {rows.length >= BRUSH_MIN_POINTS ? <Brush dataKey="bucket" {...BRUSH} /> : null}
          </AreaChart>
        </ChartBox>
      )}
    </AnalyticsCard>
  );
}

/** Division share of revenue as ranked bars; a row opens that division. */
export function TopDivisionsChart({ data, onDrill }) {
  const t = useT();
  const [table, tableButton] = useTableView();
  if (!data || data.length === 0) return <Empty title={t('divisionContribution')} />;

  const sorted = [...data].sort((a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0));
  const total = sorted.reduce((s, d) => s + Number(d.total_revenue || 0), 0) || 1;
  const shown = sorted.slice(0, 6);
  const otherValue = sorted.slice(6).reduce((s, d) => s + Number(d.total_revenue || 0), 0);
  // Colour by the division's place in the full list, so a division keeps its
  // colour when the list below it changes.
  const rows = shown.map((d, i) => ({
    key: d.division,
    label: d.division || t('unknown'),
    value: Number(d.total_revenue || 0),
    share: (Number(d.total_revenue || 0) / total) * 100,
    color: SERIES[i],
    extra: `${formatCompactNumber(d.shipment_count)} ${t('dispatchesShort')}`,
  }));
  if (otherValue > 0) rows.push({ key: '__other', label: t('otherDivisions'), value: otherValue, share: (otherValue / total) * 100, color: OTHER });
  const open = onDrill
    ? (row) => row.key !== '__other' && onDrill({ title: row.label, filter: { division: row.key }, by: 'item' })
    : undefined;

  return (
    <AnalyticsCard title={t('divisionContribution')} subtitle={t('performanceByUnit')} topRight={tableButton}>
      {table ? (
        <DataTable
          columns={[
            { key: 'division', label: t('division') },
            { key: 'total_revenue', label: t('revenue'), format: formatCompactINR },
            { key: 'shipment_count', label: t('dispatchesShort') },
            { key: 'top_item', label: t('topItem'), format: (v) => v || '—' },
          ]}
          rows={sorted}
          onRow={open ? (r) => open({ key: r.division, label: r.division }) : undefined}
        />
      ) : (
        <RankedBars rows={rows} format={formatCompactINR} onSelect={open} />
      )}
    </AnalyticsCard>
  );
}

/** What was bought against what was sold, per bucket. One axis: both are rupees. */
export function MonthlyCostVolumeChart({ dispatchTrend, inboundTrend, range, onDrill }) {
  const t = useT();
  const [table, tableButton] = useTableView();
  const { tick, long, drill } = useBuckets(range, onDrill);

  const rows = useMemo(() => {
    const byBucket = new Map();
    (inboundTrend || []).forEach((d) => byBucket.set(d.bucket, { bucket: d.bucket, inbound: Number(d.inbound_value || 0), outbound: 0 }));
    (dispatchTrend || []).forEach((d) => byBucket.set(d.bucket, { ...(byBucket.get(d.bucket) || { bucket: d.bucket, inbound: 0 }), outbound: Number(d.revenue || 0) }));
    return [...byBucket.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  }, [inboundTrend, dispatchTrend]);

  if (rows.length === 0) return <Empty title={t('businessFlow')} />;
  const last = rows[rows.length - 1].bucket;
  const totalIn = rows.reduce((s, r) => s + r.inbound, 0);
  const totalOut = rows.reduce((s, r) => s + r.outbound, 0);

  return (
    <AnalyticsCard
      title={t('businessFlow')}
      subtitle={t('inboundOutboundMatch')}
      topRight={
        <>
          <Legend items={[{ label: t('outbound'), color: SERIES[0] }, { label: t('inbound'), color: SERIES[1] }]} />
          {tableButton}
        </>
      }
      contextBar={`${t('outbound')} ${formatCompactINR(totalOut)} · ${t('inbound')} ${formatCompactINR(totalIn)}${range?.partialLastBucket ? ` · ${t('partialBucketNote')}` : ''}`}
    >
      {table ? (
        <DataTable
          columns={[
            { key: 'bucket', label: t('period'), format: long },
            { key: 'outbound', label: t('outbound'), format: formatINR },
            { key: 'inbound', label: t('inbound'), format: formatINR },
          ]}
          rows={rows}
          onRow={drill ? (r) => drill({ activeLabel: r.bucket }) : undefined}
        />
      ) : (
        <ChartBox clickable={Boolean(drill)}>
          <BarChart data={rows} margin={CHART_MARGIN} barGap={BAR_GAP} onClick={drill}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="bucket" {...X_AXIS} tickFormatter={tick(last)} />
            <YAxis {...Y_AXIS} tickFormatter={formatCompactINR} />
            <RechartsTooltip cursor={BAR_CURSOR} content={<KitTooltip labelFormatter={long} formatter={formatINR} />} />
            <Bar dataKey="outbound" name={t('outbound')} fill={SERIES[0]} {...BAR} />
            <Bar dataKey="inbound" name={t('inbound')} fill={SERIES[1]} {...BAR} />
            {rows.length >= BRUSH_MIN_POINTS ? <Brush dataKey="bucket" {...BRUSH} /> : null}
          </BarChart>
        </ChartBox>
      )}
    </AnalyticsCard>
  );
}

/** Revenue and profit per bucket; a loss bar is drawn in the status red. */
export function MonthlyProfitChart({ data, range, onDrill }) {
  const t = useT();
  const [table, tableButton] = useTableView();
  const { tick, long, drill } = useBuckets(range, onDrill);
  if (!data || data.length === 0) return <Empty title={t('profitPerMonth')} />;

  const rows = data.map((d) => {
    const costed = Number(d.costed_revenue ?? d.revenue ?? 0);
    const profit = Number(d.profit || 0);
    return {
      bucket: d.bucket,
      revenue: Number(d.revenue || 0),
      profit,
      cost: Number(d.cost || 0),
      uncosted: Number(d.uncosted_revenue || 0),
      margin: costed > 0 ? (profit / costed) * 100 : null,
    };
  });
  const last = rows[rows.length - 1].bucket;
  // Range totals. Margin is over revenue that could be costed; revenue from
  // items with no purchase cost is called out rather than counted as profit.
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const costedTotal = sum('revenue') - sum('uncosted');
  const marginTotal = costedTotal > 0 ? (sum('profit') / costedTotal) * 100 : null;
  const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);

  return (
    <AnalyticsCard
      title={t('profitPerMonth')}
      subtitle={t('profitSubtitle')}
      topRight={
        <>
          <Legend items={[{ label: t('revenue'), color: SERIES[0] }, { label: t('profit'), color: SERIES[2] }]} />
          {tableButton}
        </>
      }
      contextBar={[
        `${formatCompactINR(sum('profit'))} ${t('profit')} · ${pct(marginTotal)} ${t('margin')}`,
        sum('uncosted') > 0 ? `${formatCompactINR(sum('uncosted'))} ${t('uncostedRevenue')}` : null,
        range?.partialLastBucket ? t('partialBucketNote') : null,
      ].filter(Boolean).join(' · ')}
    >
      {table ? (
        <DataTable
          columns={[
            { key: 'bucket', label: t('period'), format: long },
            { key: 'revenue', label: t('revenue'), format: formatINR },
            { key: 'cost', label: t('cost'), format: formatINR },
            { key: 'profit', label: t('profit'), format: formatINR },
            { key: 'margin', label: t('margin'), format: pct },
            { key: 'uncosted', label: t('uncostedRevenue'), format: formatINR },
          ]}
          rows={rows}
          onRow={drill ? (r) => drill({ activeLabel: r.bucket }) : undefined}
        />
      ) : (
        <ChartBox clickable={Boolean(drill)}>
          <BarChart data={rows} margin={CHART_MARGIN} barGap={BAR_GAP} onClick={drill}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="bucket" {...X_AXIS} tickFormatter={tick(last)} />
            <YAxis {...Y_AXIS} tickFormatter={formatCompactINR} />
            <RechartsTooltip
              cursor={BAR_CURSOR}
              content={(props) => (
                <KitTooltip
                  {...props}
                  labelFormatter={long}
                  formatter={formatINR}
                  hint={props.payload?.[0] ? `${pct(props.payload[0].payload.margin)} ${t('margin')}` : null}
                />
              )}
            />
            <Bar dataKey="revenue" name={t('revenue')} fill={SERIES[0]} {...BAR} />
            <Bar dataKey="profit" name={t('profit')} fill={SERIES[2]} {...BAR}>
              {rows.map((r) => <Cell key={r.bucket} fill={r.profit < 0 ? STATUS_BAD : SERIES[2]} />)}
            </Bar>
            {rows.length >= BRUSH_MIN_POINTS ? <Brush dataKey="bucket" {...BRUSH} /> : null}
          </BarChart>
        </ChartBox>
      )}
    </AnalyticsCard>
  );
}

/** Top five sellers over the range; legend names open a person, the plot opens a bucket. */
export function SalespersonTrendChart({ trend, range, onDrill }) {
  const t = useT();
  const [table, tableButton] = useTableView();
  const { tick, long, drill } = useBuckets(range, onDrill, 'salesperson');

  const { rows, people, totals } = useMemo(() => {
    const totals = {};
    (trend || []).forEach((r) => { totals[r.salesperson] = (totals[r.salesperson] || 0) + Number(r.total_revenue || 0); });
    const people = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
    const byBucket = new Map();
    (trend || []).forEach((r) => {
      if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, Object.fromEntries([['bucket', r.bucket], ...people.map((p) => [p, 0])]));
      if (people.includes(r.salesperson)) byBucket.get(r.bucket)[r.salesperson] = Number(r.total_revenue || 0);
    });
    return { rows: [...byBucket.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1)), people, totals };
  }, [trend]);

  if (rows.length === 0) return <Empty title={t('salespersonMonthly')} />;
  const last = rows[rows.length - 1].bucket;
  // Colour by overall rank across the range, fixed for the chart's life.
  const color = (i) => SERIES[i];

  return (
    <AnalyticsCard title={t('salespersonMonthly')} subtitle={t('salespersonMonthlySubtitle')} topRight={tableButton}>
      {table ? (
        <DataTable
          columns={[{ key: 'bucket', label: t('period'), format: long }, ...people.map((p) => ({ key: p, label: p, format: formatCompactINR }))]}
          rows={rows}
          onRow={drill ? (r) => drill({ activeLabel: r.bucket }) : undefined}
        />
      ) : (
        <ChartBox clickable={Boolean(drill)}>
          <LineChart data={rows} margin={CHART_MARGIN} onClick={drill}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="bucket" {...X_AXIS} tickFormatter={tick(last)} />
            <YAxis {...Y_AXIS} tickFormatter={formatCompactINR} />
            <RechartsTooltip cursor={LINE_CURSOR} content={<KitTooltip labelFormatter={long} formatter={formatCompactINR} />} />
            {people.map((p, i) => (
              <Line key={p} type="monotone" dataKey={p} name={p} stroke={color(i)} strokeWidth={2} dot={false} activeDot={ACTIVE_DOT} />
            ))}
            {rows.length >= BRUSH_MIN_POINTS ? <Brush dataKey="bucket" {...BRUSH} /> : null}
          </LineChart>
        </ChartBox>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {people.map((p, i) => (
          <button
            key={p}
            type="button"
            disabled={!onDrill}
            onClick={() => onDrill?.({ title: p, filter: { salesperson: p }, by: 'customer' })}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-ring disabled:cursor-default"
          >
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color(i) }} />
            <span className="max-w-[10rem] truncate">{p}</span>
            <span className="tabular-nums text-foreground">{formatCompactINR(totals[p])}</span>
          </button>
        ))}
      </div>
    </AnalyticsCard>
  );
}

// Days of stock left below which a best seller is flagged. ponytail: flat
// thresholds; per-item lead times would be the upgrade if suppliers differ a lot.
const DAYS_LEFT_URGENT = 15;
const DAYS_LEFT_SOON = 30;

export function TopSellersWidget({ items, onDrill }) {
  const t = useT();
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
  const headCell = 'text-xs font-medium text-muted-foreground';
  const cols = 'md:grid md:grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4';
  const Row = onDrill ? 'button' : 'div';
  return (
    <AnalyticsCard
      title={t('topSellers')}
      subtitle={t('topSellersSubtitle')}
      contextBar={top80Count > 0 ? `${top80Count} ${t('ofLabel')} ${totalItems} ${t('itemsEqual80')}` : null}
    >
      <div className={`hidden ${cols} border-b border-border/60 px-2 pb-2`}>
        <span />
        <span className={headCell}>{t('item')}</span>
        <span className={headCell}>{t('revenue')}</span>
        <span className={`${headCell} text-right`}>{t('sold')}</span>
        <span className={`${headCell} text-right`}>{t('profit')}</span>
        <span className={`${headCell} text-right`}>{t('stockLeft')}</span>
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
        {items.map((it) => {
          const revenue = Number(it.revenue || 0);
          const profit = Number(it.gross_profit || 0);
          const margin = it.margin_pct != null ? Number(it.margin_pct) : null;
          const daysLeft = it.days_left != null ? Number(it.days_left) : null;
          const daysTone = daysLeft == null
            ? 'text-muted-foreground'
            : daysLeft <= DAYS_LEFT_URGENT
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
              : daysLeft <= DAYS_LEFT_SOON
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground';
          return (
            <Row
              key={it.id}
              {...(onDrill ? { type: 'button', onClick: () => onDrill({ title: it.name, filter: { item: it.id }, by: 'customer' }) } : {})}
              className={`${cols} grid w-full grid-cols-2 gap-x-4 gap-y-2 rounded-md border-b border-border/50 px-2 py-2 text-left last:border-b-0 ${onDrill ? 'transition-colors hover:bg-muted/60 focus-ring' : ''}`}
            >
              <span className="hidden text-right text-xs tabular-nums text-muted-foreground md:block">{it.rank}</span>
              <div className="col-span-2 min-w-0 md:col-span-1">
                <p className="truncate text-xs font-medium text-foreground" title={it.name}>
                  <span className="tabular-nums text-muted-foreground md:hidden">{it.rank}. </span>{it.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{it.division}{it.sku ? ` · ${it.sku}` : ''}</p>
              </div>
              <div className="col-span-2 min-w-0 md:col-span-1">
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-xs font-semibold text-foreground">{formatCompactINR(revenue)}</span>
                  <span className="text-[11px] text-muted-foreground">{Number(it.share_pct || 0).toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (revenue / maxRev) * 100)}%`, backgroundColor: SERIES[0] }} />
                </div>
              </div>
              <div className="tabular-nums md:text-right">
                <span className="text-xs text-muted-foreground md:hidden">{t('sold')} </span>
                <span className="text-xs font-semibold text-foreground">{formatCompactNumber(it.units)}</span>
              </div>
              <div className="text-right tabular-nums">
                <p className={`text-xs font-semibold ${profit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                  <span className="text-xs font-normal text-muted-foreground md:hidden">{t('profit')} </span>
                  {formatCompactINR(profit)}
                </p>
                {margin != null ? <p className="text-[11px] text-muted-foreground">{margin.toFixed(1)}% {t('margin')}</p> : null}
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2 tabular-nums md:col-span-1 md:justify-end">
                <span className="text-[11px] text-muted-foreground">{formatCompactNumber(it.in_stock)} {t('onHandShort')}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${daysTone}`}>
                  {daysLeft != null ? `${daysLeft}${t('daysShort')}` : '—'}
                </span>
              </div>
            </Row>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}
