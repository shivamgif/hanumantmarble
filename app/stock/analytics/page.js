'use client';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTranslation } from '@/lib/translations';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { useRouter } from 'next/navigation';
import { ChevronRight, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CLASSES, paceAdjustedTarget } from '../components/dashboard-ui';
import {
  SalesRevenueChart,
  TopDivisionsChart,
  MonthlyCostVolumeChart,
  MonthlyProfitChart,
  SalespersonTrendChart,
  AbcItemsWidget,
} from './components/charts';
import {
  StockHealthScorecard,
  HeroCallouts,
  Leaderboard,
  SalespersonSpotlight,
  ReorderNowWidget,
  DeadStockWidget,
  PendingQueueWidget,
  SalesPaceWidget,
  MyPerformanceHero,
  CustomerConcentrationWidget,
  ActivityFeedWidget,
  RiskInventoryTable,
} from './components/widgets';

const TABS = [
  { id: 'overview', labelKey: 'tabOverview' },
  { id: 'sales', labelKey: 'tabSales' },
  { id: 'inventory', labelKey: 'tabInventory' },
  { id: 'team', labelKey: 'tabTeam' },
];

export default function AnalyticsDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const { user } = useAuthUser();
  const { accessRole, accessLoading, hasResolvedAccessOnce, accessUser } = useStockAccess(user);
  const router = useRouter();
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [salespersonAnalytics, setSalespersonAnalytics] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
  const [activeTab, setActiveTab] = useState('overview');
  // null = spotlight falls back to the top performer; lifted here so the
  // leaderboard rows can drive the selection too.
  const [selectedSalesperson, setSelectedSalesperson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const roleFlags = getRoleFlags(accessRole);
  // admin, manager and read_only_admin all see the company-wide analytics; only the
  // first two get the approve/reject actions inside it.
  const canViewAllAnalytics = roleFlags.canViewAllAnalytics;
  const canApprove = roleFlags.canApprove;
  const isSalesperson = accessRole === 'salesperson';
  const isAuthorized = canViewAllAnalytics || isSalesperson;

  useEffect(() => {
    if (!accessLoading && hasResolvedAccessOnce && !isAuthorized) {
      router.replace('/stock/admin');
    }
  }, [accessLoading, hasResolvedAccessOnce, isAuthorized, router]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      try {
        if (canViewAllAnalytics) {
          const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}`, { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Failed to load analytics');
          if (mounted) setAdminAnalytics(json);
        } else if (isSalesperson) {
          const response = await fetch('/api/stock/salesperson-analytics', { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Failed to load analytics');
          if (mounted) setSalespersonAnalytics(json);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user && isAuthorized) loadData();
    return () => {
      mounted = false;
    };
  }, [user, analyticsRangeMonths, canViewAllAnalytics, isSalesperson, isAuthorized]);

  const [pendingActionLoading, setPendingActionLoading] = useState(null);

  const refetchAnalytics = useCallback(async () => {
    if (!canViewAllAnalytics) return;
    try {
      const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}&fresh=1`, { cache: 'no-store' });
      const json = await response.json();
      if (response.ok) setAdminAnalytics(json);
    } catch {}
  }, [analyticsRangeMonths, canViewAllAnalytics]);

  const handlePendingApprove = useCallback(async (item) => {
    setPendingActionLoading(String(item.id));
    try {
      const response = await fetch(`/api/stock/outbound-shipments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed');
      await refetchAnalytics();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingActionLoading(null);
    }
  }, [refetchAnalytics]);

  const handlePendingReject = useCallback(async (item) => {
    const reason = window.prompt(getTranslation('stock.analytics.rejectReasonPrompt', language)) || getTranslation('stock.analytics.rejectedFromAnalytics', language);
    setPendingActionLoading(String(item.id));
    try {
      const response = await fetch(`/api/stock/outbound-shipments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', notes: reason, reason }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed');
      await refetchAnalytics();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingActionLoading(null);
    }
  }, [refetchAnalytics, language]);

  const jumpTo = useCallback((tab, widgetId) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      document.getElementById(widgetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const salespersonGoalsAll = adminAnalytics?.salespersonGoals || [];
  const salespeopleBehindPace = useMemo(() => {
    return salespersonGoalsAll.filter((r) => {
      const goal = Number(r.goal || 0);
      const actual = Number(r.actual || 0);
      return goal > 0 && actual < paceAdjustedTarget(goal);
    }).length;
  }, [salespersonGoalsAll]);

  if (loading)
    return (
      <div className="mx-auto max-w-[1600px] space-y-10 lg:space-y-12 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-16 sm:h-20 w-full sm:w-3/4 max-w-lg rounded-2xl" />
        </div>
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`hero-skeleton-${index}`} className="rounded-2xl h-40 sm:h-48" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="rounded-2xl h-80 sm:h-96" />
          <Skeleton className="rounded-2xl h-80 sm:h-96" />
        </div>
      </div>
    );
  if (error) return <div className="p-8 text-rose-500 font-bold bg-rose-50 rounded-2xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40">{error}</div>;

  if (isSalesperson) {
    const monthlyTrend = salespersonAnalytics?.monthlyTrend || [];
    const thisMonth = salespersonAnalytics?.thisMonth || { count: 0, value: 0 };
    const lastMonth = salespersonAnalytics?.lastMonth || { count: 0, value: 0 };
    const recentDispatches = salespersonAnalytics?.recentDispatches || [];
    const goal = Number(accessUser?.monthly_sales_goal ?? 0);
    const fmt = (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const bestMonthValue = Math.max(...monthlyTrend.map((r) => r.totalValue), 0);

    return (
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
              <Link href="/stock" className="hover:text-brand-primary transition-colors">Dashboard</Link>
              <ChevronRight className="h-3 w-3 opacity-50" />
              <span className="text-slate-900 dark:text-white">My Analytics</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              <span className="text-brand-primary">My</span> Performance
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
              Your dispatch activity, streak and goal progress for the last 6 months.
            </p>
          </div>
        </header>

        <MyPerformanceHero
          thisMonth={thisMonth}
          lastMonth={lastMonth}
          goal={goal}
          activeDays={salespersonAnalytics?.activeDays}
          today={salespersonAnalytics?.today}
        />

        {monthlyTrend.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-6">
              <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">Dispatch Value Trend</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
            </div>
            <div className="glass-panel rounded-2xl p-6 transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover">
              <div className="space-y-4">
                {monthlyTrend.map((row) => {
                  const barPct = Math.round((row.totalValue / Math.max(bestMonthValue, 1)) * 100);
                  const isBest = bestMonthValue > 0 && row.totalValue === bestMonthValue;
                  const hitGoal = goal > 0 && row.totalValue >= goal;
                  // Best month wins the crown colour; any other goal month stays green.
                  const barColor = isBest ? 'bg-yellow-400' : hitGoal ? 'bg-emerald-500' : 'bg-brand-primary';
                  return (
                    <div key={row.month} className="flex items-center gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-16 shrink-0">{row.month}</span>
                      <div className="flex-1 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className={`h-full rounded-xl transition-all duration-700 ${barColor}`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="w-6 shrink-0 text-center text-sm" aria-hidden="true">{isBest ? '🏆' : hitGoal ? '✅' : ''}</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-28 text-right shrink-0 tabular-nums">{fmt(row.totalValue)}</span>
                      <span className="text-[10px] text-slate-400 w-16 shrink-0 tabular-nums">{row.dispatchCount} orders</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {recentDispatches.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-6">
              <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">Recent Dispatches</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
            </div>
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left p-4 font-black uppercase tracking-widest text-muted-foreground text-[9px]">Shipment</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Date</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Customer</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Status</th>
                      <th className="text-right p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDispatches.map((d) => (
                      <tr key={d.id} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                        <td className="p-4 font-bold text-slate-900 dark:text-slate-100">{d.shipmentNumber || `#${d.id}`}</td>
                        <td className="p-4 text-slate-500">{d.dispatchDate ? new Date(d.dispatchDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="p-4 text-slate-700 dark:text-slate-300">{d.customerName || '—'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${d.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : d.status === 'cancelled' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-slate-900 dark:text-slate-100">{fmt(d.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  const divisionRisk = adminAnalytics?.inventoryHealth?.divisionRisk || [];
  const divisionPerformance = adminAnalytics?.divisionPerformance?.ranking || [];
  const dispatchTrend = adminAnalytics?.dispatchPerformance?.trend || [];
  const costTrend = adminAnalytics?.costAndPayment?.trend || [];
  const salespersonRanking = adminAnalytics?.salespersonPerformance?.ranking || [];
  const salespersonTrend = adminAnalytics?.salespersonPerformance?.trend || [];
  const monthlyProfit = adminAnalytics?.monthlyProfit || [];
  const approvalOps = adminAnalytics?.approvalOps || {};
  const stockRisk = adminAnalytics?.stockRisk || {};
  const reorderNow = adminAnalytics?.reorderNow || [];
  const deadStock = adminAnalytics?.deadStock || {};
  const pendingQueue = adminAnalytics?.pendingQueue || [];
  const salespersonGoals = salespersonGoalsAll;
  const customerConcentration = adminAnalytics?.customerConcentration || [];
  const activityFeed = adminAnalytics?.activityFeed || [];
  const abcItems = adminAnalytics?.abcItems || [];

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-2">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            <Link href="/stock/admin" className="hover:text-brand-primary transition-colors">{t('operationalCore')}</Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">{t('businessIntelligence')}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            <span className="text-brand-primary">{t('executiveDashboard').split(' ')[0]}</span> {t('executiveDashboard').split(' ').slice(1).join(' ')}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-muted p-1 rounded-xl border border-border/60">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => setAnalyticsRangeMonths(m)}
                className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${analyticsRangeMonths === m
                  ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                {m}M
              </button>
            ))}
          </div>
          <a
            href={`/api/stock/admin/analytics/export?type=trends&months=${analyticsRangeMonths}`}
            download
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-card text-slate-600 dark:text-slate-300 hover:text-brand-primary hover:border-brand-primary/40 text-xs font-black uppercase tracking-widest transition-all focus-ring"
            title={t('downloadTrendsCsv')}
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        </div>
      </header>

      <HeroCallouts
        stockedOut={reorderNow.length}
        approvalsWaiting={Number(approvalOps?.pendingCount || 0)}
        oldestPendingHours={Number(approvalOps?.oldestPendingHours || 0)}
        salespeopleBehindPace={salespeopleBehindPace}
        onNavigate={jumpTo}
      />

      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-background/80 backdrop-blur-md">
        <div className="flex items-center overflow-x-auto no-scrollbar bg-muted p-1 rounded-xl border border-border/60 w-full sm:w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 sm:px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg whitespace-nowrap transition-all flex-1 sm:flex-none ${activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <StockHealthScorecard data={divisionRisk} stockRisk={stockRisk} approvalOps={approvalOps} />
          <SalesRevenueChart data={dispatchTrend} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 min-w-0" id="widget-reorder">
              <ReorderNowWidget items={reorderNow} months={analyticsRangeMonths} />
            </div>
            <div className="lg:col-span-5 min-w-0" id="widget-pending">
              <PendingQueueWidget
                items={pendingQueue}
                onApprove={canApprove ? handlePendingApprove : undefined}
                onReject={canApprove ? handlePendingReject : undefined}
                actionLoading={pendingActionLoading}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sales' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 min-w-0">
            <MonthlyProfitChart data={monthlyProfit} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <TopDivisionsChart data={divisionPerformance} />
          </div>
          <div className="lg:col-span-8 min-w-0">
            <MonthlyCostVolumeChart dispatchTrend={dispatchTrend} costTrend={costTrend} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <CustomerConcentrationWidget rows={customerConcentration} />
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 min-w-0">
            <AbcItemsWidget items={abcItems} />
          </div>
          <div className="lg:col-span-5 min-w-0">
            <DeadStockWidget data={deadStock} months={analyticsRangeMonths} />
          </div>
          <div className="lg:col-span-12 min-w-0">
            <RiskInventoryTable divisionRisk={divisionRisk} months={analyticsRangeMonths} />
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <SalespersonSpotlight
              trend={salespersonTrend}
              ranking={salespersonRanking}
              goals={salespersonGoals}
              selected={selectedSalesperson}
              onSelect={setSelectedSalesperson}
              months={analyticsRangeMonths}
            />
          </div>
          <div className="lg:col-span-8 min-w-0">
            <SalespersonTrendChart trend={salespersonTrend} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <Leaderboard
              ranking={salespersonRanking}
              months={analyticsRangeMonths}
              onSelect={setSelectedSalesperson}
              selected={selectedSalesperson}
            />
          </div>
          <div className="lg:col-span-7 min-w-0" id="widget-pace">
            <SalesPaceWidget rows={salespersonGoals} />
          </div>
          <div className="lg:col-span-5 min-w-0">
            <ActivityFeedWidget events={activityFeed} />
          </div>
        </div>
      )}
    </div>
  );
}
