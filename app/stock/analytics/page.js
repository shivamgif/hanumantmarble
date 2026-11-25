'use client';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { getTranslation } from '@/lib/translations';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { canSell, getRoleFlags } from '@/lib/stock-roles.mjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boxes, Check, Download, LayoutGrid, RotateCcw, SlidersHorizontal, TrendingUp, UserCheck, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CLASSES, paceAdjustedTarget } from '../components/dashboard-ui';
import { ERROR_BOX_CLASS, getJson, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS, tabButtonClass, tabTrackClass } from '../lib/stock-utils';
import { WidgetGrid } from './components/widget-grid';
import { useLayoutPref } from '@/hooks/useLayoutPref';
import { PageHeader } from '../components/page-header';
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

// Each tab's default arrangement on the 12-column grid. Pairs in a row add up
// to 12 so nothing leaves a gap; a user's own arrangement (Customize) is
// merged over this, so adding a widget here reaches everyone.
const ANALYTICS_LAYOUT = {
  overview: [{ id: 'health', span: 12 }, { id: 'revenue', span: 8 }, { id: 'pending', span: 4 }, { id: 'reorder', span: 12 }],
  sales: [{ id: 'profit', span: 8 }, { id: 'divisions', span: 4 }, { id: 'costVolume', span: 8 }, { id: 'concentration', span: 4 }, { id: 'dispersion', span: 12 }],
  inventory: [{ id: 'topSellers', span: 12 }, { id: 'risk', span: 8 }, { id: 'deadStock', span: 4 }],
  team: [{ id: 'spotlight', span: 12 }, { id: 'salesTrend', span: 12 }, { id: 'pace', span: 6 }, { id: 'activity', span: 6 }, { id: 'attendance', span: 12 }],
};
const NO_WIDGETS = [];

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
  const [editing, setEditing] = useState(false);
  const layout = useLayoutPref(`analytics.${currentTab}`, ANALYTICS_LAYOUT[currentTab] || NO_WIDGETS, accessUser?.ui_prefs?.[`analytics.${currentTab}`]);

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
        // also sells needs both payloads on the same page — fetched together.
        // A revisit paints the last payload at once, then the fresh one.
        const load = async (url, set) => {
          const json = await getJson(url, (cached) => {
            if (!mounted) return;
            set(cached);
            setLoading(false);
          });
          if (mounted) set(json);
        };
        await Promise.all([
          canViewAllAnalytics && load(`/api/stock/admin/analytics?months=${analyticsRangeMonths}`, setAdminAnalytics),
          sellsToo && load('/api/stock/salesperson-analytics', setSalespersonAnalytics),
        ]);
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
      <div className={CLASSES.contentWrap} aria-busy="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32 rounded-lg" />
          <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        </div>
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`hero-skeleton-${index}`} className="rounded-lg h-36" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <Skeleton className="rounded-lg h-80" />
          <Skeleton className="rounded-lg h-80" />
        </div>
      </div>
    );
  if (error && !hasData) return <div className={CLASSES.contentWrap}><div role="alert" className={ERROR_BOX_CLASS}>{error}</div></div>;

  if (isSalesperson) {
    return (
      <div className={`${CLASSES.contentWrap} overflow-x-clip`}>
        <PageHeader
          icon={TrendingUp}
          crumbs={[{ label: t('me.crumbHome'), href: '/stock' }, { label: t('me.crumbMine') }]}
          title={t('tabMyPerformance')}
          subtitle={t('me.pageSubtitle')}
        />

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

  // Every widget the tabs can show, by id; ANALYTICS_LAYOUT says where.
  const widgets = {
    health: {
      title: t('w.health'),
      node: (
        <StockHealthScorecard
          data={divisionRisk}
          stockRisk={stockRisk}
          approvalOps={approvalOps}
          monthlyProfit={monthlyProfit}
          elapsedFraction={Number(adminAnalytics?.range?.elapsedFraction || 1)}
        />
      ),
    },
    revenue: { title: t('w.revenue'), node: <SalesRevenueChart data={dispatchTrend} partial={partialLastMonth} /> },
    pending: {
      title: t('w.pending'),
      node: (
        <PendingQueueWidget
          items={pendingQueue}
          onApprove={canApprove ? handlePendingApprove : undefined}
          onReject={canApprove ? handlePendingReject : undefined}
          actionLoading={pendingActionLoading}
        />
      ),
    },
    reorder: { title: t('w.reorder'), node: <ReorderNowWidget items={reorderNow} months={analyticsRangeMonths} /> },
    profit: { title: t('w.profit'), node: <MonthlyProfitChart data={monthlyProfit} partial={partialLastMonth} /> },
    divisions: { title: t('w.divisions'), node: <TopDivisionsChart data={divisionPerformance} /> },
    costVolume: { title: t('w.costVolume'), node: <MonthlyCostVolumeChart dispatchTrend={dispatchTrend} inboundTrend={inboundTrend} partial={partialLastMonth} /> },
    concentration: { title: t('w.concentration'), node: <CustomerConcentrationWidget rows={customerConcentration} /> },
    dispersion: { title: t('w.dispersion'), node: <PriceDispersionWidget rows={priceDispersion} /> },
    topSellers: { title: t('w.topSellers'), node: <TopSellersWidget items={abcItems} /> },
    risk: { title: t('w.risk'), node: <RiskInventoryTable divisionRisk={divisionRisk} months={analyticsRangeMonths} /> },
    deadStock: { title: t('w.deadStock'), node: <DeadStockWidget data={deadStock} months={analyticsRangeMonths} /> },
    spotlight: {
      title: t('w.spotlight'),
      node: (
        <SalespersonSpotlight
          trend={salespersonTrend}
          ranking={salespersonRanking}
          goals={salespersonGoals}
          selected={selectedSalesperson}
          onSelect={setSelectedSalesperson}
          months={analyticsRangeMonths}
        />
      ),
    },
    salesTrend: { title: t('w.salesTrend'), node: <SalespersonTrendChart trend={salespersonTrend} /> },
    pace: {
      title: t('w.pace'),
      node: (
        <Leaderboard
          ranking={salespersonRanking}
          goals={salespersonGoals}
          months={analyticsRangeMonths}
          onSelect={setSelectedSalesperson}
          selected={selectedSalesperson}
        />
      ),
    },
    activity: { title: t('w.activity'), node: <ActivityFeedWidget events={activityFeed} /> },
    // Absent for those who may not see attendance: WidgetGrid skips ids with no widget.
    ...(roleFlags.canViewAllAttendance ? { attendance: { title: t('w.attendance'), node: <AttendanceSummaryWidget /> } } : {}),
  };

  return (
    <div className={`${CLASSES.contentWrap} overflow-x-clip`}>
      <PageHeader
        icon={LayoutGrid}
        crumbs={[{ label: t('operationalCore'), href: '/stock/admin' }, { label: t('businessIntelligence') }]}
        title={t('executiveDashboard')}
      />

      <HeroCallouts
        stockedOut={Number(stockRisk?.zeroStock || 0)}
        approvalsWaiting={Number(approvalOps?.pendingCount || 0)}
        oldestPendingHours={Number(approvalOps?.oldestPendingHours || 0)}
        salespeopleBehindPace={salespeopleBehindPace}
        onNavigate={jumpTo}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        {/* Same strip as every other page (see tabTrackClass). */}
        <div className={tabTrackClass(visibleTabs.length)}>
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
                className={tabButtonClass(isActive, visibleTabs.length)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-2">
          <div className={`${tabTrackClass(3)} !w-fit`} role="group" aria-label="Range">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAnalyticsRangeMonths(m)}
                aria-pressed={analyticsRangeMonths === m}
                className={`${tabButtonClass(analyticsRangeMonths === m, 5)} !h-8 px-4`}
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
          {currentTab !== 'me' ? (
            <>
              {editing ? (
                <button type="button" onClick={layout.reset} className={PILL_BUTTON_CLASS}>
                  <RotateCcw /> {t('resetLayout')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
                className={editing ? PILL_PRIMARY_BUTTON_CLASS : PILL_BUTTON_CLASS}
              >
                {editing ? <Check /> : <SlidersHorizontal />} {editing ? t('doneCustomize') : t('customize')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {actionError || (error && hasData) ? (
        <div role="alert" className={`${ERROR_BOX_CLASS} flex items-start justify-between gap-2`}>
          <span>{actionError || error}</span>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setError(null);
            }}
            className="shrink-0 text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div aria-busy={loading} className={`space-y-4 transition-opacity duration-200 lg:space-y-6 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
      {currentTab === 'me' ? (
        <MyPerformancePanel data={salespersonAnalytics} goal={ownGoal} />
      ) : (
        <WidgetGrid items={layout.items} widgets={widgets} editing={editing} onChange={layout.save} t={t} />
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
