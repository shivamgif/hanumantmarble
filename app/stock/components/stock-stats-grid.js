'use client';

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

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

export function StockStatsGrid({ stats, language, t }) {
  if (!stats || stats.length === 0) return null;

  const [hero, ...rest] = stats;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
      <HeroCard stat={hero} t={t} className="lg:col-span-2" />
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4 sm:gap-5">
        {rest.map((m) => (
          <CompactCard key={m.label} stat={m} t={t} />
        ))}
      </div>
    </div>
  );
}

function HeroCard({ stat: m, t, className = '' }) {
  const Icon = m.icon;
  const isPositive = m.trend >= 0;
  const tone = getTone(m.label);
  const hasBreakdown = Array.isArray(m.breakdown) && m.breakdown.length > 0;

  return (
    <div className={`glass-panel rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 relative overflow-hidden transition-all duration-500 hover:shadow-2xl group ${className}`}>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl sm:rounded-[1.25rem] border ${tone.bg} ${tone.border} shadow-sm transition-transform duration-500 group-hover:scale-110`}>
            <Icon className={`h-7 w-7 sm:h-8 sm:w-8 ${tone.color}`} />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{t('logisticsKPI')}</span>
            <span className={`flex items-center gap-1 text-[10px] font-black px-3 py-1 rounded-full mt-2 ${tone.color} ${tone.bg} border ${tone.border}`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(m.trend)}%
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 text-[11px] font-black uppercase tracking-[0.15em]">{m.label}</div>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-sans tracking-tighter text-slate-900 dark:text-white leading-none">
            {fmt(m.value)}
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-3">{m.trendLabel}</div>
        </div>
        {hasBreakdown && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 border-t border-slate-200/60 dark:border-white/5 pt-4">
            {m.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{b.label}</span>
                <span className="tabular-nums text-[11px] font-black text-slate-700 dark:text-white/90">
                  {b.value.toLocaleString()}
                  {b.isBag && <span className="ml-1 text-[8px] font-bold text-amber-400/80 uppercase">bags</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="absolute -right-6 -bottom-6 w-32 h-32 sm:w-40 sm:h-40 opacity-[0.04] transition-all duration-700 pointer-events-none group-hover:scale-110 group-hover:opacity-[0.08]">
        <Icon className="w-full h-full" />
      </div>
    </div>
  );
}

function CompactCard({ stat: m, t }) {
  const Icon = m.icon;
  const isPositive = m.trend >= 0;
  const tone = getTone(m.label);

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg group">
      <div className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border ${tone.bg} ${tone.border} shadow-sm transition-transform duration-300 group-hover:scale-110`}>
        <Icon className={`h-5 w-5 ${tone.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 truncate">{m.label}</div>
        <div className="text-2xl font-black font-sans tracking-tighter text-slate-900 dark:text-white leading-none mt-0.5">
          {fmt(m.value)}
        </div>
        {m.trendLabel && <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1 truncate">{m.trendLabel}</div>}
      </div>
      <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full ${tone.color} ${tone.bg} border ${tone.border}`}>
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(m.trend)}%
      </span>
    </div>
  );
}
