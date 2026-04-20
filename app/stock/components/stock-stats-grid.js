'use client';

import { Badge } from '@/components/ui/badge';
import { CLASSES } from '../lib/stock-utils';

export function StockStatsGrid({ stats }) {
  return (
    <div className={CLASSES.statGrid}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isPositive = stat.trend >= 0;

        return (
          <div key={stat.label} className={CLASSES.statCard}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={`${CLASSES.statLabel} truncate`}>{stat.label}</p>
                <p className={`${CLASSES.statValue} tabular-nums`}>{stat.value}</p>
              </div>
              <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${stat.accent} text-slate-700 dark:text-slate-100`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">{stat.trendLabel}</span>
              <Badge variant={isPositive ? 'approved' : 'rejected'} className="shrink-0 tabular-nums">{isPositive ? '+' : ''}{stat.trend}%</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
