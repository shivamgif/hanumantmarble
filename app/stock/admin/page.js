'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { useEffect, useState } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useSearchParams } from 'next/navigation';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';
import { validateStockPassword } from '@/lib/auth0-management';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatChartDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/75';
const FORM_INPUT_CLASS = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';
const FORM_SELECT_CLASS = `${FORM_INPUT_CLASS} appearance-none pr-10`;
const FORM_PANEL_CLASS = 'rounded-2xl border border-border/80 bg-background/80 p-4';

export default function AdminDashboard() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const t = (key) => getTranslation(`stock.admin.${key}`, language);
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [mobileSection, setMobileSection] = useState('approvals');
  const [showPrimaryPassword, setShowPrimaryPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userFormNotice, setUserFormNotice] = useState(null);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [changeRequestPage, setChangeRequestPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [changeRequests, setChangeRequests] = useState([]);
  const [highlightedChangeRequestId, setHighlightedChangeRequestId] = useState(null);
  const [processedDeepLink, setProcessedDeepLink] = useState('');
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    loading: false,
    kind: null,
    title: '',
    description: '',
    record: null,
    items: [],
    documents: [],
    error: null,
  });
  const [userDraft, setUserDraft] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'stock_maintainer',
    status: 'active',
  });

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [dashboardResponse, analyticsResponse, changeRequestResponse] = await Promise.all([
          fetch('/api/stock/admin/dashboard'),
          fetch('/api/stock/dashboard'),
          fetch('/api/stock/change-requests', { cache: 'no-store' }),
        ]);

        const dashboardJson = await dashboardResponse.json();
        const analyticsJson = await analyticsResponse.json();
        const changeRequestJson = await changeRequestResponse.json();

        if (!dashboardResponse.ok) {
          throw new Error(dashboardJson.error || 'Fetch failed');
        }

        if (!analyticsResponse.ok) {
          throw new Error(analyticsJson.error || 'Failed to load analytics');
        }

        if (!changeRequestResponse.ok) {
          throw new Error(changeRequestJson.error || 'Failed to load change requests');
        }

        if (mounted) {
          setData(dashboardJson);
          setAnalyticsData(analyticsJson);
          setChangeRequests(changeRequestJson.requests || []);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user) loadData();
    return () => { mounted = false; };
  }, [user]);

  async function handleShipmentAction(type, id, action, notes = null) {
    const confirmMessage = action === 'reject'
      ? 'Are you sure you want to reject this shipment?'
      : null;

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setActionLoading(`${type}-${id}-${action}`);
    try {
      const response = await fetch(`/api/stock/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes,
          reason: action === 'request_changes' ? notes : undefined,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to update shipment');
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshDashboard() {
    const [refreshResponse, analyticsResponse, changeRequestResponse] = await Promise.all([
      fetch('/api/stock/admin/dashboard'),
      fetch('/api/stock/dashboard'),
      fetch('/api/stock/change-requests', { cache: 'no-store' }),
    ]);

    const refreshJson = await refreshResponse.json();
    const analyticsJson = await analyticsResponse.json();
    const changeRequestJson = await changeRequestResponse.json();

    if (!refreshResponse.ok) {
      throw new Error(refreshJson.error || 'Failed to refresh dashboard');
    }

    if (!analyticsResponse.ok) {
      throw new Error(analyticsJson.error || 'Failed to refresh analytics');
    }

    if (!changeRequestResponse.ok) {
      throw new Error(changeRequestJson.error || 'Failed to refresh change requests');
    }

    setData(refreshJson);
    setAnalyticsData(analyticsJson);
    setChangeRequests(changeRequestJson.requests || []);
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function openShipmentPreview(kind, row) {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;

    setPreviewState({
      open: true,
      loading: true,
      kind,
      title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
      description: 'Loading approval detail…',
      record: row,
      items: [],
      documents: [],
      error: null,
    });

    try {
      const [shipmentResponse, documentsResponse] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${row.id}&limit=20`, { cache: 'no-store' }),
      ]);

      const shipmentJson = await shipmentResponse.json();
      const documentsJson = await documentsResponse.json();

      if (!shipmentResponse.ok) throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      if (!documentsResponse.ok) throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? 'Inbound shipment detail preview' : 'Outbound shipment detail preview',
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
        description: 'Unable to load full shipment details',
        record: row,
        items: [],
        documents: [],
        error: error.message,
      });
    }
  }

  function openUserPreview(row) {
    setPreviewState({
      open: true,
      loading: false,
      kind: 'user',
      title: row.full_name || row.email || 'User',
      description: 'User contact and access details',
      record: row,
      items: [],
      documents: [],
      error: null,
    });
  }

  function openChangeRequestPreview(row) {
    setPreviewState({
      open: true,
      loading: false,
      kind: 'change-request',
      title: row.request_number || `Change Request #${row.id}`,
      description: 'Change request details and lifecycle context',
      record: row,
      items: [],
      documents: [],
      error: null,
    });
  }

  async function handleSaveUser(event) {
    event.preventDefault();

    setUserFormNotice(null);
    setError(null);

    if (!userDraft.name.trim() || !userDraft.phone.trim()) {
      setUserFormNotice({ type: 'error', message: 'Name and phone are required.' });
      return;
    }

    if (!userDraft.email.trim()) {
      setUserFormNotice({ type: 'error', message: 'Email is required.' });
      return;
    }

    const passwordError = validateStockPassword(userDraft.password);
    if (passwordError) {
      setUserFormNotice({ type: 'error', message: passwordError });
      return;
    }

    if (userDraft.password !== confirmPassword) {
      setUserFormNotice({ type: 'error', message: 'Password and confirm password do not match.' });
      return;
    }

    setActionLoading('user-save');
    setError(null);

    try {
      const response = await fetch('/api/stock/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userDraft),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save user');
      }

      setUserDraft({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', status: 'active' });
      setConfirmPassword('');
      setShowPrimaryPassword(false);
      setShowConfirmPassword(false);
      setUserFormNotice(null);
      setShowUserForm(false);
      await refreshDashboard();
    } catch (err) {
      setUserFormNotice({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('Deactivate this user?')) {
      return;
    }

    setActionLoading(`user-${id}-delete`);
    setError(null);

    try {
      const response = await fetch(`/api/stock/users?id=${id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to remove user');
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const arrivalPagination = paginateRows(data?.pendingArrivals || [], arrivalPage, DEFAULT_PAGE_SIZE);
  const dispatchPagination = paginateRows(data?.pendingDispatches || [], dispatchPage, DEFAULT_PAGE_SIZE);
  const changeRequestPagination = paginateRows(changeRequests || [], changeRequestPage, DEFAULT_PAGE_SIZE);
  const userPagination = paginateRows(data?.users || [], userPage, DEFAULT_PAGE_SIZE);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setDispatchPage((current) => Math.min(current, dispatchPagination.pageCount));
  }, [dispatchPagination.pageCount]);

  useEffect(() => {
    setChangeRequestPage((current) => Math.min(current, changeRequestPagination.pageCount));
  }, [changeRequestPagination.pageCount]);

  useEffect(() => {
    setUserPage((current) => Math.min(current, userPagination.pageCount));
  }, [userPagination.pageCount]);

  useEffect(() => {
    setPreviewItemsPage((current) => Math.min(current, previewItemPagination.pageCount));
  }, [previewItemPagination.pageCount]);

  useEffect(() => {
    const focus = searchParams.get('focus');
    const requestIdRaw = searchParams.get('requestId');
    const requestId = Number(requestIdRaw);

    if (focus !== 'change-requests' || !requestId || Number.isNaN(requestId)) {
      return;
    }

    const deepLinkKey = `change-requests:${requestId}`;
    if (processedDeepLink === deepLinkKey) {
      return;
    }

    const target = (changeRequests || []).find((requestRow) => Number(requestRow.id) === requestId);
    if (!target) {
      return;
    }

    setHighlightedChangeRequestId(requestId);
    setMobileSection('changes');
    openChangeRequestPreview(target);
    setProcessedDeepLink(deepLinkKey);

    const panel = document.getElementById('change-requests-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams, changeRequests, processedDeepLink]);

  useEffect(() => {
    if (!highlightedChangeRequestId) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setHighlightedChangeRequestId(null);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [highlightedChangeRequestId]);

  const pendingReviews = Number(analyticsData?.summary?.pending_inbound_reviews || 0) + Number(analyticsData?.summary?.pending_outbound_reviews || 0);
  const totalIncoming = Number(analyticsData?.summary?.total_incoming || 0);
  const totalOutgoing = Number(analyticsData?.summary?.total_outgoing || 0);

  const summaryTiles = [
    {
      label: 'Available Whole Stock',
      value: Number(analyticsData?.summary?.total_whole_stored || 0),
      href: '/stock?view=items',
      tone: 'from-blue-500/15 to-cyan-500/5 border-blue-100 text-blue-700',
      hint: 'Ready to dispatch',
    },
    {
      label: 'Damaged / Broken Stock',
      value: Number(analyticsData?.summary?.total_broken_stored || 0),
      href: '/stock?view=items',
      tone: 'from-amber-500/15 to-orange-500/5 border-amber-100 text-amber-700',
      hint: 'Needs action',
    },
    {
      label: 'Pending Reviews',
      value: pendingReviews,
      href: '#approval-queue',
      tone: 'from-rose-500/15 to-orange-500/5 border-rose-100 text-rose-700',
      hint: 'Arrivals + dispatches',
    },
    {
      label: 'Net Movement',
      value: totalIncoming - totalOutgoing,
      href: '/stock?view=arrivals',
      tone: 'from-emerald-500/15 to-teal-500/5 border-emerald-100 text-emerald-700',
      hint: 'Incoming - outgoing',
    },
  ];

  const movementByDate = new Map();

  (analyticsData?.recentArrivals || []).forEach((shipment) => {
    const dateSource = shipment.arrival_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.inbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  (analyticsData?.recentDispatches || []).forEach((shipment) => {
    const dateSource = shipment.dispatch_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.outbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  const movementTrend = Array.from(movementByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);

  const chartWidth = 700;
  const chartHeight = 240;
  const chartPadding = { top: 18, right: 16, bottom: 34, left: 48 };
  const chartInnerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const chartInnerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const maxChartValue = Math.max(
    ...movementTrend.map((point) => Math.max(point.inbound, point.outbound)),
    1
  );

  function pointX(index) {
    if (movementTrend.length <= 1) {
      return chartPadding.left + chartInnerWidth / 2;
    }

    return chartPadding.left + (index / (movementTrend.length - 1)) * chartInnerWidth;
  }

  function pointY(value) {
    return chartPadding.top + chartInnerHeight - (value / maxChartValue) * chartInnerHeight;
  }

  function linePath(key) {
    if (!movementTrend.length) {
      return '';
    }

    return movementTrend
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index)} ${pointY(point[key])}`)
      .join(' ');
  }

  const inboundPath = linePath('inbound');
  const outboundPath = linePath('outbound');

  const lowStockCount = (analyticsData?.activeItems || []).filter((item) => {
    const available = Number(item.current_whole_qty || 0) + Number(item.current_broken_qty || 0);
    const reorder = Number(item.reorder_level || 0);
    return reorder > 0 && available <= reorder;
  }).length;

  const totalStored = Number(analyticsData?.summary?.total_whole_stored || 0) + Number(analyticsData?.summary?.total_broken_stored || 0);
  const brokenRatio = totalStored > 0 ? Number(analyticsData?.summary?.total_broken_stored || 0) / totalStored : 0;
  const latestTrendPoint = movementTrend[movementTrend.length - 1] || null;

  const operationalAlerts = [
    pendingReviews > 0
      ? {
          level: 'critical',
          title: 'Pending approvals need action',
          message: `${pendingReviews} shipment${pendingReviews > 1 ? 's' : ''} waiting in review queue.`,
          href: '#approval-queue',
        }
      : null,
    lowStockCount > 0
      ? {
          level: 'warning',
          title: 'Low stock risk detected',
          message: `${lowStockCount} item${lowStockCount > 1 ? 's are' : ' is'} at or below reorder level.`,
          href: '/stock?view=items',
        }
      : null,
    brokenRatio >= 0.08
      ? {
          level: 'warning',
          title: 'Broken stock ratio is high',
          message: `${(brokenRatio * 100).toFixed(1)}% of stock is marked broken. Investigate damage sources.`,
          href: '/stock?view=items',
        }
      : null,
    latestTrendPoint && latestTrendPoint.outbound > latestTrendPoint.inbound
      ? {
          level: 'info',
          title: 'Outflow is above inflow today',
          message: `Outgoing ${latestTrendPoint.outbound} vs incoming ${latestTrendPoint.inbound} on latest trend day.`,
          href: '/stock?view=dispatches',
        }
      : null,
  ].filter(Boolean);

  const recentActivity = [
    ...(analyticsData?.recentArrivals || []).map((shipment) => ({
      id: `arrival-${shipment.id}`,
      kind: 'arrival',
      title: `Arrival ${shipment.shipment_number}`,
      subtitle: `${Number(shipment.total_whole_qty || 0)} whole + ${Number(shipment.total_broken_qty || 0)} broken`,
      by: shipment.generated_by || '—',
      at: shipment.arrival_date || shipment.created_at,
      status: shipment.approval_status || shipment.status,
      href: `/stock?view=arrivals&entityType=inbound_shipment&entityId=${shipment.id}`,
    })),
    ...(analyticsData?.recentDispatches || []).map((shipment) => ({
      id: `dispatch-${shipment.id}`,
      kind: 'dispatch',
      title: `Dispatch ${shipment.shipment_number}`,
      subtitle: `${Number(shipment.total_whole_qty || 0)} whole + ${Number(shipment.total_broken_qty || 0)} broken`,
      by: shipment.generated_by || '—',
      at: shipment.dispatch_date || shipment.created_at,
      status: shipment.approval_status || shipment.status,
      href: `/stock?view=dispatches&entityType=outbound_shipment&entityId=${shipment.id}`,
    })),
  ]
    .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime())
    .slice(0, 8);

  if (loading) return <div className="p-8 text-center">{t('loading')}</div>;
  if (!data && error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-xl font-bold text-foreground lg:text-2xl">{t('adminTitle')}</h1>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:col-span-2">
          {summaryTiles.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className={`group rounded-xl border bg-gradient-to-br p-2.5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-950 sm:rounded-2xl sm:p-4 ${stat.tone}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80 sm:text-xs sm:tracking-[0.12em]">{stat.label}</p>
              <p className="mt-1.5 text-xl font-bold leading-none sm:mt-2 sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-[10px] font-medium opacity-75 sm:mt-2 sm:text-xs">{stat.hint}</p>
            </Link>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 xl:col-span-3">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground sm:text-base">Movement Trend</h2>
              <p className="text-xs text-muted-foreground">Quantity vs Date for recent arrivals and dispatches</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Incoming</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />Outgoing</span>
            </div>
          </div>
          {movementTrend.length ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full rounded-xl border border-border bg-muted/20 sm:h-56">
              {[0, 0.5, 1].map((tick) => {
                const value = Math.round(maxChartValue * tick);
                const y = pointY(value);

                return (
                  <g key={`grid-${tick}`}>
                    <line
                      x1={chartPadding.left}
                      y1={y}
                      x2={chartWidth - chartPadding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-border"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={chartPadding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              <path d={inboundPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <path d={outboundPath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

              {movementTrend.map((point, index) => (
                <g key={`dots-${point.date}`}>
                  <circle cx={pointX(index)} cy={pointY(point.inbound)} r="3.5" fill="#10b981" />
                  <circle cx={pointX(index)} cy={pointY(point.outbound)} r="3.5" fill="#8b5cf6" />
                  <text
                    x={pointX(index)}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {formatChartDate(point.date)}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              No movement data available yet.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Operational Alerts</h3>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {operationalAlerts.length || 0} active
            </span>
          </div>
          {operationalAlerts.length ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {operationalAlerts.map((alert) => (
                <Link
                  key={alert.title}
                  href={alert.href}
                  className={`block rounded-xl border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-sm ${
                    alert.level === 'critical'
                      ? 'border-rose-200 bg-rose-50/80 text-rose-800'
                      : alert.level === 'warning'
                        ? 'border-amber-200 bg-amber-50/80 text-amber-800'
                        : 'border-sky-200 bg-sky-50/80 text-sky-800'
                  }`}
                >
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-1 text-xs opacity-80">{alert.message}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 px-3 py-4 text-sm text-emerald-700">
              All clear. No critical alerts right now.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
            <span className="text-xs text-muted-foreground">Live operations snapshot</span>
          </div>
          {recentActivity.length ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {recentActivity.map((event) => (
                <Link
                  key={event.id}
                  href={event.href}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 transition hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{event.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{event.subtitle}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">By {event.by} • {formatDateTime(event.at)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${event.kind === 'arrival' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                    {event.status || event.kind}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No activity recorded yet.
            </div>
          )}
        </div>
      </div>

      <div className="lg:hidden rounded-xl border border-border bg-card/80 p-1 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          {[{ id: 'approvals', label: 'Approvals' }, { id: 'changes', label: 'Changes' }, { id: 'users', label: 'Users' }].map((tab) => {
            const isActive = mobileSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileSection(tab.id)}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <div id="approval-queue" className={`space-y-4 ${mobileSection === 'approvals' ? '' : 'hidden lg:block'}`}>
          <div className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">{t('pendingArrivals')}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('shipmentNo')}</th>
                    <th className="px-3 py-2">Maintainer</th>
                    <th className="px-3 py-2">{t('truck')}</th>
                    <th className="px-3 py-2">{t('driver')}</th>
                    <th className="px-3 py-2">{t('boxesQty')}</th>
                    <th className="px-3 py-2">{t('brokenQty')}</th>
                    <th className="px-3 py-2 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {arrivalPagination.rows.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                      onClick={() => openShipmentPreview('arrival', item)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openShipmentPreview('arrival', item);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 font-medium text-primary">{item.shipment_number}</td>
                      <td className="px-3 py-2 text-foreground/80">{item.maintainer_name || '-'}</td>
                      <td className="px-3 py-2">{item.truck_license_plate}</td>
                      <td className="px-3 py-2">{item.driver_name}</td>
                      <td className="px-3 py-2">{item.total_whole_qty}</td>
                      <td className="px-3 py-2">{item.total_broken_qty}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('inbound-shipments', item.id, 'approve');
                          }}
                          disabled={actionLoading === `inbound-shipments-${item.id}-approve`}
                          className="mr-2 rounded bg-green-50 px-2 py-1 text-green-600 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Approve"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('inbound-shipments', item.id, 'reject', 'Rejected from admin hub');
                          }}
                          disabled={actionLoading === `inbound-shipments-${item.id}-reject`}
                          className="rounded bg-red-50 px-2 py-1 text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Reject"
                        >
                          ✗
                        </button>
                      </td>
                    </tr>
                  ))}
                  {arrivalPagination.total === 0 && (
                    <tr><td colSpan="8" className="px-3 py-4 text-center text-muted-foreground">{t('noPending')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={arrivalPagination.page}
              pageCount={arrivalPagination.pageCount}
              total={arrivalPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setArrivalPage}
            />
          </div>

          <div className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">{t('pendingDispatches')}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('dispatchNo')}</th>
                    <th className="px-3 py-2">{t('truck')}</th>
                    <th className="px-3 py-2">{t('driver')}</th>
                    <th className="px-3 py-2">{t('boxesQty')}</th>
                    <th className="px-3 py-2">{t('brokenQty')}</th>
                    <th className="px-3 py-2 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dispatchPagination.rows.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                      onClick={() => openShipmentPreview('dispatch', item)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openShipmentPreview('dispatch', item);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 font-medium text-primary">{item.shipment_number}</td>
                      <td className="px-3 py-2">{item.truck_license_plate}</td>
                      <td className="px-3 py-2">{item.driver_name}</td>
                      <td className="px-3 py-2">{item.total_whole_qty}</td>
                      <td className="px-3 py-2">{item.total_broken_qty}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('outbound-shipments', item.id, 'approve');
                          }}
                          disabled={actionLoading === `outbound-shipments-${item.id}-approve`}
                          className="mr-2 rounded bg-green-50 px-2 py-1 text-green-600 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Approve"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('outbound-shipments', item.id, 'reject', 'Rejected from admin hub');
                          }}
                          disabled={actionLoading === `outbound-shipments-${item.id}-reject`}
                          className="rounded bg-red-50 px-2 py-1 text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Reject"
                        >
                          ✗
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dispatchPagination.total === 0 && (
                    <tr><td colSpan="7" className="px-3 py-4 text-center text-muted-foreground">{t('noPending')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={dispatchPagination.page}
              pageCount={dispatchPagination.pageCount}
              total={dispatchPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setDispatchPage}
            />
          </div>
        </div>

        <div className={`space-y-4 ${mobileSection === 'changes' ? '' : 'hidden lg:block'}`}>
          <div id="change-requests-panel" className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">Change Requests</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Request No</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Requested By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {changeRequestPagination.rows.map((requestRow) => (
                    <tr
                      key={requestRow.id}
                      className={`cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5 ${
                        highlightedChangeRequestId === requestRow.id ? 'bg-primary/10 ring-1 ring-primary/40' : ''
                      }`}
                      onClick={() => openChangeRequestPreview(requestRow)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openChangeRequestPreview(requestRow);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 font-medium text-primary">{requestRow.request_number || `CR-${requestRow.id}`}</td>
                      <td className="px-3 py-2 text-foreground/80">{requestRow.source_entity_type} #{requestRow.source_entity_id}</td>
                      <td className="px-3 py-2">{requestRow.request_type}</td>
                      <td className="px-3 py-2"><span className="rounded bg-muted px-2 py-0.5 text-xs text-foreground/80">{requestRow.status}</span></td>
                      <td className="px-3 py-2">{requestRow.priority || 'normal'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{requestRow.requested_by_name || '—'}</td>
                    </tr>
                  ))}
                  {changeRequestPagination.total === 0 && (
                    <tr><td colSpan="6" className="px-3 py-4 text-center text-muted-foreground">No change requests found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={changeRequestPagination.page}
              pageCount={changeRequestPagination.pageCount}
              total={changeRequestPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setChangeRequestPage}
            />
          </div>
        </div>
      </div>

      <div id="users-contacts" className={`overflow-hidden rounded-xl border border-border bg-card shadow-sm ${mobileSection === 'users' ? '' : 'hidden lg:block'}`}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">{t('usersSalespersons')}</h2>
          <button
            type="button"
            onClick={() => setShowUserForm((current) => !current)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            {t('addUserContact')}
          </button>
        </div>
        {showUserForm && (
          <form onSubmit={handleSaveUser} className="space-y-4 border-b border-border bg-muted/20 p-4">
            {userFormNotice && (
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  userFormNotice.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {userFormNotice.message}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={FORM_LABEL_CLASS}>{t('name')}</span>
                <input
                  value={userDraft.name}
                  onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                  autoFocus
                  className={FORM_INPUT_CLASS}
                  placeholder="Full name"
                />
              </label>
              <label>
                <span className={FORM_LABEL_CLASS}>{t('phone')}</span>
                <input
                  value={userDraft.phone}
                  onChange={(event) => setUserDraft((current) => ({ ...current, phone: event.target.value }))}
                  className={FORM_INPUT_CLASS}
                  placeholder="10-digit phone"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={FORM_LABEL_CLASS}>{t('email')}</span>
                <input
                  type="email"
                  value={userDraft.email}
                  onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
                  className={FORM_INPUT_CLASS}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                <span className={FORM_LABEL_CLASS}>{t('role')}</span>
                <div className="relative">
                  <select
                    value={userDraft.role}
                    onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                    className={FORM_SELECT_CLASS}
                  >
                    <option value="stock_maintainer">stock_maintainer</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={FORM_PANEL_CLASS}>
                <span className={FORM_LABEL_CLASS}>Password</span>
                <div className="relative">
                  <input
                    type={showPrimaryPassword ? 'text' : 'password'}
                    value={userDraft.password}
                    onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                    className={`${FORM_INPUT_CLASS} pr-10`}
                    placeholder="12+ chars, 3 of 4 types"
                    minLength={12}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrimaryPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPrimaryPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPrimaryPassword}
                  >
                    {showPrimaryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Use at least 12 characters and include 3 of 4 types: lowercase, uppercase, number, and symbol.</p>
              </label>
              <label className={FORM_PANEL_CLASS}>
                <span className={FORM_LABEL_CLASS}>Confirm Password</span>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={`${FORM_INPUT_CLASS} pr-10`}
                    placeholder="Re-enter password"
                    minLength={12}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={actionLoading === 'user-save'}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === 'user-save' ? 'Saving...' : 'Save User'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserForm(false);
                  setUserFormNotice(null);
                  setConfirmPassword('');
                  setShowPrimaryPassword(false);
                  setShowConfirmPassword(false);
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
            </div>
            <input type="hidden" value={userDraft.status} readOnly />
          </form>
        )}
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('name')}</th>
                <th className="px-3 py-2">{t('email')}</th>
                <th className="px-3 py-2">{t('phone')}</th>
                <th className="px-3 py-2">{t('role')}</th>
                <th className="px-3 py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {userPagination.rows.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                  onClick={() => openUserPreview(u)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openUserPreview(u);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-3 py-2 font-medium text-foreground">{u.full_name || 'N/A'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2">{u.phone_number || 'N/A'}</td>
                  <td className="px-3 py-2"><span className="rounded bg-muted px-2 py-0.5 text-xs text-foreground/80">{u.role}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {u.is_active ? <span className="text-green-600 text-xs font-semibold">{t('active')}</span> : <span className="text-red-600 text-xs font-semibold">{t('inactive')}</span>}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteUser(u.id);
                        }}
                        disabled={actionLoading === `user-${u.id}-delete`}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={userPagination.page}
          pageCount={userPagination.pageCount}
          total={userPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setUserPage}
        />
      </div>

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        summary={
          previewState.loading ? (
            <div className="text-sm text-slate-500">Loading preview…</div>
          ) : previewState.error ? (
            <div className="text-sm text-red-600">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'change-request'
            ? [
                {
                  title: 'Change Request Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Request No.', value: previewState.record?.request_number },
                        { label: 'Source Type', value: previewState.record?.source_entity_type },
                        { label: 'Source ID', value: previewState.record?.source_entity_id },
                        { label: 'Request Type', value: previewState.record?.request_type },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Priority', value: previewState.record?.priority },
                        { label: 'Requested By', value: previewState.record?.requested_by_name },
                        { label: 'Reason', value: previewState.record?.reason },
                        { label: 'Created At', value: formatDateTime(previewState.record?.created_at) },
                        { label: 'Reviewed At', value: formatDateTime(previewState.record?.reviewed_at) },
                        { label: 'Approved At', value: formatDateTime(previewState.record?.approved_at) },
                        { label: 'Review Notes', value: previewState.record?.reviewed_notes },
                        { label: 'Approval Notes', value: previewState.record?.approval_notes },
                      ]}
                    />
                  ),
                },
              ]
            : previewState.kind === 'user'
            ? [
                {
                  title: 'User Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Full Name', value: previewState.record?.full_name },
                        { label: 'Email', value: previewState.record?.email },
                        { label: 'Phone', value: previewState.record?.phone_number },
                        { label: 'Role', value: previewState.record?.role },
                        { label: 'Active', value: previewState.record?.is_active ? 'Yes' : 'No' },
                        { label: 'Auth0 Sub', value: previewState.record?.auth0_sub },
                        { label: 'Last Login', value: previewState.record?.last_login_at },
                      ]}
                    />
                  ),
                },
              ]
            : [
                {
                  title: 'Shipment Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Shipment No.', value: previewState.record?.shipment_number },
                        { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Truck', value: previewState.record?.truck_license_plate },
                        { label: 'Driver', value: previewState.record?.driver_name },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Approval', value: previewState.record?.approval_status },
                        { label: 'Whole Qty', value: previewState.record?.total_whole_qty },
                        { label: 'Broken Qty', value: previewState.record?.total_broken_qty },
                      ]}
                    />
                  ),
                },
                previewState.items?.length
                  ? {
                      title: 'Line Items',
                      children: (
                        <>
                          <div className="overflow-hidden rounded-2xl border border-border bg-card">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-muted/70 text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">SKU</th>
                                  <th className="px-3 py-2">Name</th>
                                  <th className="px-3 py-2 text-right">Whole</th>
                                  <th className="px-3 py-2 text-right">Broken</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {previewItemPagination.rows.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 font-medium text-foreground">{item.sku}</td>
                                    <td className="px-3 py-2 text-foreground/80">{item.item_name}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_whole_qty ?? item.received_whole_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_broken_qty ?? item.received_broken_qty ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PaginationControls
                            page={previewItemPagination.page}
                            pageCount={previewItemPagination.pageCount}
                            total={previewItemPagination.total}
                            pageSize={DEFAULT_PAGE_SIZE}
                            onPageChange={setPreviewItemsPage}
                          />
                        </>
                      ),
                    }
                  : null,
                previewState.documents?.length
                  ? {
                      title: 'Linked Documents',
                      children: (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {previewState.documents.map((document) => (
                            <a
                              key={document.id}
                              href={document.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-border bg-muted/30 p-3 transition hover:border-primary/30 hover:bg-primary/5"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                            </a>
                          ))}
                        </div>
                      ),
                    }
                  : null,
              ]
        }
      />
    </div>
  );
}
