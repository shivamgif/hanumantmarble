'use client';
import Link from 'next/link';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { getTranslation } from '@/lib/translations';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { canSell, getRoleFlags } from '@/lib/stock-roles.mjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boxes, ChevronRight, Download, LayoutGrid, TrendingUp, UserCheck, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CLASSES, paceAdjustedTarget } from '../components/dashboard-ui';
import { PILL_BUTTON_CLASS, tabButtonClass } from '../lib/stock-utils';
import {
  SalesRevenueChart,
  TopDivisionsChart,
  MonthlyCostVolumeChart,
  MonthlyProfitChart,
  SalespersonTrendChart,
  TopSellersWidget,
} from './components/charts';
import {
  StockHealthScorecard,
  HeroCallouts,
  Leaderboard,
  SalespersonSpotlight,
  ReorderNowWidget,
  DeadStockWidget,
  PendingQueueWidget,
  MyPerformancePanel,
  CustomerConcentrationWidget,
  PriceDispersionWidget,
  ActivityFeedWidget,
  RiskInventoryTable,
} from './components/widgets';
import { AttendanceSummaryWidget } from './components/attendance-widget';

const TABS = [
  { id: 'overview', labelKey: 'tabOverview', icon: LayoutGrid },
  { id: 'sales', labelKey: 'tabSales', icon: TrendingUp },
  { id: 'inventory', labelKey: 'tabInventory', icon: Boxes },
  { id: 'team', labelKey: 'tabTeam', icon: Users },
];

// Only for someone who sees the company view AND sells: a pure salesperson gets
// the standalone page instead, and an admin who does not sell never sees it.
const MY_PERFORMANCE_TAB = { id: 'me', labelKey: 'tabMyPerformance', icon: UserCheck };

function AnalyticsDashboardInner() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const { user } = useAuthUser();
  const { accessRole, accessLoading, hasResolvedAccessOnce, accessUser } = useStockAccess(user);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [salespersonAnalytics, setSalespersonAnalytics] = useState(null);
  const [analyticsRangeMonths, setAnalyticsRangeMonths] = useState(6);
  // Kept in ?tab= too, so a refresh or a shared link lands on the same tab —
  // the same arrangement as /stock/attendance?view=.
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');
  // null = spotlight falls back to the top performer; lifted here so the
  // leaderboard rows can drive the selection too.
  const [selectedSalesperson, setSelectedSalesperson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // A failed approve/reject, or a failed refetch with data already on screen.
  // Shown as a banner: it must not replace a dashboard that is still valid.
  const [actionError, setActionError] = useState(null);
  const [reasonDialog, setReasonDialog] = useState(null);

  const roleFlags = getRoleFlags(accessRole);
  // admin, manager and read_only_admin all see the company-wide analytics; only the
  // first two get the approve/reject actions inside it.
  const canViewAllAnalytics = roleFlags.canViewAllAnalytics;
  const canApprove = roleFlags.canApprove;
  const isSalesperson = accessRole === 'salesperson';
  // An admin or manager flagged to also sell. They keep the company view and
  // gain a tab for their own numbers — nothing is taken away.
  const sellsToo = canSell(accessUser);
  const isAuthorized = canViewAllAnalytics || sellsToo;
  const ownGoal = Number(accessUser?.monthly_sales_goal ?? 0);
  const visibleTabs = useMemo(
    () => (sellsToo && canViewAllAnalytics ? [...TABS, MY_PERFORMANCE_TAB] : TABS),
    [sellsToo, canViewAllAnalytics]
  );
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview';

  const selectTab = useCallback(
    (id) => {
      setActiveTab(id);
      router.replace(id === 'overview' ? '/stock/analytics' : `/stock/analytics?tab=${id}`, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    if (!accessLoading && hasResolvedAccessOnce && !isAuthorized) {
      router.replace('/stock/admin');
    }
  }, [accessLoading, hasResolvedAccessOnce, isAuthorized, router]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        // Independent, not either/or: someone who sees the company view and
        // also sells needs both payloads on the same page.
        if (canViewAllAnalytics) {
          const response = await fetch(`/api/stock/admin/analytics?months=${analyticsRangeMonths}`, { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Failed to load analytics');
          if (mounted) setAdminAnalytics(json);
        }
        if (sellsToo) {
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
  }, [user, analyticsRangeMonths, canViewAllAnalytics, sellsToo, isAuthorized]);

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
      setActionError(err.message);
    } finally {
      setPendingActionLoading(null);
    }
  }, [refetchAnalytics]);

  const rejectPending = useCallback(async (item, reason) => {
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
      setActionError(err.message);
    } finally {
      setPendingActionLoading(null);
    }
  }, [refetchAnalytics]);

  const handlePendingReject = useCallback((item) => {
    setReasonDialog({
      title: 'Reject shipment',
      description: `${item?.shipment_number || 'This shipment'} will be marked rejected. No stock changes apply.`,
      placeholder: getTranslation('stock.analytics.rejectReasonPrompt', language),
      confirmText: 'Reject',
      tone: 'rose',
      onSubmit: (reason) => rejectPending(item, reason || getTranslation('stock.analytics.rejectedFromAnalytics', language)),
    });
  }, [rejectPending, language]);

  const jumpTo = useCallback((tab, widgetId) => {
    selectTab(tab);
    requestAnimationFrame(() => {
      document.getElementById(widgetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [selectTab]);

  const salespersonGoalsAll = adminAnalytics?.salespersonGoals || [];
  const salespeopleBehindPace = useMemo(() => {
    return salespersonGoalsAll.filter((r) => {
      const goal = Number(r.goal || 0);
      const actual = Number(r.actual || 0);
      return goal > 0 && actual < paceAdjustedTarget(goal);
    }).length;
  }, [salespersonGoalsAll]);

  // The full skeleton is for the first load only. Switching 3M/6M/12M keeps the
  // current figures up (dimmed, below) until the new ones arrive.
  const hasData = Boolean(adminAnalytics || salespersonAnalytics);
  if (loading && !hasData)
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
  if (error && !hasData) return <div className="p-8 text-rose-500 font-bold bg-rose-50 rounded-2xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40">{error}</div>;

  if (isSalesperson) {
    return (
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-clip">
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
              <Link href="/stock" className="hover:text-brand-primary transition-colors">{t('me.crumbHome')}</Link>
              <ChevronRight className="h-3 w-3 opacity-50" />
              <span className="text-slate-900 dark:text-white">{t('me.crumbMine')}</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              <span className="text-brand-primary">{t('tabMyPerformance').split(' ')[0]}</span> {t('tabMyPerformance').split(' ').slice(1).join(' ')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
              {t('me.pageSubtitle')}
            </p>
          </div>
        </header>

        <MyPerformancePanel data={salespersonAnalytics} goal={ownGoal} />
      </div>
    );
  }

  const divisionRisk = adminAnalytics?.inventoryHealth?.divisionRisk || [];
  const divisionPerformance = adminAnalytics?.divisionPerformance?.ranking || [];
  const dispatchTrend = adminAnalytics?.dispatchPerformance?.trend || [];
  const inboundTrend = adminAnalytics?.inboundFlow?.trend || [];
  // The final bucket is the month in progress. Charts that compare periods drop
  // it rather than pit a few days against a whole month.
  const partialLastMonth = Boolean(adminAnalytics?.range?.partialLastMonth);
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
  const priceDispersion = adminAnalytics?.priceDispersion || [];
  const activityFeed = adminAnalytics?.activityFeed || [];
  const abcItems = adminAnalytics?.abcItems || [];

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-clip">
      <header>
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
      </header>

      <HeroCallouts
        stockedOut={Number(stockRisk?.zeroStock || 0)}
        approvalsWaiting={Number(approvalOps?.pendingCount || 0)}
        oldestPendingHours={Number(approvalOps?.oldestPendingHours || 0)}
        salespeopleBehindPace={salespeopleBehindPace}
        onNavigate={jumpTo}
      />

      {/* ponytail: top offsets mirror StockTopbar's height (mobile 134px, lg 81px);
          z-10 keeps this bar under the topbar's z-20. Update both if the topbar changes. */}
      <div className="sticky top-[134px] z-10 -mx-4 flex lg:top-[81px] flex-col gap-2 bg-background/80 px-4 py-2 backdrop-blur-md sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-0">
        {/* ponytail: below sm only the active tab shows its label, the rest collapse
            to icon circles, so four tabs fit without a horizontal scroll */}
        <div className="flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-xl border border-border/60 bg-muted p-1 scrollbar-none sm:w-fit sm:gap-0 sm:overflow-x-auto">
          {visibleTabs.map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;
            const label = t(tab.labelKey);
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                aria-label={label}
                aria-current={isActive ? 'true' : undefined}
                className={tabButtonClass(isActive)}
              >
                <Icon className="h-4 w-4 shrink-0 sm:hidden" />
                <span className={`overflow-hidden transition-all duration-300 ease-out sm:max-w-none sm:opacity-100 ${isActive ? 'max-w-[12rem] opacity-100' : 'max-w-0 opacity-0'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          <div className="flex min-h-[38px] shrink-0 items-center rounded-full border border-border/60 bg-muted p-1 sm:min-h-[44px]">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => setAnalyticsRangeMonths(m)}
                className={`flex h-[30px] items-center rounded-full px-3 text-[10px] font-black uppercase tracking-wide transition-all sm:h-9 sm:px-4 sm:text-[11px] sm:tracking-widest ${analyticsRangeMonths === m
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
            className={PILL_BUTTON_CLASS}
            title={t('downloadTrendsCsv')}
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        </div>
      </div>

      {actionError || (error && hasData) ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20">
          <span>{actionError || error}</span>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setError(null);
            }}
            className="shrink-0 text-xs font-black uppercase tracking-wider hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div aria-busy={loading} className={`space-y-6 transition-opacity duration-200 lg:space-y-8 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
      {currentTab === 'overview' && (
        <div className="space-y-6">
          <StockHealthScorecard data={divisionRisk} stockRisk={stockRisk} approvalOps={approvalOps} />
          <SalesRevenueChart data={dispatchTrend} partial={partialLastMonth} />
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

      {currentTab === 'sales' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 min-w-0">
            <MonthlyProfitChart data={monthlyProfit} partial={partialLastMonth} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <TopDivisionsChart data={divisionPerformance} />
          </div>
          <div className="lg:col-span-8 min-w-0">
            <MonthlyCostVolumeChart dispatchTrend={dispatchTrend} inboundTrend={inboundTrend} partial={partialLastMonth} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <CustomerConcentrationWidget rows={customerConcentration} />
          </div>
          <div className="lg:col-span-12 min-w-0">
            <PriceDispersionWidget rows={priceDispersion} />
          </div>
        </div>
      )}

      {currentTab === 'me' && <MyPerformancePanel data={salespersonAnalytics} goal={ownGoal} />}

      {currentTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <TopSellersWidget items={abcItems} />
          </div>
          <div className="lg:col-span-8 min-w-0">
            <RiskInventoryTable divisionRisk={divisionRisk} months={analyticsRangeMonths} />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <DeadStockWidget data={deadStock} months={analyticsRangeMonths} />
          </div>
        </div>
      )}

      {currentTab === 'team' && (
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
          <div className="lg:col-span-12 min-w-0">
            <SalespersonTrendChart trend={salespersonTrend} />
          </div>
          <div className="lg:col-span-7 min-w-0" id="widget-pace">
            <Leaderboard
              ranking={salespersonRanking}
              goals={salespersonGoals}
              months={analyticsRangeMonths}
              onSelect={setSelectedSalesperson}
              selected={selectedSalesperson}
            />
          </div>
          <div className="lg:col-span-5 min-w-0">
            <ActivityFeedWidget events={activityFeed} />
          </div>
          {roleFlags.canViewAllAttendance ? (
            <div className="lg:col-span-12 min-w-0">
              <AttendanceSummaryWidget />
            </div>
          ) : null}
        </div>
      )}

      </div>

      <ReasonDialog request={reasonDialog} onClose={() => setReasonDialog(null)} />
    </div>
  );
}

export default function AnalyticsDashboard() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <AnalyticsDashboardInner />
    </Suspense>
  );
}
