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
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className={`${CLASSES.statLabel} truncate`}>{stat.label}</p>
                <p className={`${CLASSES.statValue} font-mono`}>{stat.value}</p>
              </div>
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} text-slate-700 dark:text-slate-100`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{stat.trendLabel}</span>
              <Badge variant={isPositive ? 'approved' : 'rejected'}>{isPositive ? '+' : ''}{stat.trend}%</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
