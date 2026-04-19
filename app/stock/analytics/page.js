'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import { useAuthUser } from '@/lib/auth-client';

function formatChartDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatChartLongDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function getRoundedAxisScale(maxValue, targetTickCount = 4) {
  const safeMax = Math.max(Number(maxValue || 0), 1);
  const roughStep = safeMax / Math.max(targetTickCount, 2);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  let niceStepFactor = 1;
  if (normalized > 5) niceStepFactor = 10;
  else if (normalized > 2) niceStepFactor = 5;
  else if (normalized > 1) niceStepFactor = 2;
  const step = niceStepFactor * magnitude;
  const maxRounded = Math.ceil(safeMax / step) * step;
  return { step, maxRounded };
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatCurrencyInr(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatMonthLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);
}

function AnalyticsCard({ title, subtitle, index = 0, children, chips = [], explanation = '', whatThisMeansLabel = '...' }) {
  return (
    <section className="analytics-card rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        {chips.length ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {chips.map((chip) => (
              <span key={`${title}-${chip.label}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                {chip.label}: <span className="font-mono">{chip.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {explanation ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{whatThisMeansLabel} </span>{explanation}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function InteractiveLineChart({ rows, series, height = 230, xLabel = 'Month', valueFormatter = (value) => Number(value || 0).toFixed(0), emptyText = '—' }) {
  const [hoverState, setHoverState] = useState(null);
  const [showSeries, setShowSeries] = useState(() => Object.fromEntries(series.map((entry) => [entry.key, true])));

  if (!rows.length) {
    return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">{emptyText}</div>;
  }

  const width = 700;
  const padding = { top: 18, right: 16, bottom: 34, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.flatMap((row) => series.map((entry) => Number(row[entry.key] || 0))), 1);

  const pointX = (index) => {
    if (rows.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (rows.length - 1)) * innerWidth;
  };

  const pointY = (value) => padding.top + innerHeight - (Number(value || 0) / maxValue) * innerHeight;
  const linePath = (key) => rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index)} ${pointY(row[key])}`).join(' ');

  const areaPath = (key) => {
    const line = linePath(key);
    if (!line) return '';
    const firstX = pointX(0);
    const lastX = pointX(rows.length - 1);
    const baselineY = pointY(0);
    return `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  };

  const hexToRgba = (hex, alpha) => {
    const safe = String(hex || '').replace('#', '').trim();
    if (safe.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
    const r = Number.parseInt(safe.slice(0, 2), 16);
    const g = Number.parseInt(safe.slice(2, 4), 16);
    const b = Number.parseInt(safe.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const labelStride = rows.length > 8 ? Math.ceil(rows.length / 8) : 1;

  function handleMouseMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const localXPx = event.clientX - bounds.left;
    const localYPx = event.clientY - bounds.top;
    const clampedRatio = Math.min(Math.max(localXPx / Math.max(bounds.width, 1), 0), 1);
    const nearestIndex = Math.round(clampedRatio * (rows.length - 1));
    const tooltipWidth = 220;
    const tooltipHeight = 92;
    const tooltipLeft = Math.min(Math.max(localXPx + 14, 8), bounds.width - tooltipWidth - 8);
    const tooltipTop = Math.min(Math.max(localYPx - tooltipHeight - 10, 8), bounds.height - tooltipHeight - 8);
    setHoverState({ index: nearestIndex, tooltipLeft, tooltipTop });
  }

  const hoverRow = hoverState ? rows[hoverState.index] : null;
  const hoverLabelSource = hoverRow ? (hoverRow.bucket || hoverRow.date) : null;
  const hoverDateLabel = hoverLabelSource ? formatChartLongDate(hoverLabelSource) : '—';
  const visibleSeries = series.map((entry) => ({ ...entry, shown: showSeries[entry.key] !== false }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        {visibleSeries.map((entry) => (
          <button
            key={`legend-${entry.key}`}
            type="button"
            onClick={() => setShowSeries((current) => ({ ...current, [entry.key]: !current[entry.key] }))}
            aria-pressed={entry.shown}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${entry.shown ? 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200' : 'border-slate-200 bg-white/50 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500'}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full rounded-xl border border-border bg-white/70 sm:h-56 dark:bg-slate-950/40">
          {[0, 0.5, 1].map((tick) => {
            const value = Math.round(maxValue * tick);
            const y = pointY(value);
            return (
              <g key={`line-grid-${tick}`}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
                <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{valueFormatter(value)}</text>
              </g>
            );
          })}

          {visibleSeries.map((entry, seriesIndex) => (
            <g key={`series-${entry.key}`}>
              {entry.shown ? <path d={areaPath(entry.key)} fill={hexToRgba(entry.color, 0.08)} /> : null}
              <path d={linePath(entry.key)} fill="none" stroke={entry.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={entry.shown ? 1 : 0} style={{ animation: `drawStroke 700ms ease ${seriesIndex * 120}ms both` }} />
              {rows.map((row, index) => (
                <circle key={`dot-${entry.key}-${row.bucket || index}`} cx={pointX(index)} cy={pointY(row[entry.key])} r={hoverState?.index === index ? '4.5' : '4'} fill="white" stroke={entry.color} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity={entry.shown ? 1 : 0} className="transition-all duration-150" />
              ))}
            </g>
          ))}

          {rows.map((row, index) => {
            const showLabel = index % labelStride === 0 || index === rows.length - 1;
            if (!showLabel) return null;
            return (
              <text key={`x-${row.bucket || index}`} x={pointX(index)} y={height - 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">{formatChartDate(row.bucket || row.date)}</text>
            );
          })}

          <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverState(null)} />

          {hoverState ? <line x1={pointX(hoverState.index)} y1={padding.top} x2={pointX(hoverState.index)} y2={padding.top + innerHeight} stroke="#94A3B8" strokeWidth="1" strokeDasharray="4 4" /> : null}
        </svg>

        {hoverRow ? (
          <div className="pointer-events-none absolute z-10 w-[220px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" style={{ left: hoverState.tooltipLeft, top: hoverState.tooltipTop }}>
            <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{xLabel}: {hoverDateLabel}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {visibleSeries.filter((entry) => entry.shown).map((entry) => (
                <span key={`hover-${entry.key}`} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.label}: <span className="font-mono">{valueFormatter(hoverRow[entry.key])}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MovementTrendChart({ rows, labels = {} }) {
  const [hoverState, setHoverState] = useState(null);
  const [showSeries, setShowSeries] = useState({ inbound: true, outbound: true });

  const localLabels = {
    noData: labels.noData || '—',
    inbound: labels.inbound || '—',
    outbound: labels.outbound || '—',
    netChange: labels.netChange || '—',
  };

  if (!rows.length) {
    return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">{localLabels.noData}</div>;
  }

  const width = 760;
  const height = 250;
  const padding = { top: 20, right: 20, bottom: 56, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxChartValue = Math.max(...rows.map((point) => Math.max(Number(point.inbound || 0), Number(point.outbound || 0))), 1);
  const { step: yStep, maxRounded } = getRoundedAxisScale(maxChartValue, 4);
  const yTicks = Array.from({ length: Math.floor(maxRounded / yStep) + 1 }, (_, index) => maxRounded - index * yStep);

  const pointX = (index) => {
    if (rows.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (rows.length - 1)) * innerWidth;
  };

  const pointY = (value) => padding.top + innerHeight - (Number(value || 0) / maxRounded) * innerHeight;
  const baselineY = pointY(0);
  const linePath = (key) => rows.map((point, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index)} ${pointY(point[key])}`).join(' ');

  const areaPath = (key) => {
    const line = linePath(key);
    if (!line) return '';
    const firstX = pointX(0);
    const lastX = pointX(rows.length - 1);
    return `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  };

  const getPeak = (key) => rows.reduce((currentPeak, point, index) => {
    const value = Number(point[key] || 0);
    if (!currentPeak || value > currentPeak.value) return { index, value, date: point.date };
    return currentPeak;
  }, null);

  const inboundPeak = getPeak('inbound');
  const outboundPeak = getPeak('outbound');

  const visibleSeries = [
    { key: 'inbound', label: 'Incoming', stroke: '#22C55E', fill: 'rgba(34, 197, 94, 0.08)', shown: showSeries.inbound },
    { key: 'outbound', label: 'Outgoing', stroke: '#E07A00', fill: 'rgba(249, 115, 22, 0.08)', shown: showSeries.outbound },
  ];

  const labelStride = rows.length > 8 ? Math.ceil(rows.length / 8) : 1;
  const rotateLabels = rows.length > 10;

  const handleMouseMove = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const localXPx = event.clientX - bounds.left;
    const localYPx = event.clientY - bounds.top;
    const clampedRatio = Math.min(Math.max(localXPx / Math.max(bounds.width, 1), 0), 1);
    const nearestIndex = Math.round(clampedRatio * (rows.length - 1));
    const tooltipWidth = 196;
    const tooltipHeight = 96;
    const tooltipLeft = Math.min(Math.max(localXPx + 14, 8), bounds.width - tooltipWidth - 8);
    const tooltipTop = Math.min(Math.max(localYPx - tooltipHeight - 12, 8), bounds.height - tooltipHeight - 8);
    setHoverState({ index: nearestIndex, tooltipLeft, tooltipTop });
  };

  const hoverPoint = hoverState ? rows[hoverState.index] : null;
  const netChange = hoverPoint ? Number(hoverPoint.inbound || 0) - Number(hoverPoint.outbound || 0) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        {visibleSeries.map((seriesEntry) => (
          <button
            key={`movement-chip-${seriesEntry.key}`}
            type="button"
            onClick={() => setShowSeries((current) => ({ ...current, [seriesEntry.key]: !current[seriesEntry.key] }))}
            aria-pressed={seriesEntry.shown}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${seriesEntry.shown ? 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200' : 'border-slate-200 bg-white/50 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500'}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seriesEntry.stroke }} />
            {seriesEntry.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full rounded-xl border border-border bg-white/70 sm:h-56 dark:bg-slate-950/40" preserveAspectRatio="xMidYMid meet">
          {yTicks.map((value) => {
            const y = pointY(value);
            const isZero = value === 0;
            return (
              <g key={`movement-grid-${value}`}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" className={isZero ? 'text-slate-300 dark:text-slate-600' : 'text-slate-100 dark:text-slate-800'} />
                <text x={padding.left - 8} y={y + 3} textAnchor="end" className="fill-slate-500 text-[10px] dark:fill-slate-400">{Math.round(value)}</text>
              </g>
            );
          })}

          {visibleSeries.map((seriesEntry) => {
            if (!seriesEntry.shown) return null;
            return (
              <g key={`movement-series-${seriesEntry.key}`}>
                <path d={areaPath(seriesEntry.key)} fill={seriesEntry.fill} />
                <path d={linePath(seriesEntry.key)} fill="none" stroke={seriesEntry.stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {rows.map((point, index) => (
                  <circle key={`movement-point-${seriesEntry.key}-${point.date}`} cx={pointX(index)} cy={pointY(point[seriesEntry.key])} r={hoverState?.index === index ? '4.5' : '4'} fill="white" stroke={seriesEntry.stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            );
          })}

          {showSeries.inbound && inboundPeak ? (
            <g>
              <text x={pointX(inboundPeak.index)} y={Math.max(pointY(inboundPeak.value) - 10, 12)} textAnchor="middle" className="fill-emerald-600 text-[10px] font-semibold">Peak In</text>
            </g>
          ) : null}

          {showSeries.outbound && outboundPeak ? (
            <g>
              <text x={pointX(outboundPeak.index)} y={Math.max(pointY(outboundPeak.value) - 10, 12)} textAnchor="middle" className="fill-orange-600 text-[10px] font-semibold">Peak Out</text>
            </g>
          ) : null}

          {rows.map((point, index) => {
            const shouldRenderLabel = index % labelStride === 0 || index === rows.length - 1;
            if (!shouldRenderLabel) return null;
            const label = formatChartDate(point.date);
            return (
              <g key={`movement-x-label-${point.date}`}>
                {rotateLabels ? (
                  <text x={pointX(index)} y={height - 8} textAnchor="end" transform={`rotate(-45 ${pointX(index)} ${height - 8})`} className="fill-slate-500 text-[10px] dark:fill-slate-400">{label}</text>
                ) : (
                  <text x={pointX(index)} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">{label}</text>
                )}
              </g>
            );
          })}

          <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverState(null)} />

          {hoverState ? <line x1={pointX(hoverState.index)} y1={padding.top} x2={pointX(hoverState.index)} y2={baselineY} stroke="#94A3B8" strokeWidth="1" strokeDasharray="4 4" /> : null}
        </svg>

        {hoverPoint ? (
          <div className="pointer-events-none absolute z-10 w-48 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" style={{ left: hoverState.tooltipLeft, top: hoverState.tooltipTop }}>
            <div className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{formatChartLongDate(hoverPoint.date)}</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{localLabels.inbound}</span>
                <span className="font-mono">{Number(hoverPoint.inbound || 0)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#E07A00]" />{localLabels.outbound}</span>
                <span className="font-mono">{Number(hoverPoint.outbound || 0)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-semibold dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-200">{localLabels.netChange}</span>
                <span className={`font-mono ${netChange >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{netChange}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniDonut({ segments }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const values = segments.map((segment) => Number(segment.value || 0));
  const colors = segments.map((segment) => segment.color);
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const activeSegment = hoveredIndex != null ? segments[hoveredIndex] : null;

  return (
    <div className="space-y-2">
      <svg viewBox="0 0 90 90" className="h-24 w-24">
        <g transform="translate(45,45)">
          {values.map((value, index) => {
            const segment = (Number(value || 0) / total) * circumference;
            const node = (
              <circle
                key={`donut-${index}`}
                r={radius}
                fill="none"
                stroke={colors[index]}
                strokeWidth={hoveredIndex === index ? '12' : '10'}
                strokeDasharray={`${segment} ${circumference - segment}`}
                strokeDashoffset={-offset}
                transform="rotate(-90)"
                style={{ animation: `drawStroke 800ms ease ${index * 120}ms both` }}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoveredIndex(index)}
              />
            );
            offset += segment;
            return node;
          })}
          <text textAnchor="middle" y="3" className="fill-slate-700 text-[9px] font-semibold dark:fill-slate-100">{formatCompactNumber(total)}</text>
        </g>
      </svg>
      {activeSegment ? (
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-900">
          <span className="font-semibold" style={{ color: activeSegment.color }}>{activeSegment.label}: </span>
          <span className="font-mono text-slate-700 dark:text-slate-200">{activeSegment.value}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { language } = useLanguage();
  const { user } = useAuthUser();

  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ta = {
    title: language === 'hi' ? 'विश्लेषण' : 'Analytics',
    subtitle: language === 'hi' ? 'स्टॉक वर्कफ़्लो आधारित प्रोसेस इंटेलिजेंस दृश्य' : 'Process intelligence view powered by stock workflows',
    dateRange: language === 'hi' ? 'तिथि सीमा' : 'Date Range',
    last3Months: language === 'hi' ? 'पिछले 3 महीने' : 'Last 3 months',
    last6Months: language === 'hi' ? 'पिछले 6 महीने' : 'Last 6 months',
    last12Months: language === 'hi' ? 'पिछले 12 महीने' : 'Last 12 months',
    paid: language === 'hi' ? 'भुगतान' : 'Paid',
    partial: language === 'hi' ? 'आंशिक' : 'Partial',
    unpaid: language === 'hi' ? 'अदेय' : 'Unpaid',
    salesperson: language === 'hi' ? 'सेल्सपर्सन' : 'Salesperson',
    qty: language === 'hi' ? 'मात्रा' : 'Qty',
    growth: language === 'hi' ? 'वृद्धि' : 'Growth',
    consistencyShort: language === 'hi' ? 'स्थिरता' : 'Cons.',
    whatThisMeans: language === 'hi' ? 'इसका अर्थ:' : 'What this means:',
    noChartData: language === 'hi' ? 'अभी कोई चार्ट डेटा उपलब्ध नहीं है।' : 'No chart data available yet.',
    noMovementData: language === 'hi' ? 'अभी कोई मूवमेंट डेटा उपलब्ध नहीं है।' : 'No movement data available yet.',
    inbound: language === 'hi' ? 'आवक' : 'Inbound',
    outbound: language === 'hi' ? 'जावक' : 'Outbound',
    netChange: language === 'hi' ? 'शुद्ध परिवर्तन' : 'Net Change',
  };

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [analyticsResponse, adminAnalyticsResponse] = await Promise.all([
          fetch('/api/stock/dashboard'),
          fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}`, { cache: 'no-store' }),
        ]);

        const analyticsJson = await analyticsResponse.json();
        const adminAnalyticsJson = await adminAnalyticsResponse.json();

        if (!analyticsResponse.ok) throw new Error(analyticsJson.error || 'Failed to load analytics');
        if (!adminAnalyticsResponse.ok) throw new Error(adminAnalyticsJson.error || 'Failed to load admin analytics');

        if (mounted) {
          setAnalyticsData(analyticsJson);
          setAdminAnalytics(adminAnalyticsJson);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user) loadData();
    return () => { mounted = false; };
  }, [user, analyticsRangeMonths]);

  const purchaseTrendRows = adminAnalytics?.purchasePerformance?.trend || [];
  const purchaseFunnel = adminAnalytics?.purchasePerformance?.funnel || {};
  const dispatchTrendRows = adminAnalytics?.dispatchPerformance?.trend || [];
  const costTrendRows = adminAnalytics?.costAndPayment?.trend || [];
  const paymentMixRows = adminAnalytics?.costAndPayment?.paymentMix || [];
  const paymentExposure = adminAnalytics?.costAndPayment?.exposure || {};
  const inventoryDivisionRisk = adminAnalytics?.inventoryHealth?.divisionRisk || [];
  const inventoryRiskTrend = adminAnalytics?.inventoryHealth?.trend || [];
  const salespersonTrendRows = adminAnalytics?.salespersonPerformance?.trend || [];
  const salespersonRanking = adminAnalytics?.salespersonPerformance?.ranking || [];

  const topSalespeople = salespersonRanking.slice(0, 3).map((row) => row.salesperson);
  const salespersonTrendByMonth = useMemo(() => {
    const map = new Map();
    for (const row of salespersonTrendRows) {
      const bucket = row.bucket;
      const current = map.get(bucket) || { bucket };
      current[row.salesperson] = Number(row.total_qty || 0);
      map.set(bucket, current);
    }
    return Array.from(map.values()).sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
  }, [salespersonTrendRows]);

  const funnelMax = Math.max(
    Number(purchaseFunnel.pending || 0),
    Number(purchaseFunnel.reviewed || 0),
    Number(purchaseFunnel.approved || 0),
    Number(purchaseFunnel.rejected || 0),
    Number(purchaseFunnel.changes_requested || 0),
    1
  );

  const movementByDate = new Map();
  (analyticsData?.recentArrivals || []).forEach((shipment) => {
    const dateSource = shipment.arrival_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) return;
    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.inbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });
  (analyticsData?.recentDispatches || []).forEach((shipment) => {
    const dateSource = shipment.dispatch_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) return;
    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.outbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  const movementTrend = Array.from(movementByDate.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
  const movementPeak = movementTrend.reduce((peak, point) => {
    const total = Number(point.inbound || 0) + Number(point.outbound || 0);
    if (!peak || total > peak.total) return { ...point, total };
    return peak;
  }, null);
  const movementSummary = movementPeak
    ? `High-volume day detected on ${formatChartLongDate(movementPeak.date)} with ${formatCompactNumber(movementPeak.total)} units moved.`
    : 'Waiting for enough movement history to identify a high-volume day.';

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-10 w-48" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`skeleton-${index}`} className="animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800 h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground lg:text-2xl">{ta.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{ta.subtitle}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
          {ta.dateRange}
          <select
            value={analyticsRangeMonths}
            onChange={(event) => setAnalyticsRangeMonths(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-[#E07A00] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value={3}>{ta.last3Months}</option>
            <option value={6}>{ta.last6Months}</option>
            <option value={12}>{ta.last12Months}</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AnalyticsCard
          title="Movement Trend"
          subtitle="Quantity trend for recent arrivals and dispatches"
          index={0}
          explanation="Tracks stock flow direction. When outgoing stays above incoming for many periods, replenishment pressure usually rises."
          whatThisMeansLabel={ta.whatThisMeans}
          chips={[
            { label: 'Incoming', value: formatCompactNumber(movementTrend.reduce((sum, point) => sum + Number(point.inbound || 0), 0)) },
            { label: 'Outgoing', value: formatCompactNumber(movementTrend.reduce((sum, point) => sum + Number(point.outbound || 0), 0)) },
          ]}
        >
          <div className="mb-2 text-xs text-slate-600 dark:text-slate-300">{movementSummary}</div>
          <MovementTrendChart rows={movementTrend} labels={{ noData: ta.noMovementData, inbound: ta.inbound, outbound: ta.outbound, netChange: ta.netChange }} />
        </AnalyticsCard>

        <AnalyticsCard
          title="Purchase Throughput & Approval Funnel"
          subtitle="Monthly approvals progression"
          index={1}
          explanation="Shows how purchase approvals move through each stage. A widening gap between pending and approved means review latency is increasing."
          whatThisMeansLabel={ta.whatThisMeans}
          chips={[
            { label: 'Total', value: adminAnalytics?.purchasePerformance?.kpis?.totalPurchases || 0 },
            { label: 'Approval', value: formatPercent(adminAnalytics?.purchasePerformance?.kpis?.approvalRate || 0) },
          ]}
        >
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <InteractiveLineChart
                rows={purchaseTrendRows}
                emptyText={ta.noChartData}
                series={[
                  { key: 'pending', label: 'Pending', color: '#3B82F6' },
                  { key: 'reviewed', label: 'Reviewed', color: '#8B5CF6' },
                  { key: 'approved', label: 'Approved', color: '#10B981' },
                  { key: 'changes_requested', label: 'Changes', color: '#F59E0B' },
                  { key: 'rejected', label: 'Rejected', color: '#EF4444' },
                ]}
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              {[
                ['Pending', purchaseFunnel.pending, '#3B82F6'],
                ['Reviewed', purchaseFunnel.reviewed, '#8B5CF6'],
                ['Approved', purchaseFunnel.approved, '#10B981'],
                ['Changes', purchaseFunnel.changes_requested, '#F59E0B'],
                ['Rejected', purchaseFunnel.rejected, '#EF4444'],
              ].map(([label, value, color]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>{label}</span>
                    <span className="font-mono">{value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <span className="block h-full rounded-full" style={{ width: `${(Number(value || 0) / funnelMax) * 100}%`, backgroundColor: color, animation: 'growWidth 700ms ease both' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Dispatch Fulfillment & Delay Trend"
          subtitle="Status mix with delay and on-time service"
          index={2}
          explanation="Compares dispatch workload with delivery quality. If delay rises while throughput rises, last-mile execution is under stress."
          whatThisMeansLabel={ta.whatThisMeans}
          chips={[
            { label: 'On-time', value: formatPercent(adminAnalytics?.dispatchPerformance?.kpis?.onTimeRatio || 0) },
            { label: 'Avg Delay', value: `${adminAnalytics?.dispatchPerformance?.kpis?.avgDelayDays || 0}d` },
            { label: 'Volume', value: formatCompactNumber(dispatchTrendRows.reduce((sum, row) => sum + Number(row.dispatched_volume || 0), 0)) },
          ]}
        >
          <InteractiveLineChart
            rows={dispatchTrendRows}
            emptyText={ta.noChartData}
            series={[
              { key: 'total', label: 'Total Dispatches', color: '#1A1A54' },
              { key: 'delivered', label: 'Delivered', color: '#10B981' },
              { key: 'avg_delay_days', label: 'Avg Delay (days)', color: '#E07A00' },
            ]}
            valueFormatter={(value) => Number(value || 0).toFixed(1)}
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Inbound Cost & Payment Exposure"
          subtitle="Cost efficiency and working-capital pressure"
          index={3}
          explanation="Tracks landed inbound volume versus cost intensity, then shows how much payment is still open across invoices."
          whatThisMeansLabel={ta.whatThisMeans}
          chips={[
            { label: 'Outstanding', value: formatCurrencyInr(paymentExposure.outstanding_exposure || 0) },
            { label: 'Gross', value: formatCurrencyInr(paymentExposure.estimated_gross || 0) },
          ]}
        >
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-2">
              <InteractiveLineChart
                rows={costTrendRows}
                emptyText={ta.noChartData}
                series={[
                  { key: 'total_qty_sqm', label: 'Inbound SQM', color: '#0EA5E9' },
                  { key: 'avg_cost_per_sqm', label: 'Avg Cost/SQM', color: '#E07A00' },
                ]}
                valueFormatter={(value) => Number(value || 0).toFixed(0)}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <MiniDonut
                segments={[
                  { label: 'Paid', value: Number(paymentMixRows.find((row) => row.payment_status === 'paid')?.count || 0), color: '#10B981' },
                  { label: 'Partial', value: Number(paymentMixRows.find((row) => row.payment_status === 'partial')?.count || 0), color: '#F59E0B' },
                  { label: 'Unpaid', value: Number(paymentMixRows.find((row) => row.payment_status === 'unpaid')?.count || 0), color: '#EF4444' },
                ]}
              />
              <div className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
                <div className="text-emerald-700">{ta.paid}: {paymentMixRows.find((row) => row.payment_status === 'paid')?.count || 0}</div>
                <div className="text-amber-700">{ta.partial}: {paymentMixRows.find((row) => row.payment_status === 'partial')?.count || 0}</div>
                <div className="text-rose-700">{ta.unpaid}: {paymentMixRows.find((row) => row.payment_status === 'unpaid')?.count || 0}</div>
              </div>
            </div>
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Inventory Health & Reorder Risk"
          subtitle="Risk pressure by month and division"
          index={4}
          explanation="Shows where stock risk is building. Positive pressure means risky items are moving out faster than they are replenished."
          whatThisMeansLabel={ta.whatThisMeans}
          chips={[
            { label: 'At Risk', value: adminAnalytics?.inventoryHealth?.kpis?.atRiskItems || 0 },
            { label: 'Items', value: adminAnalytics?.inventoryHealth?.kpis?.totalItems || 0 },
          ]}
        >
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2">
              <InteractiveLineChart
                rows={inventoryRiskTrend.map((row) => ({ ...row, pressure_abs: Math.abs(Number(row.pressure || 0)) }))}
                emptyText={ta.noChartData}
                series={[
                  { key: 'inbound_qty', label: 'Inbound Risk Qty', color: '#10B981' },
                  { key: 'outbound_qty', label: 'Outbound Risk Qty', color: '#DC2626' },
                  { key: 'pressure_abs', label: 'Pressure (abs)', color: '#E07A00' },
                ]}
              />
            </div>
            <div className="space-y-1">
              {inventoryDivisionRisk.slice(0, 6).map((row, index) => {
                const ratio = Number(row.total_items || 0) > 0 ? (Number(row.at_risk || 0) / Number(row.total_items || 0)) * 100 : 0;
                return (
                  <div key={`div-risk-${row.division}`} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      <span className="truncate pr-2">{row.division}</span>
                      <span className="font-mono">{row.at_risk}/{row.total_items}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <span className="block h-full rounded-full bg-[#E07A00]" style={{ width: `${ratio}%`, animation: `growWidth 700ms ease ${index * 60}ms both` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Salesperson Performance Trend"
          subtitle="Dispatch contribution, growth, and consistency"
          index={5}
          explanation="Compares top salesperson throughput over time. Rising consistency with positive growth indicates stable, scalable performance."
          whatThisMeansLabel={ta.whatThisMeans}
          chips={[
            { label: 'Tracked', value: salespersonRanking.length },
            { label: 'Top Qty', value: formatCompactNumber(salespersonRanking[0]?.quantity || 0) },
          ]}
        >
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="space-y-2">
              <InteractiveLineChart
                rows={salespersonTrendByMonth}
                emptyText={ta.noChartData}
                series={topSalespeople.map((name, index) => ({
                  key: name,
                  label: name,
                  color: ['#1A1A54', '#E07A00', '#0EA5E9'][index % 3],
                }))}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-[10px] uppercase tracking-widest text-white">
                  <tr>
                    <th className="px-2 py-2 text-left">{ta.salesperson}</th>
                    <th className="px-2 py-2 text-right">{ta.qty}</th>
                    <th className="px-2 py-2 text-right">{ta.growth}</th>
                    <th className="px-2 py-2 text-right">{ta.consistencyShort}</th>
                  </tr>
                </thead>
                <tbody>
                  {salespersonRanking.slice(0, 6).map((row) => (
                    <tr key={`rank-${row.salesperson}`} className="border-b border-slate-100 text-[11px] hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                      <td className="px-2 py-2 font-medium text-slate-700 dark:text-slate-200">{row.salesperson}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-700 dark:text-slate-200">{formatCompactNumber(row.quantity)}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        <span className={Number(row.growth_ratio || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {row.growth_ratio == null ? '—' : `${(Number(row.growth_ratio) * 100).toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[#E07A00]">{Number(row.consistency_score || 0).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
