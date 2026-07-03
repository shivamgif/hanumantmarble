'use client';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTranslation } from '@/lib/translations';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useRouter } from 'next/navigation';
import { ChevronRight, Download } from 'lucide-react';
import { CLASSES, paceAdjustedTarget } from './components/shared';
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
  ReorderNowWidget,
  DeadStockWidget,
  PendingQueueWidget,
  SalesPaceWidget,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isManager = accessRole === 'manager';
  const isSalesperson = accessRole === 'salesperson';
  const isAuthorized = isManager || isSalesperson;

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
        if (isManager) {
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
  }, [user, analyticsRangeMonths, isManager, isSalesperson, isAuthorized]);

  const [pendingActionLoading, setPendingActionLoading] = useState(null);

  const refetchAnalytics = useCallback(async () => {
    if (!isManager) return;
    try {
      const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}&fresh=1`, { cache: 'no-store' });
      const json = await response.json();
      if (response.ok) setAdminAnalytics(json);
    } catch {}
  }, [analyticsRangeMonths, isManager]);

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
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
          <div className="h-16 sm:h-20 w-full sm:w-3/4 max-w-lg bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl sm:rounded-[2.5rem]" />
        </div>
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`hero-skeleton-${index}`} className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-40 sm:h-48" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-80 sm:h-96" />
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-80 sm:h-96" />
        </div>
      </div>
    );
  if (error) return <div className="p-8 text-rose-500 font-bold bg-rose-50 rounded-3xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40">{error}</div>;

  if (isSalesperson) {
    const monthlyTrend = salespersonAnalytics?.monthlyTrend || [];
    const thisMonth = salespersonAnalytics?.thisMonth || { count: 0, value: 0 };
    const lastMonth = salespersonAnalytics?.lastMonth || { count: 0, value: 0 };
    const recentDispatches = salespersonAnalytics?.recentDispatches || [];
    const goal = Number(accessUser?.monthly_sales_goal ?? 0);
    const pct = goal > 0 ? Math.round((thisMonth.value / goal) * 100) : 0;
    const achieved = goal > 0 && thisMonth.value >= goal;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();
    const atRisk = !achieved && pct < 50 && daysLeft < 10;
    const barColor = achieved ? 'bg-yellow-400' : atRisk ? 'bg-amber-500' : 'bg-brand-primary';
    const fmt = (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const countChange = lastMonth.count > 0 ? Math.round(((thisMonth.count - lastMonth.count) / lastMonth.count) * 100) : null;

    return (
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-10 lg:space-y-12 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
          <div className="space-y-4 max-w-4xl">
            <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
              <Link href="/stock" className="hover:text-brand-primary transition-colors">Dashboard</Link>
              <ChevronRight className="h-3 w-3 opacity-50" />
              <span className="text-slate-900 dark:text-white">My Analytics</span>
            </nav>
            <h1 className="text-5xl sm:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              <span className="text-brand-primary">My</span><br className="sm:hidden" /> Performance
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
              Your personal dispatch activity and sales progress for the last 6 months.
            </p>
          </div>
        </header>

        <div className={CLASSES.heroGrid}>
          {goal > 0 && (
            <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm space-y-4 col-span-full lg:col-span-2">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monthly Sales Goal</p>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">{fmt(thisMonth.value)} / {fmt(goal)} — {pct}%</p>
                </div>
                {achieved && <span className="text-xs font-black text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 rounded-full">Goal Achieved!</span>}
                {atRisk && <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 rounded-full">{daysLeft}d left</span>}
              </div>
              <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </div>
          )}
          <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">This Month Dispatches</p>
            <p className="text-4xl font-black text-slate-900 dark:text-white">{thisMonth.count}</p>
            {countChange !== null && (
              <p className={`text-xs font-bold ${countChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {countChange >= 0 ? '+' : ''}{countChange}% vs last month
              </p>
            )}
          </div>
          <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">This Month Value</p>
            <p className="text-4xl font-black text-slate-900 dark:text-white">{fmt(thisMonth.value)}</p>
            {lastMonth.value > 0 && (
              <p className={`text-xs font-bold ${thisMonth.value >= lastMonth.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                vs {fmt(lastMonth.value)} last month
              </p>
            )}
          </div>
        </div>

        {monthlyTrend.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-6">
              <h2 className="text-sm font-bold text-slate-500 whitespace-nowrap">Dispatch Value Trend</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
            </div>
            <div className="p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm">
              <div className="space-y-4">
                {monthlyTrend.map((row) => {
                  const maxVal = Math.max(...monthlyTrend.map((r) => r.totalValue), 1);
                  const barPct = Math.round((row.totalValue / maxVal) * 100);
                  return (
                    <div key={row.month} className="flex items-center gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-16 shrink-0">{row.month}</span>
                      <div className="flex-1 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-xl bg-brand-primary transition-all duration-700" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-28 text-right shrink-0">{fmt(row.totalValue)}</span>
                      <span className="text-[10px] text-slate-400 w-16 shrink-0">{row.dispatchCount} orders</span>
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
            <div className="rounded-3xl sm:rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Shipment</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Date</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Customer</th>
                      <th className="text-left p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Status</th>
                      <th className="text-right p-4 font-black uppercase tracking-widest text-slate-400 text-[9px]">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDispatches.map((d) => (
                      <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
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
          <div className="flex items-center bg-slate-100 dark:bg-slate-900/40 p-1 rounded-xl border border-slate-200 dark:border-white/5">
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
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:text-brand-primary text-xs font-black uppercase tracking-widest transition-all"
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

      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center overflow-x-auto no-scrollbar bg-slate-100 dark:bg-slate-900/40 p-1 rounded-xl border border-slate-200 dark:border-white/5 w-full sm:w-fit">
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
                onApprove={handlePendingApprove}
                onReject={handlePendingReject}
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
          <div className="lg:col-span-8 min-w-0">
            <SalespersonTrendChart trend={salespersonTrend} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <Leaderboard ranking={salespersonRanking} months={analyticsRangeMonths} />
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
