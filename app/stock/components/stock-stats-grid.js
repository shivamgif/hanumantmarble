'use client';

import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
} from 'lucide-react';

 export function StockStatsGrid({ stats, language, t }) {
   if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
      {stats.map((m) => {
        const Icon = m.icon;
        const isPositive = m.trend >= 0;
        
        // Map accent colors to tactical UI tokens
        // stats in page.js use from-[color]/20 to-[color]/5
        // We'll extract a base color for the icon box if possible, or use defaults
        const isAlert = m.label.toLowerCase().includes('risk') || m.label.toLowerCase().includes('vulnerability');
        const isNeutral = m.label.toLowerCase().includes('pending');
        
        const colorClass = isAlert ? 'text-amber-600 dark:text-amber-400' : 
                         isNeutral ? 'text-brand-primary' : 
                         'text-emerald-600 dark:text-emerald-400';
        
        const bgClass = isAlert ? 'bg-amber-500/10' : 
                      isNeutral ? 'bg-brand-primary/10' : 
                      'bg-emerald-500/10';
        
        const borderClass = isAlert ? 'border-amber-500/20' : 
                          isNeutral ? 'border-brand-primary/20' : 
                          'border-emerald-500/20';

        return (
          <div className="glass-panel rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-7 relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl group" key={m.label}>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl sm:rounded-[1.25rem] border ${bgClass} ${borderClass} shadow-sm transition-transform duration-500 group-hover:scale-110`}>
                  <Icon className={`h-7 w-7 sm:h-8 sm:h-8 ${colorClass}`} />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{t('logisticsKPI')}</span>
                  <span className={`flex items-center gap-1 text-[10px] font-black px-3 py-1 rounded-full mt-2 ${colorClass} ${bgClass} border ${borderClass}`}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(m.trend)}%
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-slate-500 dark:text-slate-400 text-[11px] font-black uppercase tracking-[0.15em]">{m.label}</div>
                <div className={`text-3xl sm:text-4xl lg:text-5xl font-black font-sans tracking-tighter text-slate-900 dark:text-white leading-none`}>
                  {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-3">{m.trendLabel}</div>
              </div>
            </div>
            {/* Atmospheric Background Icon */}
            <div className={`absolute -right-6 -bottom-6 w-32 h-32 sm:w-40 sm:h-40 opacity-[0.04] transition-all duration-700 pointer-events-none group-hover:scale-110 group-hover:opacity-[0.08]`}>
              <Icon className="w-full h-full" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
