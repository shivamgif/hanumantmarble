'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

function getTone(label) {
  const l = String(label).toLowerCase();
  const isAlert = l.includes('risk') || l.includes('vulnerability');
  const isNeutral = l.includes('pending');
  return {
    // Trend chip colour, and the colour a non-zero figure takes: only waiting
    // work and risk are worth colouring, everything else stays ink.
    color: isAlert ? 'text-amber-600 dark:text-amber-400' : isNeutral ? 'text-brand-primary' : 'text-emerald-600 dark:text-emerald-400',
    value: isAlert ? 'text-amber-700 dark:text-amber-400' : isNeutral ? 'text-brand-primary' : 'text-slate-900 dark:text-slate-50',
  };
}

function fmt(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

// ponytail: one dense strip — hero stat left, the remaining stats as a hairline-divided row on the right
export function StockStatsGrid({ stats, language, t }) {
  if (!stats || stats.length === 0) return null;

  const [hero, ...rest] = stats;
  const Icon = hero.icon;
  const tone = getTone(hero.label);
  const isPositive = hero.trend >= 0;
  const breakdown = Array.isArray(hero.breakdown) ? hero.breakdown : [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="hidden w-9 h-9 shrink-0 items-center justify-center rounded-md border border-border sm:flex">
            <Icon className="h-[18px] w-[18px] text-slate-500 dark:text-slate-400" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400">{hero.label}</span>
              <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${tone.color}`}>
                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(hero.trend)}%
              </span>
              {hero.trendLabel && <span className="hidden sm:inline text-slate-400">{hero.trendLabel}</span>}
            </div>
            <div className="mt-0.5 text-2xl sm:text-[1.75rem] font-semibold tracking-tight leading-none tabular-nums text-slate-900 dark:text-slate-50">
              {fmt(hero.value)}
            </div>
          </div>
        </div>
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-0 sm:divide-x sm:divide-border">
          {rest.map((stat) => {
            const StatIcon = stat.icon;
            const statTone = getTone(stat.label);
            return (
              <div key={stat.label} className="flex min-w-0 items-center gap-2 sm:px-5 sm:last:pr-0">
                <StatIcon className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                <dt className="truncate text-xs text-slate-500 dark:text-slate-400">{stat.label}</dt>
                <dd className={`ml-auto shrink-0 tabular-nums text-sm font-semibold sm:ml-0 ${stat.value ? statTone.value : 'text-slate-400'}`}>{fmt(stat.value)}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      {breakdown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2.5">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-baseline gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400">{b.label}</span>
              <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                {b.value.toLocaleString()}
                {b.isBag && <span className="ml-1 font-normal text-slate-400">bags</span>}
                {b.isSqft && <span className="ml-1 font-normal text-slate-400">sqft</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
