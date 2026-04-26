'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { useEffect, useState } from 'react';
import { useAuthUser } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { arrivalFormSchema, bagArrivalFormSchema, dispatchFormSchema } from '@/lib/forms/stock-forms';
import { useStockFormStore } from '@/lib/stores/stock-form-store';
import { createArrivalItemRow, createBagArrivalItemRow, createDispatchItemRow, createInitialArrivalDraft, createInitialBagArrivalDraft, createInitialDispatchDraft, toNumber, trimText } from '@/app/stock/lib/stock-utils';
import { ArrivalFormContent, BagArrivalFormContent } from '@/app/stock/components/arrival-form';
import { DispatchFormContent } from '@/app/stock/components/dispatch-form';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';
import { usePageSize } from '@/hooks/usePageSize';
import { validateStockPassword } from '@/lib/password-policy';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowRightLeft,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  PackageSearch,
  ShieldAlert,
  UsersRound,
  Activity,
  ArrowLeft,
  FileText,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertCircle,
  Package,
  X,
  Clock,
  Pencil
} from 'lucide-react';

function formatCompactNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

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
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6',
  card: 'glass-panel rounded-3xl sm:rounded-[2rem] p-5 sm:p-6 lg:p-8 transition-all duration-500 hover:shadow-xl group/card',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 group-hover/card:text-brand-primary transition-colors',
  value: 'mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-sans tracking-tight',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2',
  avatar: 'h-10 w-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex shrink-0 items-center justify-center text-slate-600 dark:text-slate-300 font-black text-xs border border-slate-200 dark:border-slate-700 shadow-sm',
  actionButton: 'active:scale-95 transition-all duration-200',
};

function AnalyticsCard({ title, subtitle, topRight, contextBar, insight, showInsight, children, className = '' }) {
  return (
    <div className={`${CLASSES.card} ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h3 className={CLASSES.title}>{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-bold tracking-tight leading-relaxed uppercase opacity-70">{subtitle}</p>}
        </div>
        <div className="shrink-0">
          {topRight}
        </div>
      </div>
      {showInsight && insight && (
        <div className="mb-8 p-5 rounded-2xl bg-brand-primary/5 border border-brand-primary/10 animate-scale-in">
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-bold">
            <span className="font-black text-brand-primary uppercase mr-2 text-[9px] tracking-[0.2em] border-b-2 border-brand-primary/20 pb-0.5">Logic:</span>
            {insight}
          </p>
        </div>
      )}
      {contextBar && (
        <div className="mb-8 px-4 py-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black italic tracking-tight uppercase opacity-60">{contextBar}</p>
        </div>
      )}
      <div className="relative w-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function TrendCapsule({ value, isPositive }) {
  return (
    <span
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${isPositive
        ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20'
        : 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20'
        }`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

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
  const td = (key) => getTranslation(`stock.dashboard.${key}`, language);
  const tc = {
    inventoryHub: td('inventoryHub'), stockLedger: td('stockLedger'), dispatches: td('dispatches'),
    purchases: td('purchases'), filter: td('filter'), sort: td('sort'), search: td('search'),
    submitting: td('submitting'), date: td('date'), invoiceDate: td('invoiceDate'),
    transporter: td('transporter'), amountInInr: td('amountInInr'), invoicePhoto: td('invoicePhoto'),
    invoicePhotoHint: td('invoicePhotoHint'), transporterBillPhoto: td('transporterBillPhoto'),
    transporterBillHint: td('transporterBillHint'), originCity: td('originCity'),
    destinationWarehouse: td('destinationWarehouse'), purchaseBasics: td('purchaseBasics'),
    purchaseBasicsDesc: td('purchaseBasicsDesc'), transportInvoice: td('transportInvoice'),
    itemLabel: td('itemLabel'), autofilledCatalog: td('autofilledCatalog'), newTileEntry: td('newTileEntry'),
    typeTileName: td('typeTileName'), wholeBox: td('wholeBox'), brokenTiles: td('brokenTiles'),
    orderedSqm: td('orderedSqm'), wholeSqm: td('wholeSqm'), brokenSqm: td('brokenSqm'),
    catalogIntelligence: td('catalogIntelligence'), technicalEntry: td('technicalEntry'),
    brand: td('brand'), division: td('division'), finish: td('finish'), quality: td('quality'),
    width: td('width'), length: td('length'), mm: td('mm'), thickness: td('thickness'),
    description: td('description'), ordered: td('ordered'), piecesPerBox: td('piecesPerBox'),
    hsn: td('hsn'), handlingCost: td('handlingCost'), fuelCost: td('fuelCost'), gst: td('gst'),
    weightKg: td('weightKg'), assets: td('assets'), submitPurchase: td('submitPurchase'),
    submitDispatch: td('submitDispatch'), replaceFile: td('replaceFile'), chooseFile: td('chooseFile'),
    attachHint: td('attachHint'), formSection: td('formSection'), controlLabel: td('controlLabel'),
    dispatchBasics: td('dispatchBasics'), dispatchBasicsDesc: td('dispatchBasicsDesc'),
    transportAndVehicle: td('transportAndVehicle'), shipments: td('shipments'),
    retWhole: td('retWhole'), retBrok: td('retBrok'), customerPhone: td('customerPhone'),
    salesInvoicePhoto: td('salesInvoicePhoto'), salesInvoiceHint: td('salesInvoiceHint'),
    gatepassPhoto: td('gatepassPhoto'), gatepassHint: td('gatepassHint'), status: td('status'),
    approval: td('approval'), driver: td('driver'), paymentStatus: td('paymentStatus'),
    totalWhole: td('totalWhole'), totalBroken: td('totalBroken'), noPreview: td('noPreview'),
    visualVerificationHub: td('visualVerificationHub'), intelligenceCase: td('intelligenceCase'),
    linkedDocuments: td('linkedDocuments'), itemDetails: td('itemDetails'), sku: td('sku'),
    logNewPurchase: td('logNewPurchase'), logNewDispatch: td('logNewDispatch'),
    purchaseSheetDesc: td('purchaseSheetDesc'), insufficientNewPurchase: td('insufficientNewPurchase'),
    qtyBags: td('qtyBags'), returnQtyBags: td('returnQtyBags'), weightPerBag: td('weightPerBag'),
  };
  const { user } = useAuthUser();
  const canViewAnalytics = user?.role === 'manager';
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
  const [cancelledArrivalPage, setCancelledArrivalPage] = useState(1);
  const [changeRequestPage, setChangeRequestPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [showInsights, setShowInsights] = useState(true);
  const [changeRequests, setChangeRequests] = useState([]);
  const [highlightedChangeRequestId, setHighlightedChangeRequestId] = useState(null);
  const [processedDeepLink, setProcessedDeepLink] = useState('');
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize();
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
      divisions: ['Adhesive'],
      department: '',
      status: 'active',
    },
  });
  const previewUserForm = useForm({
    defaultValues: {
      role: 'stock_maintainer',
      divisions: ['Adhesive'],
      status: 'inactive',
      canManageUsers: false,
      canApproveChanges: false,
      canViewDashboard: false,
      salary: '',
      monthlySalesGoal: '',
    },
  });

  const [resetPasswordModal, setResetPasswordModal] = useState({ open: false, email: '', newPassword: '', confirm: '', loading: false, error: null, success: false });
  const [editingArrivalId, setEditingArrivalId] = useState(null);
  const [editingBagArrivalId, setEditingBagArrivalId] = useState(null);
  const [editingDispatchId, setEditingDispatchId] = useState(null);
  const [arrivalNotice, setArrivalNotice] = useState(null);
  const [dispatchNotice, setDispatchNotice] = useState(null);
  const [arrivalSubmitting, setArrivalSubmitting] = useState(false);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState({});

  const arrivalSheetOpen = useStockFormStore((state) => state.arrivalSheetOpen);
  const dispatchSheetOpen = useStockFormStore((state) => state.dispatchSheetOpen);
  const setArrivalSheetOpen = useStockFormStore((state) => state.setArrivalSheetOpen);
  const setDispatchSheetOpen = useStockFormStore((state) => state.setDispatchSheetOpen);
  const arrivalAttachments = useStockFormStore((state) => state.arrivalAttachments);
  const dispatchAttachments = useStockFormStore((state) => state.dispatchAttachments);
  const setArrivalAttachment = useStockFormStore((state) => state.setArrivalAttachment);
  const setDispatchAttachment = useStockFormStore((state) => state.setDispatchAttachment);
  const resetArrivalAttachments = useStockFormStore((state) => state.resetArrivalAttachments);
  const resetDispatchAttachments = useStockFormStore((state) => state.resetDispatchAttachments);

  const arrivalForm = useForm({
    resolver: zodResolver(arrivalFormSchema),
    defaultValues: createInitialArrivalDraft(),
  });
  const bagArrivalForm = useForm({
    resolver: zodResolver(bagArrivalFormSchema),
    defaultValues: createInitialBagArrivalDraft(),
  });
  const bagArrivalItemsFieldArray = useFieldArray({ control: bagArrivalForm.control, name: 'items' });
  const [bagArrivalNotice, setBagArrivalNotice] = useState(null);
  const [bagArrivalSubmitting, setBagArrivalSubmitting] = useState(false);
  const dispatchForm = useForm({
    resolver: zodResolver(dispatchFormSchema),
    defaultValues: createInitialDispatchDraft(),
  });
  const arrivalItemsFieldArray = useFieldArray({ control: arrivalForm.control, name: 'items' });
  const dispatchItemsFieldArray = useFieldArray({ control: dispatchForm.control, name: 'items' });
  const arrivalItems = useWatch({ control: arrivalForm.control, name: 'items' }) || [];

  async function handleResetPassword() {
    const { email, newPassword, confirm } = resetPasswordModal;
    const passwordError = validateStockPassword(newPassword);
    if (passwordError) {
      setResetPasswordModal((s) => ({ ...s, error: passwordError }));
      return;
    }
    if (newPassword !== confirm) {
      setResetPasswordModal((s) => ({ ...s, error: 'Passwords do not match.' }));
      return;
    }
    setResetPasswordModal((s) => ({ ...s, loading: true, error: null }));
    try {
      const response = await fetch('/api/stock/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to reset password');
      setResetPasswordModal((s) => ({ ...s, loading: false, success: true }));
    } catch (err) {
      setResetPasswordModal((s) => ({ ...s, loading: false, error: err.message }));
    }
  }

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const fetchPromises = [
          fetch('/api/stock/admin/dashboard'),
          canViewAnalytics ? fetch('/api/stock/dashboard') : Promise.resolve(null),
          fetch('/api/stock/change-requests', { cache: 'no-store' }),
        ];
        const [dashboardResponse, analyticsResponse, changeRequestResponse] = await Promise.all(fetchPromises);

        const dashboardJson = await dashboardResponse.json();
        const analyticsJson = analyticsResponse ? await analyticsResponse.json() : null;
        const changeRequestJson = await changeRequestResponse.json();

        if (!dashboardResponse.ok) {
          throw new Error(dashboardJson.error || 'Fetch failed');
        }

        if (analyticsResponse && !analyticsResponse.ok) {
          throw new Error(analyticsJson?.error || 'Failed to load analytics');
        }

        if (!changeRequestResponse.ok) {
          throw new Error(changeRequestJson.error || 'Failed to load change requests');
        }

        if (mounted) {
          setData(dashboardJson);
          if (analyticsJson) setAnalyticsData(analyticsJson);
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

  useEffect(() => {
    async function loadSuggestions() {
      try {
        const response = await fetch('/api/stock/form-suggestions', { cache: 'no-store' });
        if (!response.ok) return;
        const json = await response.json();
        if (json?.suggestions) setSuggestions(json.suggestions);
      } catch { }
    }
    if (user) loadSuggestions();
  }, [user]);

  async function handleShipmentAction(type, id, action, notes = null, additionalData = {}) {
    let confirmMessage = null;
    if (action === 'reject') {
      confirmMessage = 'Are you sure you want to reject this shipment?';
    } else if (action === 'delete') {
      confirmMessage = 'Are you sure you want to permanently delete this cancelled shipment? This action cannot be undone.';
    }

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
          ...additionalData,
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
      } else if (action === 'delete') {
        setActionNotice({ type: 'success', message: 'Cancelled shipment deleted successfully.' });
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
      canViewAnalytics ? fetch('/api/stock/dashboard') : Promise.resolve(null),
      fetch('/api/stock/change-requests', { cache: 'no-store' }),
    ]);

    const refreshJson = await refreshResponse.json();
    const analyticsJson = analyticsResponse ? await analyticsResponse.json() : null;
    const changeRequestJson = await changeRequestResponse.json();

    if (!refreshResponse.ok) {
      throw new Error(refreshJson.error || 'Failed to refresh dashboard');
    }

    if (analyticsResponse && !analyticsResponse.ok) {
      throw new Error(analyticsJson?.error || 'Failed to refresh analytics');
    }

    if (!changeRequestResponse.ok) {
      throw new Error(changeRequestJson.error || 'Failed to refresh change requests');
    }

    setData(refreshJson);
    if (analyticsJson) setAnalyticsData(analyticsJson);
    setChangeRequests(changeRequestJson.requests || []);
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function handleEditArrival(row) {
    setArrivalNotice({ type: 'info', message: 'Loading purchase details…' });
    setArrivalSheetOpen(true);
    setEditingArrivalId(row.id);
    try {
      const response = await fetch(`/api/stock/inbound-shipments/${row.id}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load purchase details');
      const s = json.shipment;
      const items = json.items || [];
      const isBagPurchase = items.some((i) => i.unit_of_measure === 'bag');
      if (isBagPurchase) {
        setArrivalSheetOpen(false);
        setEditingArrivalId(null);
        setArrivalNotice(null);
        setEditingBagArrivalId(row.id);
        return;
      }
      arrivalForm.reset({
        shipmentNumber: s.shipment_number || '',
        supplierName: s.supplier_name || '',
        truckLicensePlate: s.truck_license_plate || s.truck_license_plate_snapshot || '',
        driverName: s.driver_name || s.driver_name_snapshot || '',
        invoiceNumber: s.invoice_number || '',
        invoiceDate: s.invoice_date ? s.invoice_date.split('T')[0] : '',
        originCity: s.origin_city || '',
        destinationWarehouseName: s.destination_warehouse_name || '',
        paymentStatus: s.payment_status || 'unpaid',
        paidAmount: s.paid_amount ?? '',
        paymentDate: s.payment_date ? s.payment_date.split('T')[0] : '',
        paymentReference: s.payment_reference || '',
        paymentMode: s.payment_mode || '',
        transporterName: s.transporter_name || '',
        transportCost: s.delivery_cost ?? '',
        laborCost: s.unloading_labour_cost ?? '',
        handlingCostPercent: s.handling_cost_percent != null ? String(s.handling_cost_percent) : '1.0',
        fuelCostPercent: s.fuel_cost_percent != null ? String(s.fuel_cost_percent) : '5.0',
        gstPercent: s.gst_percent != null ? String(s.gst_percent) : '18.0',
        freightWeightKg: s.freight_weight_kg != null ? String(s.freight_weight_kg) : '',
        notes: s.notes || '',
        items: items.length > 0 ? items.map((item) => ({
          itemId: String(item.item_id),
          itemName: item.item_name || '',
          brandName: item.brand_name || '',
          divisionName: item.division_name || '',
          finish: item.finish || '',
          grade: item.grade || '',
          sizeLabel: item.size_label || '',
          sizeWidthMm: '',
          sizeLengthMm: '',
          sizeUnit: item.size_unit || 'mm',
          hsnCode: item.hsn_code || '',
          thicknessMm: item.thickness_mm != null ? String(item.thickness_mm) : '',
          piecesPerBox: item.pieces_per_box != null ? String(item.pieces_per_box) : '',
          reorderLevel: '',
          description: item.description || '',
          orderedBoxes: item.ordered_qty != null ? String(item.ordered_qty) : '',
          wholeQty: String(item.received_whole_qty ?? 0),
          brokenQty: String(item.received_broken_qty ?? 0),
          costPerSqm: item.cost_per_sqm != null ? String(item.cost_per_sqm) : '',
          qtySqm: item.qty_sqm != null ? String(item.qty_sqm) : '',
          notes: item.notes || '',
        })) : [createArrivalItemRow()],
      });
      setArrivalNotice(null);
    } catch (err) {
      setArrivalNotice({ type: 'error', message: err.message });
    }
  }

  useEffect(() => {
    if (!editingBagArrivalId) return;
    setArrivalSheetOpen(false);
    setBagArrivalNotice({ type: 'info', message: 'Loading purchase details…' });
    fetch(`/api/stock/inbound-shipments/${editingBagArrivalId}`)
      .then((r) => r.json())
      .then((json) => {
        const s = json.shipment;
        const items = json.items || [];
        bagArrivalForm.reset({
          supplierName: s.supplier_name || '',
          truckLicensePlate: s.truck_license_plate || s.truck_license_plate_snapshot || '',
          driverName: s.driver_name || s.driver_name_snapshot || '',
          invoiceNumber: s.invoice_number || '',
          invoiceDate: s.invoice_date ? s.invoice_date.split('T')[0] : '',
          originCity: s.origin_city || '',
          destinationWarehouseName: s.destination_warehouse_name || '',
          paymentStatus: s.payment_status || 'unpaid',
          paidAmount: s.paid_amount ?? '',
          paymentDate: s.payment_date ? s.payment_date.split('T')[0] : '',
          paymentReference: s.payment_reference || '',
          paymentMode: s.payment_mode || '',
          transporterName: s.transporter_name || '',
          transportCost: s.delivery_cost ?? '',
          laborCost: s.unloading_labour_cost ?? '',
          handlingCostPercent: s.handling_cost_percent != null ? String(s.handling_cost_percent) : '1.0',
          fuelCostPercent: s.fuel_cost_percent != null ? String(s.fuel_cost_percent) : '5.0',
          gstPercent: s.gst_percent != null ? String(s.gst_percent) : '18.0',
          freightWeightKg: s.freight_weight_kg != null ? String(s.freight_weight_kg) : '',
          notes: s.notes || '',
          items: items.length > 0 ? items.map((item) => ({
            itemCategory: 'bag',
            itemId: String(item.item_id),
            itemName: item.item_name || '',
            brandName: item.brand_name || '',
            typeName: item.type_name || '',
            qtyBags: item.ordered_qty != null ? String(item.ordered_qty) : '',
            weightPerUnitKg: item.weight_per_unit_kg != null ? String(item.weight_per_unit_kg) : '',
            ratePerBag: item.cost_per_bag != null ? String(item.cost_per_bag) : '',
            hsnCode: item.hsn_code || '',
            description: item.description || '',
            notes: item.notes || '',
          })) : [createBagArrivalItemRow()],
        });
        setBagArrivalNotice(null);
      })
      .catch((err) => setBagArrivalNotice({ type: 'error', message: err.message }));
  }, [editingBagArrivalId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBagArrivalSubmit(values) {
    if (!editingBagArrivalId) return;
    setBagArrivalSubmitting(true);
    try {
      const items = (values.items || []).map((item) => ({
        itemId: item.itemId ? Number(item.itemId) : undefined,
        itemCategory: 'bag',
        qtyBags: toNumber(item.qtyBags),
        weightPerUnitKg: item.weightPerUnitKg === '' ? null : toNumber(item.weightPerUnitKg),
        ratePerBag: toNumber(item.ratePerBag),
        itemName: trimText(item.itemName),
        brandName: trimText(item.brandName),
        typeName: trimText(item.typeName),
        hsnCode: trimText(item.hsnCode),
        description: trimText(item.description),
        notes: trimText(item.notes),
      })).filter((item) => item.itemId || item.qtyBags > 0);
      const payload = {
        ...values,
        items,
        action: 'update',
        transportCost: values.transportCost === '' ? 0 : toNumber(values.transportCost),
        laborCost: values.laborCost === '' ? 0 : toNumber(values.laborCost),
        handlingCostPercent: values.handlingCostPercent === '' ? 1.0 : toNumber(values.handlingCostPercent),
        fuelCostPercent: values.fuelCostPercent === '' ? 5.0 : toNumber(values.fuelCostPercent),
        gstPercent: values.gstPercent === '' ? 18.0 : toNumber(values.gstPercent),
        freightWeightKg: values.freightWeightKg === '' ? null : toNumber(values.freightWeightKg),
      };
      const response = await fetch(`/api/stock/inbound-shipments/${editingBagArrivalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update bag purchase');
      setBagArrivalNotice({ type: 'success', message: 'Bag purchase updated.' });
      bagArrivalForm.reset(createInitialBagArrivalDraft());
      setTimeout(() => setEditingBagArrivalId(null), 1200);
    } catch (err) {
      setBagArrivalNotice({ type: 'error', message: err.message });
    } finally {
      setBagArrivalSubmitting(false);
    }
  }

  async function handleArrivalSubmit(values) {
    if (!editingArrivalId) return;
    setArrivalSubmitting(true);
    try {
      const items = (values.items || [])
        .map((item) => ({
          itemId: item.itemId ? Number(item.itemId) : undefined,
          itemName: trimText(item.itemName),
          brandName: trimText(item.brandName),
          sizeLabel: trimText(item.sizeLabel),
          hsnCode: trimText(item.hsnCode),
          wholeQty: toNumber(item.wholeQty),
          brokenQty: toNumber(item.brokenQty),
          orderedBoxes: item.orderedBoxes || undefined,
          costPerSqm: item.costPerSqm ?? undefined,
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.wholeQty > 0 || item.brokenQty > 0);

      const response = await fetch(`/api/stock/inbound-shipments/${editingArrivalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          shipmentNumber: trimText(values.shipmentNumber) || undefined,
          supplierName: trimText(values.supplierName) || undefined,
          truckLicensePlate: trimText(values.truckLicensePlate) || undefined,
          driverName: trimText(values.driverName) || undefined,
          invoiceNumber: trimText(values.invoiceNumber) || undefined,
          invoiceDate: values.invoiceDate || undefined,
          originCity: trimText(values.originCity) || undefined,
          destinationWarehouseName: trimText(values.destinationWarehouseName) || undefined,
          paymentStatus: trimText(values.paymentStatus) || 'unpaid',
          paidAmount: values.paidAmount === '' ? undefined : toNumber(values.paidAmount),
          paymentDate: values.paymentDate || undefined,
          paymentReference: trimText(values.paymentReference) || undefined,
          paymentMode: trimText(values.paymentMode) || undefined,
          transporterName: trimText(values.transporterName) || undefined,
          deliveryCost: toNumber(values.transportCost),
          unloadingLabourCost: toNumber(values.laborCost),
          handlingCostPercent: values.handlingCostPercent === '' ? undefined : toNumber(values.handlingCostPercent),
          fuelCostPercent: values.fuelCostPercent === '' ? undefined : toNumber(values.fuelCostPercent),
          gstPercent: values.gstPercent === '' ? undefined : toNumber(values.gstPercent),
          freightWeightKg: values.freightWeightKg === '' ? undefined : toNumber(values.freightWeightKg),
          notes: trimText(values.notes) || undefined,
          items,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update purchase');
      arrivalForm.reset(createInitialArrivalDraft());
      resetArrivalAttachments();
      setArrivalSheetOpen(false);
      setEditingArrivalId(null);
      setActionNotice({ type: 'success', message: `Purchase ${json.shipment?.shipment_number || ''} updated.` });
      await refreshDashboard();
    } catch (err) {
      setArrivalNotice({ type: 'error', message: err.message });
    } finally {
      setArrivalSubmitting(false);
    }
  }

  async function handleEditDispatch(row) {
    setDispatchNotice({ type: 'info', message: 'Loading dispatch details…' });
    setDispatchSheetOpen(true);
    setEditingDispatchId(row.id);
    try {
      const response = await fetch(`/api/stock/outbound-shipments/${row.id}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load dispatch details');
      const shipment = json.shipment;
      const items = json.items || [];
      dispatchForm.reset({
        customerName: shipment.customer_name || '',
        customerPhoneNumber: shipment.customer_phone_number || '',
        truckLicensePlate: shipment.truck_license_plate_snapshot || shipment.truck_number_snapshot || '',
        driverName: shipment.driver_name_snapshot || '',
        invoiceNumber: shipment.invoice_number || '',
        salespersonName: shipment.salesperson_name || '',
        salespersonUserId: shipment.salesperson_user_id != null ? String(shipment.salesperson_user_id) : '',
        dispatchDate: (shipment.dispatch_date || shipment.created_at) ? (() => {
          const d = new Date(shipment.dispatch_date || shipment.created_at);
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })() : '',
        transportCost: shipment.transport_cost ?? '',
        laborCost: shipment.loading_labour_cost ?? '',
        notes: shipment.notes || '',
        items: items.map((item) => {
          const isBag = item.unit_of_measure === 'bag';
          return {
            itemId: String(item.item_id),
            itemLabel: item.sku ? `${item.sku} - ${item.item_name}` : (item.item_name || ''),
            itemCategory: isBag ? 'bag' : 'tile',
            loadedWholeQty: isBag ? '' : String(item.loaded_whole_qty ?? 0),
            qtyBags: isBag ? String(item.loaded_whole_qty ?? 0) : '',
            sellUnit: isBag ? 'bag' : (item.sell_unit || 'box'),
            ratePerUnit: item.rate_per_unit != null
              ? String(item.rate_per_unit)
              : (item.rate_per_box != null ? String(item.rate_per_box) : (item.rate_per_bag != null ? String(item.rate_per_bag) : '')),
            returnWholeQty: isBag ? '' : (item.returned_whole_qty != null ? String(item.returned_whole_qty) : ''),
            returnBrokenQty: isBag ? '' : (item.returned_broken_qty != null ? String(item.returned_broken_qty) : ''),
            returnQtyBags: isBag ? (item.returned_whole_qty != null ? String(item.returned_whole_qty) : '') : '',
            notes: item.notes || '',
          };
        }),
      });
      setDispatchNotice(null);
    } catch (err) {
      setDispatchNotice({ type: 'error', message: err.message });
    }
  }

  async function handleDispatchSubmit(values) {
    if (!editingDispatchId) return;
    setDispatchSubmitting(true);
    try {
      const items = (values.items || [])
        .map((item) => {
          const isBag = item.itemCategory === 'bag';
          return {
            itemId: Number(item.itemId),
            loadedWholeQty: isBag ? toNumber(item.qtyBags) : toNumber(item.loadedWholeQty),
            loadedBrokenQty: 0,
            sellUnit: isBag ? 'bag' : (item.sellUnit || 'box'),
            ratePerUnit: item.ratePerUnit == null || item.ratePerUnit === '' ? null : toNumber(item.ratePerUnit),
            returnWholeQty: isBag
              ? (item.returnQtyBags === '' ? null : toNumber(item.returnQtyBags))
              : (item.returnWholeQty === '' ? null : toNumber(item.returnWholeQty)),
            returnBrokenQty: isBag ? 0 : (item.returnBrokenQty === '' ? null : toNumber(item.returnBrokenQty)),
            notes: trimText(item.notes),
          };
        })
        .filter((item) => item.itemId);

      const response = await fetch(`/api/stock/outbound-shipments/${editingDispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          customerName: trimText(values.customerName) || undefined,
          customerPhoneNumber: trimText(values.customerPhoneNumber) || undefined,
          truckLicensePlate: trimText(values.truckLicensePlate) || undefined,
          driverName: trimText(values.driverName) || undefined,
          invoiceNumber: trimText(values.invoiceNumber) || undefined,
          salespersonName: trimText(values.salespersonName) || undefined,
          salespersonUserId: values.salespersonUserId ? Number(values.salespersonUserId) : undefined,
          dispatchDate: values.dispatchDate || undefined,
          transportCost: toNumber(values.transportCost),
          loadingLabourCost: toNumber(values.laborCost),
          notes: trimText(values.notes) || undefined,
          items,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update dispatch');
      dispatchForm.reset(createInitialDispatchDraft());
      resetDispatchAttachments();
      setDispatchSheetOpen(false);
      setEditingDispatchId(null);
      setActionNotice({ type: 'success', message: `Dispatch ${json.shipment?.shipment_number || ''} updated.` });
      await refreshDashboard();
    } catch (err) {
      setDispatchNotice({ type: 'error', message: err.message });
    } finally {
      setDispatchSubmitting(false);
    }
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
        divisions: Array.isArray(updatedUser.division_names) && updatedUser.division_names.length ? updatedUser.division_names : ['Adhesive'],
        status: updatedUser.status || (updatedUser.is_active ? 'active' : 'inactive'),
        canManageUsers: Boolean(updatedUser.can_manage_users),
        canApproveChanges: Boolean(updatedUser.can_approve_changes),
        canViewDashboard: Boolean(updatedUser.can_view_dashboard),
        salary: updatedUser.salary != null ? String(updatedUser.salary) : '',
        monthlySalesGoal: updatedUser.monthly_sales_goal != null ? String(updatedUser.monthly_sales_goal) : '',
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

      createUserForm.reset({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', divisions: ['Adhesive'], department: '', status: 'active' });
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

  const arrivalPagination = paginateRows(data?.pendingArrivals || [], arrivalPage, pageSize);
  const dispatchPagination = paginateRows(data?.pendingDispatches || [], dispatchPage, pageSize);
  const cancelledArrivalPagination = paginateRows(data?.cancelledArrivals || [], cancelledArrivalPage, pageSize);
  const changeRequestPagination = paginateRows(changeRequests || [], changeRequestPage, pageSize);
  const userPagination = paginateRows(data?.users || [], userPage, pageSize);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, pageSize);

  useEffect(() => {
    if (previewState.kind !== 'user' || !previewState.record) {
      return;
    }

    previewUserForm.reset({
      role: previewState.record.role || 'stock_maintainer',
      divisions: Array.isArray(previewState.record.division_names) && previewState.record.division_names.length ? previewState.record.division_names : ['Adhesive'],
      status: previewState.record.status || (previewState.record.is_active ? 'active' : 'inactive'),
      canManageUsers: Boolean(previewState.record.can_manage_users),
      canApproveChanges: Boolean(previewState.record.can_approve_changes),
      canViewDashboard: Boolean(previewState.record.can_view_dashboard),
      salary: previewState.record.salary != null ? String(previewState.record.salary) : '',
      monthlySalesGoal: previewState.record.monthly_sales_goal != null ? String(previewState.record.monthly_sales_goal) : '',
    });
  }, [previewState.kind, previewState.record, previewState.open, previewUserForm]);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setCancelledArrivalPage((current) => Math.min(current, cancelledArrivalPagination.pageCount));
  }, [cancelledArrivalPagination.pageCount]);

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
      label: t('teamAccounts'),
      value: totalUsers,
      href: '/stock?view=items',
      icon: UsersRound,
      trend: activeUsers - pendingUsers,
      iconAccent: 'bg-[#1A1A54]/10 text-[#1A1A54]',
      subMetrics: [
        { label: t('active'), value: activeUsers },
        { label: t('pending'), value: pendingUsers },
      ],
    },
    {
      label: t('approvalQueue'),
      value: pendingReviews,
      href: '#approval-queue',
      icon: ShieldAlert,
      trend: pendingReviews > 0 ? -pendingReviews : 1,
      iconAccent: 'bg-[#F59E0B]/15 text-[#E07A00]',
      subMetrics: [
        { label: language === 'hi' ? 'आवक' : 'Inbound', value: Number(analyticsData?.summary?.pending_inbound_reviews || 0) },
        { label: language === 'hi' ? 'जावक' : 'Outbound', value: Number(analyticsData?.summary?.pending_outbound_reviews || 0) },
      ],
    },
    {
      label: t('storedUnits'),
      value: Number(analyticsData?.summary?.total_whole_stored || 0) + Number(analyticsData?.summary?.total_broken_stored || 0),
      href: '/stock?view=items',
      icon: PackageSearch,
      trend: Number(analyticsData?.summary?.total_whole_stored || 0) - Number(analyticsData?.summary?.total_broken_stored || 0),
      iconAccent: 'bg-[#E07A00]/10 text-[#E07A00]',
      subMetrics: [
        { label: t('whole'), value: Number(analyticsData?.summary?.total_whole_stored || 0) },
        { label: t('broken'), value: Number(analyticsData?.summary?.total_broken_stored || 0) },
      ],
    },
    {
      label: t('netMovement'),
      value: totalIncoming - totalOutgoing,
      href: '/stock?view=arrivals',
      icon: ArrowRightLeft,
      trend: totalIncoming - totalOutgoing,
      iconAccent: 'bg-[#1A1A54]/10 text-[#1A1A54]',
      subMetrics: [
        { label: language === 'hi' ? 'आवक' : 'Incoming', value: totalIncoming },
        { label: language === 'hi' ? 'जावक' : 'Outgoing', value: totalOutgoing },
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
    ? `${language === 'hi' ? 'उच्च मात्रा वाला दिन' : 'High-volume day detected on'} ${new Date(movementPeak.date).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} ${language === 'hi' ? 'को' : 'with'} ${movementPeak.total} ${t('units')} ${language === 'hi' ? 'के साथ पाया गया।' : 'moved.'}`
    : language === 'hi' ? 'उच्च मात्रा वाले दिन की पहचान करने के लिए पर्याप्त गतिविधि इतिहास की प्रतीक्षा की जा रही है।' : 'Waiting for enough movement history to identify a high-volume day.';

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
        title: t('pendingApprovalsAction'),
        message: `${pendingReviews} ${language === 'hi' ? 'शिपमेंट समीक्षा कतार में प्रतीक्षा कर रहे हैं।' : `shipment${pendingReviews > 1 ? 's' : ''} waiting in review queue.`}`,
        href: '#approval-queue',
      }
      : null,
    lowStockCount > 0
      ? {
        level: 'warning',
        title: t('lowStockRisk'),
        message: `${lowStockCount} ${language === 'hi' ? 'आइटम पुन: क्रय स्तर पर या उससे नीचे हैं।' : `item${lowStockCount > 1 ? 's are' : ' is'} at or below reorder level.`}`,
        href: '/stock?view=items',
      }
      : null,
    brokenRatio >= 0.08
      ? {
        level: 'warning',
        title: t('brokenStockRatioHigh'),
        message: `${(brokenRatio * 100).toFixed(1)}% ${language === 'hi' ? 'स्टॉक को टूटा हुआ चिह्नित किया गया है। क्षति स्रोतों की जाँच करें।' : 'of stock is marked broken. Investigate damage sources.'}`,
        href: '/stock?view=items',
      }
      : null,
    latestTrendPoint && latestTrendPoint.outbound > latestTrendPoint.inbound
      ? {
        level: 'info',
        title: t('outflowAboveInflow'),
        message: `${language === 'hi' ? 'आज जावक' : 'Outgoing'} ${latestTrendPoint.outbound} ${language === 'hi' ? 'बनाम आवक' : 'vs incoming'} ${latestTrendPoint.inbound} ${language === 'hi' ? 'है।' : 'on latest trend day.'}`,
        href: '/stock?view=dispatches',
      }
      : null,
  ].filter(Boolean);

  const recentActivity = [
    ...(analyticsData?.recentArrivals || []).map((shipment) => ({
      id: `arrival-${shipment.id}`,
      kind: 'arrival',
      title: `${language === 'hi' ? 'आगमन' : 'Arrival'} ${shipment.shipment_number}`,
      subtitle: `${Number(shipment.total_whole_qty || 0)} whole + ${Number(shipment.total_broken_qty || 0)} broken`,
      by: shipment.generated_by || '—',
      at: shipment.arrival_date || shipment.created_at,
      status: shipment.approval_status || shipment.status,
      href: `/stock?view=arrivals&entityType=inbound_shipment&entityId=${shipment.id}`,
    })),
    ...(analyticsData?.recentDispatches || []).map((shipment) => ({
      id: `dispatch-${shipment.id}`,
      kind: 'dispatch',
      title: `${language === 'hi' ? 'डिस्पैच' : 'Dispatch'} ${shipment.shipment_number}`,
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
      <div className="space-y-12 p-4 sm:p-6 lg:p-12">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
          <div className="h-16 sm:h-20 w-full sm:w-3/4 max-w-lg bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl sm:rounded-[2.5rem]" />
        </div>
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`hero-skeleton-${index}`} className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-40 sm:h-48" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-12 lg:gap-16">
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-96" />
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-96" />
        </div>
      </div>
    );
  }
  if (!data && error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-12 space-y-12 lg:space-y-20 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
        <div className="space-y-4 max-w-4xl">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
            <span className="text-slate-400">Stock</span>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">{t('adminTitle')}</span>

          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              <><span className="text-brand-primary"> {t('adminTitle').split(' ')[0]}</span><br className="sm:hidden" /> {t('adminTitle').split(' ')[1] || 'Hub'}</>
            </h1>
            <div className="flex items-center self-start sm:self-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-sm whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('operationalCore')}
            </div>
          </div>
          <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            {t('governanceIdentified')} <span className="font-black text-slate-900 dark:text-white underline decoration-brand-primary/30 decoration-8 underline-offset-4">{pendingReviews} {t('pendingArrivals')}</span> {t('requiringOversight')} <span className="font-black text-emerald-600">{t('activeStatus')}</span>.
          </p>
        </div>

        <div className="flex flex-row justify-between sm:flex-row items-stretch sm:items-center gap-4">
            <button
              onClick={() => setShowInsights(!showInsights)}
              className={`flex items-center justify-center p-4 rounded-[1.5rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 hover:shadow-xl transition-all active:scale-95 group ${showInsights ? 'text-brand-primary' : 'text-slate-400'}`}
              title={t('toggleInsights')}
            >
              <Activity className="h-6 w-6" />
            </button>
            <button
              onClick={() => refreshDashboard()}
              className="flex items-center justify-center gap-3 px-8 py-4 rounded-[1.5rem] bg-brand-primary text-white text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-lg active:scale-95 hover:shadow-brand-primary/20"
            >
              <FileText className="h-5 w-5" />
              {t('syncLogs')}
            </button>
        </div>
      </header>

      {actionNotice ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${actionNotice.type === 'success'
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

      {canViewAnalytics && <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
        {summaryTiles.map((m, i) => {
          const Icon = m.icon;
          const isPositive = m.trend >= 0;
          return (
            <div className="glass-panel rounded-[2.5rem] p-7 lg:p-8 relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl group" key={m.label}>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <div className={`w-16 h-16 flex items-center justify-center rounded-[1.25rem] border ${m.iconAccent.split(' ')[0]} bg-opacity-20 border-opacity-20 shadow-sm transition-transform duration-500 group-hover:scale-110`}>
                    <Icon className={`h-8 w-8 ${m.iconAccent.split(' ')[1]}`} />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('systemMetric')}</span>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full mt-2 ${isPositive ? 'text-emerald-600 bg-emerald-500/10' : 'text-rose-600 bg-rose-500/10'}`}>
                      {isPositive ? '+' : ''}{m.trend} {t('units')}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] font-black uppercase tracking-[0.15em]">{m.label}</div>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-sans tracking-tighter text-slate-900 dark:text-white leading-none">{formatCompactNumber(m.value)}</div>

                  {showInsights && (
                    <div className="mt-6 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 animate-scale-in">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-loose mb-2">{t('deepLogic')}</p>
                      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                        {i === 0 ? t('insightSummary') :
                          i === 1 ? t('insightQueue') :
                            i === 2 ? t('insightSnapshot') :
                              t('insightFlow')}
                      </p>
                      <div className="mt-3 flex gap-4 border-t border-slate-100 dark:border-slate-800 pt-2">
                        {m.subMetrics.map((sm) => (
                          <div key={sm.label} className="flex flex-col">
                            <span className="text-[8px] uppercase tracking-widest text-slate-400 font-black">{sm.label}</span>
                            <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">{formatCompactNumber(sm.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="absolute -right-6 -bottom-6 w-40 h-40 opacity-[0.04] transition-all duration-700 pointer-events-none group-hover:scale-110 group-hover:opacity-[0.08]">
                <Icon className="w-full h-full" />
              </div>
            </div>
          );
        })}
      </div>

      <section className="space-y-12">
        <div className="flex items-center gap-6">
          <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400 whitespace-nowrap">I. {t('operationalOverview')}</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-12">
          <AnalyticsCard
            title={t('operationalAlerts')}
            subtitle={t('criticalEventsSubtitle')}
            insight={t('criticalEventsInsight')}
            showInsight={showInsights}
            className="lg:col-span-2"
            topRight={
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                {operationalAlerts.length || 0} {t('active')}
              </span>
            }
          >
            {operationalAlerts.length ? (
              <div className="space-y-4">
                {operationalAlerts.map((alert) => (
                  <Link
                    key={alert.title}
                    href={alert.href}
                    className={`block rounded-2xl border px-5 py-4 transition-all hover:scale-[1.02] hover:shadow-lg ${alert.level === 'critical'
                      ? 'border-rose-200 bg-rose-50/50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/5 dark:text-rose-400'
                      : alert.level === 'warning'
                        ? 'border-amber-200 bg-amber-50/50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-400'
                        : 'border-sky-200 bg-sky-50/50 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/5 dark:text-sky-400'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black tracking-tight">{alert.title}</p>
                      <span className={`w-2 h-2 rounded-full ${alert.level === 'critical' ? 'bg-rose-500 animate-pulse' : 'bg-current opacity-60'}`} />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed opacity-75 font-bold">{alert.message}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-emerald-200 bg-emerald-50/30 px-4 py-8 text-center">
                <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.2em] italic">All systems clear</p>
              </div>
            )}
          </AnalyticsCard>

          <AnalyticsCard
            title={t('recentActivity')}
            subtitle={t('adminActivitySubtitle')}
            insight={t('adminActivitySubtitle')}
            showInsight={showInsights}
            className="lg:col-span-3"
          >
            {recentActivity.length ? (
              <div className="space-y-2">
                {recentActivity.map((event) => (
                  <Link
                    key={event.id}
                    href={event.href}
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-transparent hover:border-slate-100 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/40 transition-all group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white group-hover:text-brand-primary transition-colors tracking-tight">{event.title}</p>
                      <p className="truncate text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 opacity-70">{event.subtitle}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                        <UsersRound className="h-3 w-3" /> {event.by} <span className="opacity-30">•</span> <Clock className="h-3 w-3" /> {formatDateTime(event.at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest shadow-sm ${event.kind === 'arrival' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-brand-primary/10 text-brand-primary'}`}>
                        {event.status || event.kind}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-brand-primary transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-slate-200 px-4 py-8 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">No recent log entries</p>
              </div>
            )}
          </AnalyticsCard>
        </div>
      </section>
      </>}

      <div className="rounded-[1.75rem] border border-slate-200/60 bg-slate-100/30 p-1.5 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/30">
        <div className="flex items-center gap-1">
          {[{ id: 'approvals', label: t('approvals') }, { id: 'changes', label: t('changes') }, { id: 'users', label: t('users') }].map((tab) => {
            const isActive = mobileSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileSection(tab.id)}
                className={`flex-1 px-3 sm:px-6 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-2xl transition-all duration-500 ${isActive
                  ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-xl scale-[1.02] orange-glow'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <section id="approval-queue" className={`space-y-12 ${mobileSection === 'approvals' ? '' : 'hidden'}`}>
          <div className="flex items-center gap-6">
            <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400 whitespace-nowrap">II. {t('approvalQueue')}</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 lg:gap-12">
            <AnalyticsCard
              title={t('pendingArrivals')}
              subtitle={t('inboundQueueSubtitle')}
              insight={t('inboundQueueInsight')}
              showInsight={showInsights}
            >
              <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
                    <tr className="border-b border-slate-200/60 dark:border-white/5">
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('shipmentNo')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('maintainer')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('boxesQty')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 text-right">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {arrivalPagination.rows.map((item) => (
                      <tr
                        key={item.id}
                        className="group cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70"
                        onClick={() => openShipmentPreview('arrival', item)}
                      >
                        <td className="px-4 py-3 font-black text-brand-primary text-xs">
                          <span className="bg-brand-primary/5 px-2 py-1 rounded-md border border-brand-primary/20">{item.shipment_number}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{item.maintainer_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-black text-xs font-sans">{item.total_whole_qty} Units</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditArrival(item);
                              }}
                              className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white transition-all"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShipmentAction('inbound-shipments', item.id, 'approve');
                              }}
                              disabled={actionLoading === `inbound-shipments-${item.id}-approve`}
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                              title="Approve"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShipmentAction('inbound-shipments', item.id, 'reject', 'Rejected from hub');
                              }}
                              disabled={actionLoading === `inbound-shipments-${item.id}-reject`}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                              title="Reject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {arrivalPagination.total === 0 && (
                      <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic">{t('noPending')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards for Arrivals */}
              <div className="md:hidden space-y-4">
                {arrivalPagination.rows.map((item) => (
                  <div
                    key={`arrival-mob-${item.id}`}
                    onClick={() => openShipmentPreview('arrival', item)}
                    className="p-5 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-slate-900/10 space-y-4 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('shipmentNo')}</p>
                        <p className="text-sm font-black text-brand-primary">{item.shipment_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('boxesQty')}</p>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{item.total_whole_qty} Units</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('maintainer')}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.maintainer_name || '-'}</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditArrival(item);
                        }}
                        className="h-10 px-4 rounded-xl bg-blue-500/10 text-blue-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleShipmentAction('inbound-shipments', item.id, 'approve');
                        }}
                        disabled={actionLoading === `inbound-shipments-${item.id}-approve`}
                        className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                      >
                        <ShieldCheck className="h-4 w-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleShipmentAction('inbound-shipments', item.id, 'reject', 'Rejected from hub');
                        }}
                        disabled={actionLoading === `inbound-shipments-${item.id}-reject`}
                        className="h-10 px-4 flex items-center gap-2 rounded-xl bg-rose-500/10 text-rose-600 text-[10px] font-black uppercase tracking-widest"
                      >
                        <X className="h-4 w-4" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
                {arrivalPagination.total === 0 && (
                  <div className="p-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">{t('noPending')}</div>
                )}
              </div>
              <PaginationControls
                page={arrivalPagination.page}
                pageCount={arrivalPagination.pageCount}
                total={arrivalPagination.total}
                pageSize={pageSize}
                onPageChange={setArrivalPage}
                onPageSizeChange={setPageSize}
                labels={{ showing: t('paginationShowing'), of: t('paginationOf'), previous: t('paginationPrevious'), next: t('paginationNext'), page: t('paginationPage') }}
                className="mt-6 border-t pt-4 border-slate-100 dark:border-slate-800"
              />
            </AnalyticsCard>

            {/* Cancelled Arrivals Section */}
            {cancelledArrivalPagination.total > 0 && (
              <AnalyticsCard
                title="Cancelled Inbound Entries"
                subtitle="Manage and delete cancelled inbound shipments"
              >
                <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
                      <tr className="border-b border-slate-200/60 dark:border-white/5">
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('shipmentNo')}</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('maintainer')}</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('boxesQty')}</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 text-right">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {cancelledArrivalPagination.rows.map((item) => (
                        <tr
                          key={item.id}
                          className="group cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70"
                          onClick={() => openShipmentPreview('arrival', item)}
                        >
                          <td className="px-4 py-3 font-black text-amber-600 dark:text-amber-400 text-xs">
                            <span className="bg-amber-500/5 px-2 py-1 rounded-md border border-amber-500/20">{item.shipment_number}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{item.maintainer_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-black text-xs font-sans">{item.total_whole_qty} Units</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShipmentAction('inbound-shipments', item.id, 'delete', null, { status: 'cancelled' });
                              }}
                              disabled={actionLoading === `inbound-shipments-${item.id}-delete`}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                              title="Delete"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards for Cancelled Arrivals */}
                <div className="md:hidden space-y-4">
                  {cancelledArrivalPagination.rows.map((item) => (
                    <div
                      key={`cancelled-mob-${item.id}`}
                      onClick={() => openShipmentPreview('arrival', item)}
                      className="p-5 rounded-2xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/10 space-y-4 active:scale-[0.98] transition-transform"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('shipmentNo')}</p>
                          <p className="text-sm font-black text-amber-600 dark:text-amber-400">{item.shipment_number}</p>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">Cancelled</Badge>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('maintainer')}</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.maintainer_name || '-'}</p>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('inbound-shipments', item.id, 'delete', null, { status: 'cancelled' });
                          }}
                          disabled={actionLoading === `inbound-shipments-${item.id}-delete`}
                          className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20"
                        >
                          <X className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationControls
                  page={cancelledArrivalPagination.page}
                  pageCount={cancelledArrivalPagination.pageCount}
                  total={cancelledArrivalPagination.total}
                  pageSize={pageSize}
                  onPageChange={setCancelledArrivalPage}
                  onPageSizeChange={setPageSize}
                  labels={{ showing: t('paginationShowing'), of: t('paginationOf'), previous: t('paginationPrevious'), next: t('paginationNext'), page: t('paginationPage') }}
                  className="mt-6 border-t pt-4 border-slate-100 dark:border-slate-800"
                />
              </AnalyticsCard>
            )}

            <AnalyticsCard
              title={t('pendingDispatches')}
              subtitle={t('outboundQueueSubtitle')}
              insight={t('outboundQueueInsight')}
              showInsight={showInsights}
            >
              <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
                    <tr className="border-b border-slate-200/60 dark:border-white/5">
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('dispatchNo')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('driver')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('boxesQty')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 text-right">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {dispatchPagination.rows.map((item) => (
                      <tr
                        key={item.id}
                        className="group cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70"
                        onClick={() => openShipmentPreview('dispatch', item)}
                      >
                        <td className="px-4 py-3 font-black text-brand-secondary text-xs">
                          <span className="bg-brand-secondary/5 px-2 py-1 rounded-md border border-brand-secondary/20">{item.shipment_number}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{item.driver_name}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-black text-xs font-sans">{item.total_whole_qty} Units</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditDispatch(item);
                              }}
                              className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white transition-all"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShipmentAction('outbound-shipments', item.id, 'approve');
                              }}
                              disabled={actionLoading === `outbound-shipments-${item.id}-approve`}
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                              title="Approve"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShipmentAction('outbound-shipments', item.id, 'reject', 'Rejected from hub');
                              }}
                              disabled={actionLoading === `outbound-shipments-${item.id}-reject`}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                              title="Reject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {dispatchPagination.total === 0 && (
                      <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic">{t('noPending')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards for Dispatches */}
              <div className="md:hidden space-y-4">
                {dispatchPagination.rows.map((item) => (
                  <div
                    key={`dispatch-mob-${item.id}`}
                    onClick={() => openShipmentPreview('dispatch', item)}
                    className="p-5 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-slate-900/10 space-y-4 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('dispatchNo')}</p>
                        <p className="text-sm font-black text-brand-secondary">{item.shipment_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('boxesQty')}</p>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{item.total_whole_qty} Units</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('driver')}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.driver_name || '-'}</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditDispatch(item);
                        }}
                        className="h-10 px-4 rounded-xl bg-blue-500/10 text-blue-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleShipmentAction('outbound-shipments', item.id, 'approve');
                        }}
                        disabled={actionLoading === `outbound-shipments-${item.id}-approve`}
                        className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                      >
                        <ShieldCheck className="h-4 w-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleShipmentAction('outbound-shipments', item.id, 'reject', 'Rejected from hub');
                        }}
                        disabled={actionLoading === `outbound-shipments-${item.id}-reject`}
                        className="h-10 px-4 flex items-center gap-2 rounded-xl bg-rose-500/10 text-rose-600 text-[10px] font-black uppercase tracking-widest"
                      >
                        <X className="h-4 w-4" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
                {dispatchPagination.total === 0 && (
                  <div className="p-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">{t('noPending')}</div>
                )}
              </div>
              <PaginationControls
                page={dispatchPagination.page}
                pageCount={dispatchPagination.pageCount}
                total={dispatchPagination.total}
                pageSize={pageSize}
                onPageChange={setDispatchPage}
                onPageSizeChange={setPageSize}
                labels={{ showing: t('paginationShowing'), of: t('paginationOf'), previous: t('paginationPrevious'), next: t('paginationNext'), page: t('paginationPage') }}
                className="mt-6 border-t pt-4 border-slate-100 dark:border-slate-800"
              />
            </AnalyticsCard>
          </div>
        </section>

        <section className={`space-y-12 ${mobileSection === 'changes' ? '' : 'hidden'}`}>
          <div className="flex items-center gap-6">
            <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400 whitespace-nowrap">III. {t('changes')}</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
          </div>

          <AnalyticsCard
            title={t('changeRequests')}
            subtitle={t('changeRequestsSubtitle')}
            insight={t('changeRequestsInsight')}
            showInsight={showInsights}
          >
            <div id="change-requests-panel" className="hidden md:block overflow-x-auto rounded-3xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
                  <tr className="border-b border-slate-200/60 dark:border-white/5">
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('requestNo')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('source')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('type')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('status')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 text-right">{t('requestedBy')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {changeRequestPagination.rows.map((requestRow) => (
                    <tr
                      key={requestRow.id}
                      className={`group cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70 ${highlightedChangeRequestId === requestRow.id ? 'bg-brand-primary/10 ring-1 ring-brand-primary/40' : ''
                        }`}
                      onClick={() => openChangeRequestPreview(requestRow)}
                    >
                      <td className="px-4 py-3 font-black text-brand-primary text-xs">
                        <span className="bg-brand-primary/5 px-2 py-1 rounded-md border border-brand-primary/20">{requestRow.request_number || `CR-${requestRow.id}`}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{requestRow.source_entity_type} #{requestRow.source_entity_id}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-black text-[10px] uppercase tracking-tighter">{requestRow.request_type}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border ${getStatusVariant(requestRow.status) === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                          getStatusVariant(requestRow.status) === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                            'bg-slate-500/10 text-slate-600 border-slate-500/20'
                          }`}>
                          <span className="w-1 h-1 rounded-full bg-current" />
                          {requestRow.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-tight">{requestRow.requested_by_name || '—'}</td>
                    </tr>
                  ))}
                  {changeRequestPagination.total === 0 && (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic">{t('noChangeRequests')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards for Change Requests */}
            <div className="md:hidden space-y-4">
              {changeRequestPagination.rows.map((item) => (
                <div
                  key={`cr-mob-${item.id}`}
                  onClick={() => openChangeRequestPreview(item)}
                  className={`p-5 rounded-2xl border transition-all active:scale-[0.98] ${highlightedChangeRequestId === item.id
                      ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/20'
                      : 'border-slate-100 dark:border-white/5 bg-slate-50/30'
                    }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{t('requestNo')}</p>
                      <p className="text-sm font-black text-brand-primary">{item.request_number || `CR-${item.id}`}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase border ${getStatusVariant(item.status) === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                        getStatusVariant(item.status) === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                          'bg-slate-500/10 text-slate-600 border-slate-500/20'
                      }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{t('type')}</p>
                      <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">{item.request_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{t('requestedBy')}</p>
                      <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">{item.requested_by_name || '—'}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{t('source')}</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase">{item.source_entity_type} #{item.source_entity_id}</p>
                  </div>
                </div>
              ))}
              {changeRequestPagination.total === 0 && (
                <div className="p-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">{t('noChangeRequests')}</div>
              )}
            </div>
            <PaginationControls
              page={changeRequestPagination.page}
              pageCount={changeRequestPagination.pageCount}
              total={changeRequestPagination.total}
              pageSize={pageSize}
              onPageChange={setChangeRequestPage}
              onPageSizeChange={setPageSize}
              labels={{ showing: t('paginationShowing'), of: t('paginationOf'), previous: t('paginationPrevious'), next: t('paginationNext'), page: t('paginationPage') }}
              className="mt-6 border-t pt-4 border-slate-100 dark:border-slate-800"
            />
          </AnalyticsCard>
        </section>

        <section id="users-contacts" className={`space-y-12 ${mobileSection === 'users' ? '' : 'hidden'}`}>
          <div className="flex items-center gap-6">
            <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400 whitespace-nowrap">IV. {t('users')}</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800/50 via-slate-100 dark:via-slate-900/20 to-transparent" />
          </div>

          <AnalyticsCard
            title={t('usersSalespersons')}
            subtitle={t('userManagementSubtitle')}
            insight={t('userManagementInsight')}
            showInsight={showInsights}
            topRight={
              canViewAnalytics && (
                <button
                  type="button"
                  onClick={() => setShowUserForm((current) => !current)}
                  className="px-6 py-2 rounded-xl bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all outline-none border-none"
                >
                  {showUserForm ? (language === 'hi' ? 'फॉर्म बंद करें' : 'Close Form') : t('addUserContact')}
                </button>
              )
            }
          >
            {canViewAnalytics && showUserForm && (
              <div className="mb-8 p-5 sm:p-8 rounded-3xl sm:rounded-[2rem] bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50 animate-scale-in">
                <form onSubmit={handleSaveUser} className="space-y-8">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-px bg-brand-primary/30" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary">{language === 'hi' ? 'ऑनबोर्डिंग प्रोटोकॉल' : 'Onboarding Protocol'}</h4>
                  </div>

                  {userFormNotice && (
                    <div className={`p-4 rounded-2xl text-xs font-bold ring-1 ${userFormNotice.type === 'error' ? 'bg-rose-50 text-rose-600 ring-rose-200' : 'bg-emerald-50 text-emerald-600 ring-emerald-200'}`}>
                      {userFormNotice.message}
                    </div>
                  )}

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t('name')}</Label>
                      <Input {...createUserForm.register('name')} className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold" placeholder="Full legal name" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t('phone')}</Label>
                      <Input {...createUserForm.register('phone')} className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold" placeholder="10-digit primary contact" />
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t('email')}</Label>
                      <Input {...createUserForm.register('email')} type="email" className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold" placeholder="Official email address" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t('role')}</Label>
                      <Select
                        value={createUserForm.watch('role')}
                        onValueChange={(value) => createUserForm.setValue('role', value, { shouldDirty: true })}
                      >
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold">
                          <SelectValue placeholder={t('role')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stock_maintainer">{language === 'hi' ? 'स्टॉक मेंटेनर' : 'Stock Maintainer'}</SelectItem>
                          <SelectItem value="salesperson">{language === 'hi' ? 'सेल्सपर्शन' : 'Salesperson'}</SelectItem>
                          <SelectItem value="manager">{language === 'hi' ? 'मैनेजर' : 'Manager'}</SelectItem>
                          <SelectItem value="admin">{language === 'hi' ? 'सिस्टम एडमिन' : 'System Admin'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {createUserForm.watch('role') === 'salesperson' && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{language === 'hi' ? 'डिवीज़न' : 'Divisions'}</Label>
                      <div className="flex flex-wrap gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        {['Adhesive', ...(suggestions?.divisionName || []).filter((n) => n !== 'Adhesive')].map((name) => {
                          const selected = (createUserForm.watch('divisions') || []).includes(name);
                          const isAdhesive = name === 'Adhesive';
                          return (
                            <label key={name} className={`flex items-center gap-2 cursor-pointer select-none ${isAdhesive ? 'opacity-60 cursor-not-allowed' : ''}`}>
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={isAdhesive}
                                onChange={() => {
                                  if (isAdhesive) return;
                                  const current = createUserForm.getValues('divisions') || [];
                                  createUserForm.setValue('divisions', selected ? current.filter((d) => d !== name) : [...current, name], { shouldDirty: true });
                                }}
                                className="accent-brand-primary"
                              />
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t('password')}</Label>
                      <div className="relative">
                        <Input {...createUserForm.register('password')} type={showPrimaryPassword ? 'text' : 'password'} className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold pr-12" placeholder="Secure token" />
                        <button type="button" onClick={() => setShowPrimaryPassword(!showPrimaryPassword)} title={showPrimaryPassword ? 'Hide password' : 'Show password'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                          {showPrimaryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t('confirmPassword')}</Label>
                      <div className="relative">
                        <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type={showConfirmPassword ? 'text' : 'password'} className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold pr-12" placeholder="Verify token" />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} title={showConfirmPassword ? 'Hide password' : 'Show password'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                    <button
                      type="submit"
                      disabled={actionLoading === 'user-save'}
                      className="flex-1 h-14 rounded-2xl bg-slate-900 transition-all hover:bg-black text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                    >
                       {actionLoading === 'user-save' ? (language === 'hi' ? 'प्रसंस्करण...' : 'Processing...') : (language === 'hi' ? 'पहचान अधिकृत करें' : 'Authorize Identity')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserForm(false);
                        setUserFormNotice(null);
                        createUserForm.reset({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', department: 'Adhesive', status: 'active', division: '' });
                        setConfirmPassword('');
                        setShowPrimaryPassword(false);
                        setShowConfirmPassword(false);
                      }}
                      className="px-8 h-14 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 text-xs font-black uppercase tracking-widest transition-all"
                    >
                       {language === 'hi' ? 'रद्द करें' : 'Cancel'}
                    </button>
                  </div>
                  <input type="hidden" {...createUserForm.register('status')} readOnly />
                  <input type="hidden" {...createUserForm.register('department')} defaultValue="Adhesive" />
                </form>
              </div>
            )}
            <div className="hidden md:block overflow-x-auto rounded-[2rem] border border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
                  <tr className="border-b border-slate-200/60 dark:border-white/5">
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('user')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('role')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('status')}</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {userPagination.rows.map((u) => (
                    <tr
                      key={u.id}
                      className="group cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70"
                      onClick={() => openUserPreview(u)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black text-xs border border-brand-primary/20 shadow-sm transition-transform group-hover:scale-105">
                            {getInitials(u.full_name, u.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1 text-xs">{u.full_name || 'N/A'}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border ${u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' :
                          u.role === 'manager' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                            'bg-slate-500/10 text-slate-600 border-slate-500/20'
                          }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{u.is_active ? t('active') : t('inactive')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (u.is_active) handleRejectUser(u);
                              else handleApproveUser(u);
                            }}
                            disabled={actionLoading === `user-${u.id}-update`}
                            title={u.is_active ? 'Suspend Access' : 'Restore Access'}
                            className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${u.is_active
                              ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white'
                              : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                              }`}
                          >
                            {u.is_active ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                          </button>
                          {canViewAnalytics && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteUser(u.id);
                              }}
                              disabled={actionLoading === `user-${u.id}-delete`}
                              title="Remove User"
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {userPagination.total === 0 && (
                    <tr><td colSpan="4" className="px-8 py-12 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic">{t('noUsersFound')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards for Users */}
            <div className="md:hidden space-y-4">
              {userPagination.rows.map((u) => (
                <div
                  key={`user-mob-${u.id}`}
                  onClick={() => openUserPreview(u)}
                  className="p-5 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-slate-900/10 space-y-4 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black text-sm border border-brand-primary/20 shadow-sm">
                      {getInitials(u.full_name, u.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1.5 truncate">{u.full_name || 'N/A'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{u.email}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase border ${u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' :
                      u.role === 'manager' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                        'bg-slate-500/10 text-slate-600 border-slate-500/20'
                      }`}>
                      {u.role.split('_').pop()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{u.is_active ? t('active') : t('inactive')}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (u.is_active) handleRejectUser(u);
                          else handleApproveUser(u);
                        }}
                        disabled={actionLoading === `user-${u.id}-update`}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all text-[9px] font-black uppercase tracking-widest ${u.is_active
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          }`}
                      >
                        {u.is_active ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                        <span>{u.is_active ? 'Suspend' : 'Restore'}</span>
                      </button>
                      {canViewAnalytics && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteUser(u.id);
                          }}
                          disabled={actionLoading === `user-${u.id}-delete`}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[9px] font-black uppercase tracking-widest"
                        >
                          <X className="h-4 w-4" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {userPagination.total === 0 && (
                <div className="p-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">{t('noUsersFound')}</div>
              )}
            </div>
            <PaginationControls
              page={userPagination.page}
              pageCount={userPagination.pageCount}
              total={userPagination.total}
              pageSize={pageSize}
              onPageChange={setUserPage}
              onPageSizeChange={setPageSize}
              labels={{ showing: t('paginationShowing'), of: t('paginationOf'), previous: t('paginationPrevious'), next: t('paginationNext'), page: t('paginationPage') }}
              className="mt-6 border-t pt-4 border-slate-100 dark:border-slate-800"
            />
          </AnalyticsCard>
        </section>
      </div>

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => !open && closePreview()}
        title={previewState.title}
        description={previewState.description}
        summary={
          previewState.loading ? (
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">{t('loadingPreview')}</div>
          ) : previewState.error ? (
            <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'change-request'
            ? [
              {
                title: 'Core Logistics Logic',
                children: (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Request ID', value: previewState.record?.request_number || `CR-${previewState.record?.id}`, isBold: true },
                      { label: 'Status', value: previewState.record?.status, isStatus: true },
                      { label: 'Entity Source', value: `${previewState.record?.source_entity_type} #${previewState.record?.source_entity_id}` },
                      { label: 'Priority', value: previewState.record?.priority || 'normal' },
                      { label: 'Initiated By', value: previewState.record?.requested_by_name },
                      { label: 'Timestamp', value: formatDateTime(previewState.record?.created_at) },
                    ].map((item) => (
                      <div key={item.label} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/50">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                        <p className={`text-xs ${item.isBold ? 'font-black text-brand-primary' : 'font-bold text-slate-900 dark:text-slate-100'}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]
            : previewState.kind === 'user'
              ? [
                {
                  title: 'Identity & Access',
                  children: (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { label: 'Full Name', value: previewState.record?.full_name, isBold: true },
                          { label: 'Email Address', value: previewState.record?.email },
                          { label: 'Primary Contact', value: previewState.record?.phone_number },
                          { label: 'Department', value: previewState.record?.department || 'Adhesive' },
                          { label: 'Status', value: previewState.record?.is_active ? 'Active Identity' : 'Suspended' },
                        ].map((item) => (
                          <div key={item.label} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/50">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                            <p className={`text-xs ${item.isBold ? 'font-black text-brand-primary' : 'font-bold text-slate-900 dark:text-slate-100'}`}>
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/20">
                        <div className="flex items-center gap-3 mb-6">
                          <ShieldCheck className="h-5 w-5 text-brand-primary" />
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Permissions & Role Configuration</h4>
                        </div>
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          const isSalesperson = previewUserForm.watch('role') === 'salesperson';
                          const salaryVal = previewUserForm.watch('salary');
                          const goalVal = previewUserForm.watch('monthlySalesGoal');
                          handleUpdateUser(
                            previewState.record?.id,
                            {
                              role: previewUserForm.watch('role'),
                              divisions: previewUserForm.getValues('divisions') || ['Adhesive'],
                              canManageUsers: previewUserForm.watch('canManageUsers'),
                              canApproveChanges: previewUserForm.watch('canApproveChanges'),
                              canViewDashboard: previewUserForm.watch('canViewDashboard'),
                              ...(isSalesperson && { salary: salaryVal !== '' ? Number(salaryVal) : null }),
                              ...(isSalesperson && { monthlySalesGoal: goalVal !== '' ? Number(goalVal) : null }),
                            },
                            'User permissions updated successfully.'
                          );
                        }} className="space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className={FORM_LABEL_CLASS}>System Role</Label>
                              <Select
                                value={previewUserForm.watch('role') || 'stock_maintainer'}
                                onValueChange={(value) => previewUserForm.setValue('role', value, { shouldDirty: true })}
                              >
                                <SelectTrigger className="h-11 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stock_maintainer">Stock Maintainer</SelectItem>
                                  <SelectItem value="salesperson">Salesperson</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className={FORM_LABEL_CLASS}>Divisions</Label>
                              <div className="flex flex-wrap gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[44px]">
                                {['Adhesive', ...(suggestions?.divisionName || []).filter((n) => n !== 'Adhesive')].map((name) => {
                                  const selected = (previewUserForm.watch('divisions') || []).includes(name);
                                  const isAdhesive = name === 'Adhesive';
                                  return (
                                    <label key={name} className={`flex items-center gap-2 cursor-pointer select-none ${isAdhesive ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={isAdhesive}
                                        onChange={() => {
                                          if (isAdhesive) return;
                                          const current = previewUserForm.getValues('divisions') || [];
                                          previewUserForm.setValue('divisions', selected ? current.filter((d) => d !== name) : [...current, name], { shouldDirty: true });
                                        }}
                                        className="accent-brand-primary"
                                      />
                                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {previewUserForm.watch('role') === 'salesperson' && (
                            <div className="space-y-4">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Salesperson Targets</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className={FORM_LABEL_CLASS}>Monthly Salary (₹)</Label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="e.g. 25000"
                                    value={previewUserForm.watch('salary')}
                                    onChange={(e) => previewUserForm.setValue('salary', e.target.value, { shouldDirty: true })}
                                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className={FORM_LABEL_CLASS}>Monthly Sales Goal (₹)</Label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="e.g. 200000"
                                    value={previewUserForm.watch('monthlySalesGoal')}
                                    onChange={(e) => previewUserForm.setValue('monthlySalesGoal', e.target.value, { shouldDirty: true })}
                                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-4">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Permission Flags</p>
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/50">
                                <Checkbox
                                  checked={previewUserForm.watch('canViewDashboard') || false}
                                  onChange={(e) => previewUserForm.setValue('canViewDashboard', e.target.checked, { shouldDirty: true })}
                                  id="dashboard-flag"
                                />
                                <label htmlFor="dashboard-flag" className="flex-1 cursor-pointer">
                                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Can See Dashboard</p>
                                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Access to analytics and dashboard features</p>
                                </label>
                              </div>
                              <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/50">
                                <Checkbox
                                  checked={previewUserForm.watch('canManageUsers') || false}
                                  onChange={(e) => previewUserForm.setValue('canManageUsers', e.target.checked, { shouldDirty: true })}
                                  id="manage-users-flag"
                                />
                                <label htmlFor="manage-users-flag" className="flex-1 cursor-pointer">
                                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Can Manage Users</p>
                                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Create, edit, and manage user accounts</p>
                                </label>
                              </div>
                              <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/50">
                                <Checkbox
                                  checked={previewUserForm.watch('canApproveChanges') || false}
                                  onChange={(e) => previewUserForm.setValue('canApproveChanges', e.target.checked, { shouldDirty: true })}
                                  id="approve-changes-flag"
                                />
                                <label htmlFor="approve-changes-flag" className="flex-1 cursor-pointer">
                                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Can Approve Changes</p>
                                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Approve shipments and change requests</p>
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                            <button
                              type="submit"
                              disabled={actionLoading === `user-${previewState.record?.id}-update`}
                              className="flex-1 py-3 rounded-xl bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition-all"
                            >
                              {actionLoading === `user-${previewState.record?.id}-update` ? 'Saving...' : 'Save Permissions'}
                            </button>
                            <button
                              type="button"
                              onClick={() => previewUserForm.reset({
                                role: previewState.record?.role || 'stock_maintainer',
                                divisions: Array.isArray(previewState.record?.division_names) && previewState.record.division_names.length ? previewState.record.division_names : ['Adhesive'],
                                status: previewState.record?.status || 'active',
                                canManageUsers: Boolean(previewState.record?.can_manage_users),
                                canApproveChanges: Boolean(previewState.record?.can_approve_changes),
                                canViewDashboard: Boolean(previewState.record?.can_view_dashboard),
                                salary: previewState.record?.salary != null ? String(previewState.record.salary) : '',
                                monthlySalesGoal: previewState.record?.monthly_sales_goal != null ? String(previewState.record.monthly_sales_goal) : '',
                              })}
                              className="px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              Reset
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="p-6 rounded-3xl border border-brand-primary/20 bg-brand-primary/5">
                        <div className="flex items-center gap-3 mb-4">
                          <ShieldCheck className="h-5 w-5 text-brand-primary" />
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Governance Override</h4>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleApproveUser(previewState.record)}
                            disabled={actionLoading === `user-${previewState.record?.id}-update` || previewState.record?.is_active}
                            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            Restore Access
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectUser(previewState.record)}
                            disabled={actionLoading === `user-${previewState.record?.id}-update` || !previewState.record?.is_active}
                            className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            Suspend Identity
                          </button>
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setResetPasswordModal({ open: true, email: previewState.record?.email || '', newPassword: '', confirm: '', loading: false, error: null, success: false })}
                            className="w-full py-3 rounded-xl bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-600"
                          >
                            Reset Password
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                },
              ]
              : [
                {
                  title: 'Logistics Parameters',
                  children: (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { label: 'Protocol ID', value: previewState.record?.shipment_number, isBold: true },
                        { label: 'Time Registry', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Fleet ID', value: previewState.record?.truck_license_plate },
                        { label: 'Operator', value: previewState.record?.driver_name },
                        { label: 'Approval State', value: previewState.record?.status || previewState.record?.approval_status },
                        { label: 'Net Volume', value: `${previewState.record?.total_whole_qty} Whole Units` },
                      ].map((item) => (
                        <div key={item.label} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/50">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                          <p className={`text-xs ${item.isBold ? 'font-black text-brand-primary' : 'font-bold text-slate-900 dark:text-slate-100'}`}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  ),
                },
                previewState.items?.length
                  ? {
                    title: 'Inventory Delta',
                    children: (
                      <div className="space-y-4">
                        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-400">SKU</th>
                                <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-400">Label</th>
                                <th className="px-4 py-3 text-right font-black uppercase tracking-widest text-slate-400">Volume</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {previewItemPagination.rows.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="px-4 py-3 font-black text-brand-primary">{item.sku}</td>
                                  <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{item.item_name}</td>
                                  <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">
                                    {item.loaded_whole_qty ?? item.received_whole_qty ?? 0} U
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <PaginationControls
                          page={previewItemPagination.page}
                          pageCount={previewItemPagination.pageCount}
                          total={previewItemPagination.total}
                          pageSize={pageSize}
                          onPageChange={setPreviewItemsPage}
                          onPageSizeChange={setPageSize}
                          labels={{ showing: t('paginationShowing'), of: t('paginationOf'), previous: t('paginationPrevious'), next: t('paginationNext'), page: t('paginationPage') }}
                        />
                      </div>
                    ),
                  }
                  : null,
              ]
        }
      />

      {resetPasswordModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 mb-1">Reset Password</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{resetPasswordModal.email}</p>

            {resetPasswordModal.success ? (
              <div className="space-y-4">
                <p className="text-xs font-bold text-emerald-600">Password reset successfully. The user can now sign in with the new password.</p>
                <button
                  type="button"
                  onClick={() => setResetPasswordModal((s) => ({ ...s, open: false }))}
                  className="w-full py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">New Password</label>
                  <input
                    type="password"
                    value={resetPasswordModal.newPassword}
                    onChange={(e) => setResetPasswordModal((s) => ({ ...s, newPassword: e.target.value, error: null }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    placeholder="Min 8 characters"
                    disabled={resetPasswordModal.loading}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={resetPasswordModal.confirm}
                    onChange={(e) => setResetPasswordModal((s) => ({ ...s, confirm: e.target.value, error: null }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    placeholder="Repeat password"
                    disabled={resetPasswordModal.loading}
                  />
                </div>
                {resetPasswordModal.error && (
                  <p className="text-xs font-bold text-red-500">{resetPasswordModal.error}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setResetPasswordModal((s) => ({ ...s, open: false }))}
                    disabled={resetPasswordModal.loading}
                    className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetPasswordModal.loading || !resetPasswordModal.newPassword}
                    className="flex-1 py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {resetPasswordModal.loading ? 'Saving…' : 'Set Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Sheet open={arrivalSheetOpen} onOpenChange={(open) => { setArrivalSheetOpen(open); if (!open) { setEditingArrivalId(null); setArrivalNotice(null); arrivalForm.reset(createInitialArrivalDraft()); } }}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="text-base">{editingArrivalId ? 'Edit Purchase' : tc.logNewPurchase}</SheetTitle>
            <SheetDescription className="text-xs">{tc.purchaseSheetDesc}</SheetDescription>
          </SheetHeader>
          <ArrivalFormContent
            form={arrivalForm}
            itemsFieldArray={arrivalItemsFieldArray}
            watchedItems={arrivalItems}
            attachments={arrivalAttachments}
            setAttachment={setArrivalAttachment}
            onSubmit={handleArrivalSubmit}
            onInvalid={() => setArrivalNotice({ type: 'error', message: 'Please fix the highlighted fields.' })}
            notice={arrivalNotice}
            submitting={arrivalSubmitting}
            onAddItem={() => arrivalItemsFieldArray.append(createArrivalItemRow())}
            onItemNameChange={() => {}}
            suggestions={suggestions}
            activeItems={data?.activeItems}
            t={td}
            tc={tc}
            language={language}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={dispatchSheetOpen} onOpenChange={(open) => { setDispatchSheetOpen(open); if (!open) { setEditingDispatchId(null); setDispatchNotice(null); dispatchForm.reset(createInitialDispatchDraft()); } }}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="text-base">{editingDispatchId ? 'Edit Dispatch' : tc.logNewDispatch}</SheetTitle>
            <SheetDescription className="text-xs">{tc.purchaseSheetDesc}</SheetDescription>
          </SheetHeader>
          <DispatchFormContent
            form={dispatchForm}
            itemsFieldArray={dispatchItemsFieldArray}
            attachments={dispatchAttachments}
            setAttachment={setDispatchAttachment}
            onSubmit={handleDispatchSubmit}
            onInvalid={() => setDispatchNotice({ type: 'error', message: 'Please fix the highlighted fields.' })}
            notice={dispatchNotice}
            submitting={dispatchSubmitting}
            onAddItem={() => dispatchItemsFieldArray.append(createDispatchItemRow())}
            activeItems={data?.activeItems}
            suggestions={suggestions}
            t={td}
            tc={tc}
            language={language}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingBagArrivalId} onOpenChange={(open) => { if (!open) { setEditingBagArrivalId(null); setBagArrivalNotice(null); bagArrivalForm.reset(createInitialBagArrivalDraft()); } }}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="text-base">Edit Bag Purchase</SheetTitle>
            <SheetDescription className="text-xs">{tc.purchaseSheetDesc}</SheetDescription>
          </SheetHeader>
          <BagArrivalFormContent
            form={bagArrivalForm}
            itemsFieldArray={bagArrivalItemsFieldArray}
            onSubmit={handleBagArrivalSubmit}
            onInvalid={() => setBagArrivalNotice({ type: 'error', message: 'Please fix the highlighted fields.' })}
            notice={bagArrivalNotice}
            submitting={bagArrivalSubmitting}
            onAddItem={() => bagArrivalItemsFieldArray.append(createBagArrivalItemRow())}
            onItemNameChange={() => {}}
            suggestions={suggestions}
            activeItems={data?.activeItems}
            t={td}
            tc={tc}
            language={language}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
