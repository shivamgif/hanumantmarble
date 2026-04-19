'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { useEffect, useState } from 'react';
import { useAuthUser } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';
import { validateStockPassword } from '@/lib/password-policy';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, BarChart2, ChevronDown, Eye, EyeOff, PackageSearch, ShieldAlert, UsersRound } from 'lucide-react';

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


const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/75';
const FORM_INPUT_CLASS = 'mt-1';
const FORM_SELECT_CLASS = 'mt-1';
const FORM_PANEL_CLASS = 'rounded-2xl border border-border/80 bg-background/80 p-4';

const CLASSES = {
  heroGrid: 'grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6',
  heroCard: 'min-w-0 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:p-6 dark:border-slate-700 dark:bg-slate-900',
  heroLabel: 'text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
  heroValue: 'mt-2 break-all text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white',
  heroBadgeBase: 'text-[10px] px-2 py-0.5 rounded-full font-semibold',
  sectionCard: 'rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
  sectionHeader: 'flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800',
  avatar: 'h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-semibold text-xs',
  actionButton: 'active:scale-95 transition-transform',
};

function getInitials(name, email) {
  const source = (name || email || '').trim();
  if (!source) {
    return 'NA';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getUserRoleBadgeClass(role) {
  if (role === 'admin') {
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }

  if (role === 'salesperson' || role === 'sales') {
    return 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300';
  }

  if (role === 'stock_maintainer' || role === 'manager') {
    return 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function getStatusVariant(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved') || normalized.includes('active') || normalized.includes('complete')) {
    return 'approved';
  }
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('warning')) {
    return 'pending';
  }
  if (normalized.includes('rejected') || normalized.includes('failed') || normalized.includes('critical')) {
    return 'rejected';
  }
  return 'neutral';
}

export default function AdminDashboard() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const t = (key) => getTranslation(`stock.admin.${key}`, language);
  const ta = {
    operationalAlerts: language === 'hi' ? 'संचालन अलर्ट' : 'Operational Alerts',
    active: language === 'hi' ? 'सक्रिय' : 'active',
    recentActivity: language === 'hi' ? 'हाल की गतिविधि' : 'Recent Activity',
    liveOpsSnapshot: language === 'hi' ? 'लाइव संचालन स्नैपशॉट' : 'Live operations snapshot',
    approvals: language === 'hi' ? 'अनुमोदन' : 'Approvals',
    changes: language === 'hi' ? 'परिवर्तन' : 'Changes',
    users: language === 'hi' ? 'उपयोगकर्ता' : 'Users',
    maintainer: language === 'hi' ? 'मेंटेनर' : 'Maintainer',
    changeRequests: language === 'hi' ? 'परिवर्तन अनुरोध' : 'Change Requests',
    requestNo: language === 'hi' ? 'अनुरोध संख्या' : 'Request No',
    source: language === 'hi' ? 'स्रोत' : 'Source',
    type: language === 'hi' ? 'प्रकार' : 'Type',
    priority: language === 'hi' ? 'प्राथमिकता' : 'Priority',
    requestedBy: language === 'hi' ? 'अनुरोधकर्ता' : 'Requested By',
    noChangeRequests: language === 'hi' ? 'कोई परिवर्तन अनुरोध नहीं मिला।' : 'No change requests found.',
    department: language === 'hi' ? 'विभाग' : 'Department',
    password: language === 'hi' ? 'पासवर्ड' : 'Password',
    confirmPassword: language === 'hi' ? 'पासवर्ड की पुष्टि करें' : 'Confirm Password',
    user: language === 'hi' ? 'उपयोगकर्ता' : 'User',
    role: language === 'hi' ? 'भूमिका' : 'Role',
    actions: language === 'hi' ? 'कार्रवाई' : 'Actions',
    status: language === 'hi' ? 'स्थिति' : 'Status',
    sku: language === 'hi' ? 'SKU' : 'SKU',
    name: language === 'hi' ? 'नाम' : 'Name',
    whole: language === 'hi' ? 'संपूर्ण' : 'Whole',
    broken: language === 'hi' ? 'टूटी' : 'Broken',
    noUsersFound: language === 'hi' ? 'कोई उपयोगकर्ता नहीं मिला।' : 'No users found.',
    loadingPreview: language === 'hi' ? 'पूर्वावलोकन लोड हो रहा है…' : 'Loading preview…',
    paginationShowing: language === 'hi' ? 'दिखाए जा रहे हैं' : 'Showing',
    paginationOf: language === 'hi' ? 'में से' : 'of',
    paginationPrevious: language === 'hi' ? 'पिछला' : 'Previous',
    paginationNext: language === 'hi' ? 'अगला' : 'Next',
    paginationPage: language === 'hi' ? 'पेज' : 'Page',
  };
  const { user } = useAuthUser();
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
  const [actionNotice, setActionNotice] = useState(null);
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
  const createUserForm = useForm({
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      password: '',
      role: 'stock_maintainer',
      department: '',
      status: 'active',
    },
  });
  const previewUserForm = useForm({
    defaultValues: {
      role: 'stock_maintainer',
      status: 'inactive',
      canManageUsers: false,
      canApproveChanges: false,
      canViewDashboard: false,
    },
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
    setActionNotice(null);
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

      if (action === 'approve') {
        if (json?.idempotent) {
          setActionNotice({ type: 'success', message: 'Already approved; no duplicate stock movement applied' });
        } else {
          setActionNotice({ type: 'success', message: 'Shipment approved successfully.' });
        }
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

  function mergePreviewUser(user) {
    setPreviewState((current) => {
      if (current.kind !== 'user' || current.record?.id !== user.id) {
        return current;
      }

      return {
        ...current,
        record: {
          ...current.record,
          ...user,
        },
      };
    });
  }

  async function handleUpdateUser(userId, updates, successMessage = null) {
    setActionLoading(`user-${userId}-update`);
    setError(null);
    setActionNotice(null);

    try {
      const response = await fetch('/api/stock/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          ...updates,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to update user');
      }

      const updatedUser = {
        ...json.user,
        full_name: json.user?.name,
        phone_number: json.user?.phone,
        is_active: json.user?.status === 'active',
      };

      mergePreviewUser(updatedUser);
      previewUserForm.reset({
        role: updatedUser.role || 'stock_maintainer',
        status: updatedUser.status || (updatedUser.is_active ? 'active' : 'inactive'),
        canManageUsers: Boolean(updatedUser.can_manage_users),
        canApproveChanges: Boolean(updatedUser.can_approve_changes),
        canViewDashboard: Boolean(updatedUser.can_view_dashboard),
      });
      if (successMessage) {
        setActionNotice({ type: 'success', message: successMessage });
      }
      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApproveUser(user) {
    await handleUpdateUser(
      user.id,
      {
        status: 'active',
        canViewDashboard: true,
      },
      `${user.full_name || user.email} is now approved for stock access.`
    );
  }

  async function handleRejectUser(user) {
    await handleUpdateUser(
      user.id,
      {
        status: 'inactive',
        canViewDashboard: false,
      },
      `${user.full_name || user.email} access was set to inactive.`
    );
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

  const handleSaveUser = createUserForm.handleSubmit(async (values) => {
    setUserFormNotice(null);
    setError(null);

    if (!values.name.trim() || !values.phone.trim()) {
      setUserFormNotice({ type: 'error', message: 'Name and phone are required.' });
      return;
    }

    if (!values.email.trim()) {
      setUserFormNotice({ type: 'error', message: 'Email is required.' });
      return;
    }

    const passwordError = validateStockPassword(values.password);
    if (passwordError) {
      setUserFormNotice({ type: 'error', message: passwordError });
      return;
    }

    if (values.password !== confirmPassword) {
      setUserFormNotice({ type: 'error', message: 'Password and confirm password do not match.' });
      return;
    }

    setActionLoading('user-save');
    setError(null);

    try {
      const response = await fetch('/api/stock/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save user');
      }

      createUserForm.reset({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', department: '', status: 'active' });
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
  });

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
    if (previewState.kind !== 'user' || !previewState.record) {
      return;
    }

    previewUserForm.reset({
      role: previewState.record.role || 'stock_maintainer',
      status: previewState.record.status || (previewState.record.is_active ? 'active' : 'inactive'),
      canManageUsers: Boolean(previewState.record.can_manage_users),
      canApproveChanges: Boolean(previewState.record.can_approve_changes),
      canViewDashboard: Boolean(previewState.record.can_view_dashboard),
    });
  }, [previewState.kind, previewState.record, previewUserForm]);

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
  const totalUsers = Number(data?.users?.length || 0);
  const activeUsers = (data?.users || []).filter((entry) => Boolean(entry?.is_active)).length;
  const pendingUsers = Math.max(totalUsers - activeUsers, 0);

  const summaryTiles = [
    {
      label: 'Team Accounts',
      value: totalUsers,
      href: '/stock?view=items',
      icon: UsersRound,
      trend: activeUsers - pendingUsers,
      iconAccent: 'bg-[#1A1A54]/10 text-[#1A1A54]',
      subMetrics: [
        { label: 'Active', value: activeUsers },
        { label: 'Pending', value: pendingUsers },
      ],
    },
    {
      label: 'Approval Queue',
      value: pendingReviews,
      href: '#approval-queue',
      icon: ShieldAlert,
      trend: pendingReviews > 0 ? -pendingReviews : 1,
      iconAccent: 'bg-[#F59E0B]/15 text-[#E07A00]',
      subMetrics: [
        { label: 'Inbound', value: Number(analyticsData?.summary?.pending_inbound_reviews || 0) },
        { label: 'Outbound', value: Number(analyticsData?.summary?.pending_outbound_reviews || 0) },
      ],
    },
    {
      label: 'Stored Units',
      value: Number(analyticsData?.summary?.total_whole_stored || 0) + Number(analyticsData?.summary?.total_broken_stored || 0),
      href: '/stock?view=items',
      icon: PackageSearch,
      trend: Number(analyticsData?.summary?.total_whole_stored || 0) - Number(analyticsData?.summary?.total_broken_stored || 0),
      iconAccent: 'bg-[#E07A00]/10 text-[#E07A00]',
      subMetrics: [
        { label: 'Whole', value: Number(analyticsData?.summary?.total_whole_stored || 0) },
        { label: 'Broken', value: Number(analyticsData?.summary?.total_broken_stored || 0) },
      ],
    },
    {
      label: 'Net Movement',
      value: totalIncoming - totalOutgoing,
      href: '/stock?view=arrivals',
      icon: ArrowRightLeft,
      trend: totalIncoming - totalOutgoing,
      iconAccent: 'bg-[#1A1A54]/10 text-[#1A1A54]',
      subMetrics: [
        { label: 'Incoming', value: totalIncoming },
        { label: 'Outgoing', value: totalOutgoing },
      ],
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

  const movementPeak = movementTrend.reduce((peak, point) => {
    const total = Number(point.inbound || 0) + Number(point.outbound || 0);
    if (!peak || total > peak.total) {
      return { ...point, total };
    }
    return peak;
  }, null);

  const movementSummary = movementPeak
    ? `High-volume day detected on ${new Date(movementPeak.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} with ${movementPeak.total} units moved.`
    : 'Waiting for enough movement history to identify a high-volume day.';

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`hero-skeleton-${index}`} className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-32" />
          ))}
        </div>
        <div className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-64" />
      </div>
    );
  }
  if (!data && error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 lg:space-y-6">
      <h1 className="text-xl font-bold text-foreground lg:text-2xl">{t('adminTitle')}</h1>

      {actionNotice ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            actionNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {actionNotice.message}
        </div>
      ) : null}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className={`${CLASSES.heroGrid} xl:col-span-2`}>
          {summaryTiles.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className={`${CLASSES.heroCard} ${CLASSES.actionButton}`}
            >
              <div className="flex items-start justify-between">
                <p className={`${CLASSES.heroLabel} min-w-0 truncate`}>{stat.label}</p>
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${stat.iconAccent || 'bg-[#E07A00]/10 text-[#E07A00]'}`}>
                  <stat.icon className="h-4 w-4" />
                </span>
              </div>
              <p className={`${CLASSES.heroValue} font-mono`}>{stat.value}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {stat.subMetrics.map((item) => (
                  <span key={`${stat.label}-${item.label}`} className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{item.label}</span>
                    <span className="font-mono text-slate-700 dark:text-slate-200">{item.value}</span>
                  </span>
                ))}
                <span className={`${CLASSES.heroBadgeBase} shrink-0 ${stat.trend > 0 ? 'bg-[#E07A00]/10 text-[#E07A00]' : 'bg-[#1A1A54]/10 text-[#1A1A54] dark:bg-[#1A1A54]/20 dark:text-slate-100'}`}>
                  {stat.trend > 0 ? 'Up' : 'Down'}
                </span>
              </div>
            </Link>
          ))}
        </div>

      </div>

      <Link
        href="/stock/analytics"
        className="flex items-center justify-between rounded-2xl border border-slate-200/60 bg-gradient-to-r from-[#1A1A54]/5 to-[#E07A00]/5 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:from-[#1A1A54]/10 dark:to-[#E07A00]/10"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#E07A00]/10 text-[#E07A00]">
            <BarChart2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Analytics Dashboard</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Purchase, dispatch, inventory &amp; salesperson performance</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-[#E07A00]">View →</span>
      </Link>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{ta.operationalAlerts}</h3>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {operationalAlerts.length || 0} {ta.active}
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
            <h3 className="text-sm font-semibold text-foreground">{ta.recentActivity}</h3>
            <span className="text-xs text-muted-foreground">{ta.liveOpsSnapshot}</span>
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
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${event.kind === 'arrival' ? 'bg-[#E07A00]/10 text-[#E07A00]' : 'bg-[#1A1A54]/10 text-[#1A1A54] dark:bg-[#1A1A54]/20 dark:text-slate-100'}`}>
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
          {[{ id: 'approvals', label: ta.approvals }, { id: 'changes', label: ta.changes }, { id: 'users', label: ta.users }].map((tab) => {
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

      <div className="hidden rounded-xl border border-border bg-card/80 p-1 shadow-sm lg:block">
        <div className="grid grid-cols-3 gap-1">
          {[{ id: 'approvals', label: ta.approvals }, { id: 'changes', label: ta.changes }, { id: 'users', label: ta.users }].map((tab) => {
            const isActive = mobileSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileSection(tab.id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div id="approval-queue" className={`space-y-4 ${mobileSection === 'approvals' ? '' : 'hidden'}`}>
          <div className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">{t('pendingArrivals')}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('shipmentNo')}</th>
                    <th className="px-3 py-2">{ta.maintainer}</th>
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
                      <td className="px-3 py-2 font-mono font-medium text-primary">{item.shipment_number}</td>
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
              labels={{ showing: ta.paginationShowing, of: ta.paginationOf, previous: ta.paginationPrevious, next: ta.paginationNext, page: ta.paginationPage }}
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
                      <td className="px-3 py-2 font-mono font-medium text-primary">{item.shipment_number}</td>
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
              labels={{ showing: ta.paginationShowing, of: ta.paginationOf, previous: ta.paginationPrevious, next: ta.paginationNext, page: ta.paginationPage }}
            />
          </div>
        </div>

        <div className={`space-y-4 ${mobileSection === 'changes' ? '' : 'hidden'}`}>
          <div id="change-requests-panel" className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">{ta.changeRequests}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{ta.requestNo}</th>
                    <th className="px-3 py-2">{ta.source}</th>
                    <th className="px-3 py-2">{ta.type}</th>
                    <th className="px-3 py-2">{ta.status}</th>
                    <th className="px-3 py-2">{ta.priority}</th>
                    <th className="px-3 py-2">{ta.requestedBy}</th>
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
                      <td className="px-3 py-2 font-mono font-medium text-primary">{requestRow.request_number || `CR-${requestRow.id}`}</td>
                      <td className="px-3 py-2 text-foreground/80">{requestRow.source_entity_type} #{requestRow.source_entity_id}</td>
                      <td className="px-3 py-2">{requestRow.request_type}</td>
                      <td className="px-3 py-2"><Badge variant={getStatusVariant(requestRow.status)}>{requestRow.status}</Badge></td>
                      <td className="px-3 py-2">{requestRow.priority || 'normal'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{requestRow.requested_by_name || '—'}</td>
                    </tr>
                  ))}
                  {changeRequestPagination.total === 0 && (
                    <tr><td colSpan="6" className="px-3 py-4 text-center text-muted-foreground">{ta.noChangeRequests}</td></tr>
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
              labels={{ showing: ta.paginationShowing, of: ta.paginationOf, previous: ta.paginationPrevious, next: ta.paginationNext, page: ta.paginationPage }}
            />
          </div>
        </div>
      </div>

      <div id="users-contacts" className={`${CLASSES.sectionCard} overflow-hidden ${mobileSection === 'users' ? '' : 'hidden'}`}>
        <div className={CLASSES.sectionHeader}>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('usersSalespersons')}</h2>
          <button
            type="button"
            onClick={() => setShowUserForm((current) => !current)}
            className={`${CLASSES.actionButton} rounded-lg bg-[#E07A00] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#c96d00]`}
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
                <Label className={FORM_LABEL_CLASS}>{t('name')}</Label>
                <Input
                  {...createUserForm.register('name')}
                  autoFocus
                  className={FORM_INPUT_CLASS}
                  placeholder="Full name"
                />
              </label>
              <label>
                <Label className={FORM_LABEL_CLASS}>{t('phone')}</Label>
                <Input
                  {...createUserForm.register('phone')}
                  className={FORM_INPUT_CLASS}
                  placeholder="10-digit phone"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <Label className={FORM_LABEL_CLASS}>{t('email')}</Label>
                <Input
                  {...createUserForm.register('email')}
                  type="email"
                  className={FORM_INPUT_CLASS}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                <Label className={FORM_LABEL_CLASS}>{t('role')}</Label>
                <Select
                  value={createUserForm.watch('role')}
                  onValueChange={(value) => createUserForm.setValue('role', value, { shouldDirty: true })}
                >
                  <SelectTrigger className={FORM_SELECT_CLASS}>
                    <SelectValue placeholder={t('role')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock_maintainer">{language === 'hi' ? 'स्टॉक मेंटेनर' : 'stock_maintainer'}</SelectItem>
                    <SelectItem value="salesperson">{language === 'hi' ? 'सेल्सपर्सन' : 'salesperson'}</SelectItem>
                    <SelectItem value="manager">{language === 'hi' ? 'प्रबंधक' : 'manager'}</SelectItem>
                    <SelectItem value="admin">{language === 'hi' ? 'एडमिन' : 'admin'}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <Label className={FORM_LABEL_CLASS}>{ta.department}</Label>
                <Input
                  {...createUserForm.register('department')}
                  className={FORM_INPUT_CLASS}
                  placeholder="General"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={FORM_PANEL_CLASS}>
                <Label className={FORM_LABEL_CLASS}>{ta.password}</Label>
                <div className="relative">
                  <Input
                    {...createUserForm.register('password')}
                    type={showPrimaryPassword ? 'text' : 'password'}
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
                <Label className={FORM_LABEL_CLASS}>{ta.confirmPassword}</Label>
                <div className="relative">
                  <Input
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
                className={`${CLASSES.actionButton} rounded-xl bg-[#E07A00] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c96d00] disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {actionLoading === 'user-save' ? 'Saving...' : 'Save User'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserForm(false);
                  setUserFormNotice(null);
                  createUserForm.reset({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', department: '', status: 'active' });
                  setConfirmPassword('');
                  setShowPrimaryPassword(false);
                  setShowConfirmPassword(false);
                }}
                className={`${CLASSES.actionButton} rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted`}
              >
                Cancel
              </button>
            </div>
            <input type="hidden" {...createUserForm.register('status')} readOnly />
          </form>
        )}
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/90 text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-semibold">{ta.user}</th>
                <th className="px-6 py-3 font-semibold">{ta.role}</th>
                <th className="px-6 py-3 font-semibold">{ta.department}</th>
                <th className="px-6 py-3 font-semibold">{ta.status}</th>
                <th className="px-6 py-3 text-right font-semibold">{ta.actions}</th>
              </tr>
            </thead>
            <tbody>
              {userPagination.rows.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
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
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={CLASSES.avatar}>{getInitials(u.full_name, u.email)}</div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{u.full_name || 'N/A'}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">ID #{u.id} • {u.phone_number || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getUserRoleBadgeClass(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{u.department || 'General'}</td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {u.is_active ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="inline-flex h-2 w-2 rounded-full bg-rose-500" />
                      )}
                      {u.is_active ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (u.is_active) {
                            handleRejectUser(u);
                          } else {
                            handleApproveUser(u);
                          }
                        }}
                        disabled={actionLoading === `user-${u.id}-update`}
                        className={`${CLASSES.actionButton} rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                          u.is_active
                            ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                        }`}
                      >
                        {u.is_active ? 'Suspend' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openUserPreview(u);
                        }}
                        className={`${CLASSES.actionButton} rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteUser(u.id);
                        }}
                        disabled={actionLoading === `user-${u.id}-delete`}
                        className={`${CLASSES.actionButton} rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {userPagination.total === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{ta.noUsersFound}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={userPagination.page}
          pageCount={userPagination.pageCount}
          total={userPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setUserPage}
          labels={{ showing: ta.paginationShowing, of: ta.paginationOf, previous: ta.paginationPrevious, next: ta.paginationNext, page: ta.paginationPage }}
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
            <div className="text-sm text-slate-500">{ta.loadingPreview}</div>
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
                    <div className="space-y-5">
                      <PreviewKeyValueGrid
                        items={[
                          { label: 'Full Name', value: previewState.record?.full_name },
                          { label: 'Email', value: previewState.record?.email },
                          { label: 'Phone', value: previewState.record?.phone_number },
                          { label: 'Role', value: previewState.record?.role },
                          { label: 'Department', value: previewState.record?.department || 'General' },
                          { label: 'Active', value: previewState.record?.is_active ? 'Yes' : 'No' },
                          { label: 'Auth Provider', value: previewState.record?.external_auth_provider || 'better-auth' },
                          { label: 'External Auth ID', value: previewState.record?.external_auth_id },
                          { label: 'Legacy Auth Sub', value: previewState.record?.auth0_sub },
                          { label: 'Last Login', value: previewState.record?.last_login_at },
                        ]}
                      />
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Access & RBAC</h3>
                            <p className="text-xs text-muted-foreground">Approve onboarding requests, assign roles, and override user permissions.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApproveUser(previewState.record)}
                              disabled={actionLoading === `user-${previewState.record?.id}-update` || previewState.record?.is_active}
                              className={`${CLASSES.actionButton} rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20`}
                            >
                              Approve User
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectUser(previewState.record)}
                              disabled={actionLoading === `user-${previewState.record?.id}-update` || !previewState.record?.is_active}
                              className={`${CLASSES.actionButton} rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20`}
                            >
                              Suspend User
                            </button>
                          </div>
                        </div>
                        <form
                          className="space-y-4"
                          onSubmit={previewUserForm.handleSubmit((values) => handleUpdateUser(
                            previewState.record.id,
                            values,
                            'User access updated.'
                          ))}
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <label>
                              <Label className={FORM_LABEL_CLASS}>Role</Label>
                              <Select
                                value={previewUserForm.watch('role')}
                                onValueChange={(value) => previewUserForm.setValue('role', value, { shouldDirty: true })}
                              >
                                <SelectTrigger className={FORM_SELECT_CLASS}>
                                  <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stock_maintainer">stock_maintainer</SelectItem>
                                  <SelectItem value="salesperson">salesperson</SelectItem>
                                  <SelectItem value="manager">manager</SelectItem>
                                  <SelectItem value="admin">admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </label>
                            <label>
                              <Label className={FORM_LABEL_CLASS}>Status</Label>
                              <Select
                                value={previewUserForm.watch('status')}
                                onValueChange={(value) => previewUserForm.setValue('status', value, { shouldDirty: true })}
                              >
                                <SelectTrigger className={FORM_SELECT_CLASS}>
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">active</SelectItem>
                                  <SelectItem value="inactive">inactive</SelectItem>
                                </SelectContent>
                              </Select>
                            </label>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {[
                              ['canManageUsers', 'Can manage users'],
                              ['canApproveChanges', 'Can approve changes'],
                              ['canViewDashboard', 'Can view dashboard'],
                            ].map(([key, label]) => (
                              <label key={key} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                                <Checkbox {...previewUserForm.register(key)} />
                                <span>{label}</span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-4">
                            <button
                              type="submit"
                              disabled={actionLoading === `user-${previewState.record?.id}-update`}
                              className={`${CLASSES.actionButton} rounded-xl bg-[#E07A00] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c96d00] disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              {actionLoading === `user-${previewState.record?.id}-update` ? 'Saving…' : 'Save Access'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
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
                                  <th className="px-3 py-2">{ta.sku}</th>
                                  <th className="px-3 py-2">{ta.name}</th>
                                  <th className="px-3 py-2 text-right">{ta.whole}</th>
                                  <th className="px-3 py-2 text-right">{ta.broken}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {previewItemPagination.rows.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 font-mono font-medium text-foreground">{item.sku}</td>
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
                            labels={{ showing: ta.paginationShowing, of: ta.paginationOf, previous: ta.paginationPrevious, next: ta.paginationNext, page: ta.paginationPage }}
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
