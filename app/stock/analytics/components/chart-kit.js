'use client';
// One look for every analytics chart. Recharts components can't be wrapped and
// still be found by their parent chart, so the shared pieces are prop objects
// spread onto <XAxis>/<YAxis>/<CartesianGrid>, plus a few plain-HTML parts
// (legend, table view, ranked bars, sparkline) that need no chart at all.
import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { BarChart3, ChevronRight, Table2 } from 'lucide-react';

// Fixed categorical order - colour follows the entity, never its rank. Values
// are CSS variables (styles/globals.css) so light and dark each get their own
// validated step.
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
export const OTHER = 'var(--series-other)';
export const STATUS_GOOD = 'var(--status-good)';
export const STATUS_BAD = 'var(--status-bad)';

export const X_AXIS = {
  tick: { fontSize: 11, fill: 'var(--chart-axis)' },
  axisLine: false,
  tickLine: false,
  tickMargin: 8,
  minTickGap: 16,
};
export const Y_AXIS = { ...X_AXIS, width: 56, tickMargin: 4 };
export const GRID = { vertical: false, stroke: 'var(--chart-grid)', strokeDasharray: '' };
export const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
// Bars: thin, rounded only at the data end, a 2px gap between neighbours.
export const BAR = { maxBarSize: 28, radius: [4, 4, 0, 0] };
export const BAR_GAP = 2;
export const BAR_CURSOR = { fill: 'var(--chart-cursor)' };
// Line/area: a hairline crosshair finds the X; dots only on hover.
export const LINE_CURSOR = { stroke: 'var(--chart-axis)', strokeWidth: 1, strokeOpacity: 0.4 };
export const ACTIVE_DOT = { r: 4, stroke: 'rgb(var(--card))', strokeWidth: 2 };
export const BRUSH = {
  height: 22,
  travellerWidth: 8,
  stroke: 'var(--chart-axis)',
  fill: 'transparent',
  tickFormatter: () => '',
};
// Time series longer than this get a brush to zoom into.
export const BRUSH_MIN_POINTS = 13;

/**
 * Tooltip: every series at the hovered X. Value leads in strong ink, the name
 * follows in muted ink, keyed by a short line of the series colour.
 */
export function KitTooltip({ active, payload, label, formatter = (v) => v, labelFormatter, hint }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[10rem] rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-float">
      <p className="mb-1.5 text-[11px] text-muted-foreground">{labelFormatter ? labelFormatter(label) : label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey ?? entry.name} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
            <span className="text-sm font-semibold tabular-nums text-foreground">{formatter(entry.value, entry)}</span>
            <span className="truncate text-xs text-muted-foreground">{entry.name}</span>
          </div>
        ))}
      </div>
      {hint ? <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Legend: a rect for bars and areas, a line for lines. Text stays in text ink. */
export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={item.kind === 'line' ? 'h-0.5 w-3 shrink-0 rounded-full' : 'h-2.5 w-2.5 shrink-0 rounded-[3px]'}
            style={{ backgroundColor: item.color }}
          />
          <span className="max-w-[10rem] truncate">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Chart/table switch for a card's header. Returns [showTable, button]. */
export function useTableView() {
  const [table, setTable] = useState(false);
  const button = (
    <button
      type="button"
      onClick={() => setTable((v) => !v)}
      aria-pressed={table}
      title={table ? 'Show chart' : 'Show table'}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
    >
      {table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
      <span className="sr-only">{table ? 'Show chart' : 'Show table'}</span>
    </button>
  );
  return [table, button];
}

/**
 * The same rows the chart draws, readable without hovering.
 * columns: [{ key, label, format?, align? }]; onRow makes a row a drill target.
 */
export function DataTable({ columns, rows, onRow, maxHeight = 'max-h-80' }) {
  return (
    <div className={`${maxHeight} overflow-auto`}>
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th key={c.key} className={`py-2 pr-3 font-medium text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={r}
              onClick={onRow ? () => onRow(row) : undefined}
              className={`border-b border-border/50 last:border-0 ${onRow ? 'cursor-pointer hover:bg-muted/60' : ''}`}
            >
              {columns.map((c, i) => (
                <td key={c.key} className={`py-1.5 pr-3 ${i === 0 ? 'text-left text-foreground' : 'text-right text-foreground'}`}>
                  {c.format ? c.format(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ranked horizontal bars with direct labels: the replacement for the donuts.
 * Lengths compare at a glance where angles don't, and each row is a button.
 * rows: [{ key, label, sub?, value, share?, color?, extra? }]
 */
export function RankedBars({ rows, format, onSelect, selectedKey }) {
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.value || 0))), 1);
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const Wrapper = onSelect ? 'button' : 'div';
        const pct = (Math.abs(Number(row.value || 0)) / max) * 100;
        return (
          <li key={row.key}>
            <Wrapper
              {...(onSelect ? { type: 'button', onClick: () => onSelect(row) } : {})}
              className={`group w-full rounded-md px-2 py-1.5 text-left ${onSelect ? 'transition-colors hover:bg-muted/70 focus-ring' : ''} ${selectedKey === row.key ? 'bg-muted' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-foreground" title={row.label}>
                  {row.label}
                  {row.sub ? <span className="ml-1.5 text-muted-foreground">{row.sub}</span> : null}
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  {row.extra ? <span className="text-[11px] text-muted-foreground">{row.extra}</span> : null}
                  <span className="font-semibold text-foreground">{format(row.value)}</span>
                  {row.share != null ? <span className="w-10 text-right text-[11px] text-muted-foreground">{row.share.toFixed(1)}%</span> : null}
                  {onSelect ? <ChevronRight className="h-3 w-3 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: row.color || SERIES[0] }} />
              </div>
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}

/** A trend with no axes, for stat tiles. */
export function Sparkline({ data, dataKey, color = SERIES[0], id }) {
  if (!data || data.length < 2) return <div className="h-10" />;
  return (
    <div className="h-10">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#spark-${id})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** "Now" / "This month" tag for widgets the range picker does not cut. */
export function ScopeTag({ children }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/** Shared onClick for a time-series chart: hands back the clicked bucket. */
export function bucketClick(onDrill) {
  if (!onDrill) return undefined;
  return (state) => {
    if (state?.activeLabel != null) onDrill(String(state.activeLabel));
  };
}
