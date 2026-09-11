'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

function getTone(label) {
  const l = String(label).toLowerCase();
  const isAlert = l.includes('risk') || l.includes('vulnerability');
  const isNeutral = l.includes('pending');
  return {
    color: isAlert ? 'text-amber-600 dark:text-amber-400' : isNeutral ? 'text-brand-primary' : 'text-emerald-600 dark:text-emerald-400',
    bg: isAlert ? 'bg-amber-500/10' : isNeutral ? 'bg-brand-primary/10' : 'bg-emerald-500/10',
    border: isAlert ? 'border-amber-500/20' : isNeutral ? 'border-brand-primary/20' : 'border-emerald-500/20',
  };
}

function fmt(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

// ponytail: one dense card — hero stat left, the remaining stats as mini tiles on the right
export function StockStatsGrid({ stats, language, t }) {
  if (!stats || stats.length === 0) return null;

  const [hero, ...rest] = stats;
  const Icon = hero.icon;
  const tone = getTone(hero.label);
  const isPositive = hero.trend >= 0;
  const breakdown = Array.isArray(hero.breakdown) ? hero.breakdown : [];

  return (
    <div className="rounded-xl sm:glass-panel sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border ${tone.bg} ${tone.border}`}>
            <Icon className={`h-5 w-5 ${tone.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{hero.label}</span>
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black ${tone.color} ${tone.bg} ${tone.border}`}>
                {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {Math.abs(hero.trend)}%
              </span>
              {hero.trendLabel && <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-tight text-slate-400">{hero.trendLabel}</span>}
            </div>
            <div className="mt-0.5 text-2xl sm:text-3xl font-black font-sans tracking-tighter leading-none text-slate-900 dark:text-white">
              {fmt(hero.value)}
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {rest.map((stat) => {
            const StatIcon = stat.icon;
            const statTone = getTone(stat.label);
            return (
              <div key={stat.label} className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 ${statTone.bg} ${statTone.border}`}>
                <StatIcon className={`h-4 w-4 shrink-0 ${statTone.color}`} />
                <span className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{stat.label}</span>
                <span className="ml-auto shrink-0 tabular-nums text-xs font-semibold leading-none text-slate-900 dark:text-white sm:ml-0">{fmt(stat.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {breakdown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-slate-200/60 pt-2.5 dark:border-white/5">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{b.label}</span>
              <span className="tabular-nums text-[11px] font-black text-slate-700 dark:text-white/90">
                {b.value.toLocaleString()}
                {b.isBag && <span className="ml-1 text-[8px] font-bold uppercase text-amber-400/80">bags</span>}
                {b.isSqft && <span className="ml-1 text-[8px] font-bold uppercase text-sky-400/80">sqft</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
