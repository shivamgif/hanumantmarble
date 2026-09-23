'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { useCallback, useEffect, useState } from 'react';
import { useAuthUser } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { arrivalFormSchema, bagArrivalFormSchema, dispatchFormSchema } from '@/lib/forms/stock-forms';
import { useStockFormStore } from '@/lib/stores/stock-form-store';
import { createArrivalItemRow, createBagArrivalItemRow, createDispatchItemRow, createInitialArrivalDraft, createInitialBagArrivalDraft, createInitialDispatchDraft, formatLineVolume, formatShipmentVolume, toNumber, trimText, parseSizeLabelDimensions, tabButtonClass } from '@/app/stock/lib/stock-utils';
import { ArrivalFormContent, BagArrivalFormContent } from '@/app/stock/components/arrival-form';
import { DispatchFormContent } from '@/app/stock/components/dispatch-form';
import { BranchesPanel } from '@/app/stock/components/branches-panel';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';
import { usePageSize } from '@/hooks/usePageSize';
import { validateStockPassword } from '@/lib/password-policy';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ShieldAlert,
  UsersRound,
  Activity,
  ArrowLeft,
  FileText,
  ShieldCheck,
  AlertCircle,
  Package,
  X,
  Clock,
  Pencil,
  Building2,
  Truck,
  Copy
} from 'lucide-react';

import { AnalyticsCard } from '@/app/stock/components/dashboard-ui';
import { DuplicateItemsWidget, FreightTripsWidget } from '@/app/stock/analytics/components/widgets';

// How far back the review tab looks. Freight is per truck-day and six months is
// the same window the analytics page defaulted to; duplicate products are not
// date-ranged at all, so this does not narrow them.
const REVIEW_MONTHS = 6;

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
  // The freight and duplicate widgets read every string they render from
  // stock.analytics, so their tab labels come from there too rather than being
  // translated a second time under stock.admin and left to drift.
  const ta = (key) => getTranslation(`stock.analytics.${key}`, language);
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
  const [data, setData] = useState(null);
  const viewerRole = data?.viewerRole || user?.role;
  const viewerFlags = getRoleFlags(viewerRole);
  const canViewAnalytics = viewerFlags.canViewAllAnalytics;
  const canManageUsers = viewerFlags.canManageUsers;
  // Freight and duplicate-product review, from the admin analytics endpoint.
  const [reviewData, setReviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [mobileSection, setMobileSection] = useState('approvals');
  const [showPrimaryPassword, setShowPrimaryPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userFormNotice, setUserFormNotice] = useState(null);
  // Home-branch options. Deliberately its own fetch rather than part of
  // refreshDashboard(), which throws on any failure — a missing branch list
  // must not take the whole admin page down.
  const [branchOptions, setBranchOptions] = useState([]);
  const loadBranches = useCallback(() => {
    fetch('/api/stock/locations', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { locations: [] }))
      .then((json) => setBranchOptions(json.locations || []))
      .catch(() => setBranchOptions([]));
  }, []);
  useEffect(loadBranches, [loadBranches]);
  const [actionNotice, setActionNotice] = useState(null);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [cancelledArrivalPage, setCancelledArrivalPage] = useState(1);
  const [changeRequestPage, setChangeRequestPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [showInsights, setShowInsights] = useState(false);
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
      defaultLocationId: '',
    },
  });
  const previewUserForm = useForm({
    defaultValues: {
      defaultLocationId: '',
      role: 'stock_maintainer',
      divisions: ['Adhesive'],
      status: 'inactive',
      canManageUsers: false,
      canApproveChanges: false,
      canViewDashboard: false,
      canSell: false,
      salary: '',
      monthlySalesGoal: '',
    },
  });

  const [resetPasswordModal, setResetPasswordModal] = useState({ open: false, email: '', newPassword: '', confirm: '', loading: false, error: null, success: false });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', confirmText: 'Confirm', confirmVariant: 'emerald', onConfirm: () => {} });
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
          fetch('/api/stock/change-requests', { cache: 'no-store' }),
          // Not gated on canViewAnalytics: at this point `data` is null, so the
          // role falls back to the session's, which is null for accounts whose
          // stock role lives only in stock_app_users - and the fetch would be
          // skipped for exactly the managers it is meant for. The endpoint does
          // its own role check; a 401 here just leaves the tabs empty.
          fetch(`/api/stock/admin/analytics?months=${REVIEW_MONTHS}`),
        ];
        const [dashboardResponse, changeRequestResponse, reviewResponse] = await Promise.all(fetchPromises);

        const dashboardJson = await dashboardResponse.json();
        const changeRequestJson = await changeRequestResponse.json();
        // The review tab is a side errand. An approver waiting on the queue must
        // not be shown an error page because the freight query had a bad day, so
        // this one failing leaves the tab empty and nothing else.
        const reviewJson = reviewResponse?.ok ? await reviewResponse.json() : null;

        if (!dashboardResponse.ok) {
          throw new Error(dashboardJson.error || 'Fetch failed');
        }

        if (!changeRequestResponse.ok) {
          throw new Error(changeRequestJson.error || 'Failed to load change requests');
        }

        if (mounted) {
          setData(dashboardJson);
          setChangeRequests(changeRequestJson.requests || []);
          if (reviewJson) setReviewData(reviewJson);
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

  function promptApproveShipment(type, item) {
    setConfirmModal({ open: true, title: t('approveShipment') || 'Approve Shipment', message: `Are you sure you want to approve ${item.shipment_number}? This will permanently adjust inventory levels.`, confirmText: 'Approve', confirmVariant: 'emerald', onConfirm: () => handleShipmentAction(type, item.id, 'approve') });
  }

  function promptRejectShipment(type, item) {
    setConfirmModal({ open: true, title: 'Reject Shipment', message: `Are you sure you want to reject ${item.shipment_number}? It will be marked as rejected and no stock changes will apply.`, confirmText: 'Reject', confirmVariant: 'rose', onConfirm: () => handleShipmentAction(type, item.id, 'reject', 'Rejected from hub') });
  }

  function promptDeleteShipment(type, item) {
    setConfirmModal({ open: true, title: 'Delete Cancelled Shipment', message: `Permanently delete ${item.shipment_number}? This action cannot be undone.`, confirmText: 'Delete', confirmVariant: 'rose', onConfirm: () => handleShipmentAction(type, item.id, 'delete', null, { status: 'cancelled' }) });
  }

  function promptToggleUser(user) {
    const isSuspending = user.is_active;
    setConfirmModal({ open: true, title: isSuspending ? 'Suspend Access' : 'Restore Access', message: isSuspending ? `Revoke system access for ${user.full_name || user.email}?` : `Grant system access to ${user.full_name || user.email}?`, confirmText: isSuspending ? 'Suspend' : 'Restore', confirmVariant: isSuspending ? 'amber' : 'emerald', onConfirm: () => isSuspending ? handleRejectUser(user) : handleApproveUser(user) });
  }

  function promptDeleteUser(user) {
    setConfirmModal({ open: true, title: 'Remove User', message: `Are you sure you want to permanently remove ${user.full_name || user.email}?`, confirmText: 'Remove', confirmVariant: 'rose', onConfirm: () => handleDeleteUser(user.id) });
  }

  async function handleShipmentAction(type, id, action, notes = null, additionalData = {}) {
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
    const [refreshResponse, changeRequestResponse, reviewResponse] = await Promise.all([
      fetch('/api/stock/admin/dashboard'),
      fetch('/api/stock/change-requests', { cache: 'no-store' }),
      // fresh=1: an approval just changed the books, so the cached copy is stale.
      fetch(`/api/stock/admin/analytics?months=${REVIEW_MONTHS}&fresh=1`),
    ]);

    const refreshJson = await refreshResponse.json();
    const changeRequestJson = await changeRequestResponse.json();
    const reviewJson = reviewResponse?.ok ? await reviewResponse.json() : null;

    if (!refreshResponse.ok) {
      throw new Error(refreshJson.error || 'Failed to refresh dashboard');
    }

    if (!changeRequestResponse.ok) {
      throw new Error(changeRequestJson.error || 'Failed to refresh change requests');
    }

    setData(refreshJson);
    setChangeRequests(changeRequestJson.requests || []);
    if (reviewJson) setReviewData(reviewJson);
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
        transporterUnknown: !(s.transporter_name || s.truck_license_plate || s.driver_name),
        // Freight lives on the truck trip; the shipment's own columns are 0.
        tripId: s.trip_id ? String(s.trip_id) : '',
        transportCost: s.trip_delivery_cost ?? s.delivery_cost ?? '',
        laborCost: s.trip_unloading_labour_cost ?? s.unloading_labour_cost ?? '',
        handlingCostPercent: s.handling_cost_percent != null ? String(s.handling_cost_percent) : '1.0',
        fuelCostPercent: s.fuel_cost_percent != null ? String(s.fuel_cost_percent) : '5.0',
        gstPercent: s.gst_percent != null ? String(s.gst_percent) : '18.0',
        freightWeightKg: s.freight_weight_kg != null ? String(s.freight_weight_kg) : '',
        discountAmount: s.discount_amount != null && Number(s.discount_amount) !== 0 ? String(s.discount_amount) : '',
        notes: s.notes || '',
        items: items.length > 0 ? items.map((item) => {
          const parsedDims = parseSizeLabelDimensions(item.size_label);
          return ({
          itemId: String(item.item_id),
          itemName: item.item_name || '',
          brandName: item.brand_name || '',
          divisionName: item.division_name || '',
          finish: item.finish || '',
          grade: item.grade || '',
          sizeLabel: item.size_label || '',
          sizeWidthMm: item.size_width_mm != null ? String(item.size_width_mm) : (parsedDims?.widthMm != null ? String(parsedDims.widthMm) : ''),
          sizeLengthMm: item.size_length_mm != null ? String(item.size_length_mm) : (parsedDims?.lengthMm != null ? String(parsedDims.lengthMm) : ''),
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
          discountAmount: item.discount_amount != null && Number(item.discount_amount) !== 0 ? String(item.discount_amount) : '',
          notes: item.notes || '',
        });}) : [createArrivalItemRow()],
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
          transporterUnknown: !(s.transporter_name || s.truck_license_plate || s.driver_name),
          // Freight lives on the truck trip; the shipment's own columns are 0.
          tripId: s.trip_id ? String(s.trip_id) : '',
          transportCost: s.trip_delivery_cost ?? s.delivery_cost ?? '',
          laborCost: s.trip_unloading_labour_cost ?? s.unloading_labour_cost ?? '',
          handlingCostPercent: s.handling_cost_percent != null ? String(s.handling_cost_percent) : '1.0',
          fuelCostPercent: s.fuel_cost_percent != null ? String(s.fuel_cost_percent) : '5.0',
          gstPercent: s.gst_percent != null ? String(s.gst_percent) : '18.0',
          freightWeightKg: s.freight_weight_kg != null ? String(s.freight_weight_kg) : '',
          discountAmount: s.discount_amount != null && Number(s.discount_amount) !== 0 ? String(s.discount_amount) : '',
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
            discountAmount: item.discount_amount != null && Number(item.discount_amount) !== 0 ? String(item.discount_amount) : '',
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
        discountAmount: toNumber(item.discountAmount),
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
        discountAmount: values.discountAmount === '' ? 0 : toNumber(values.discountAmount),
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
          discountAmount: toNumber(item.discountAmount),
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
          // Always sent, null included: null means "a delivery of its own",
          // while a missing key would keep the purchase on its current trip.
          tripId: values.tripId || null,
          // The operator's answer, which the server needs before it will start
          // a second trip for a lorry already charged that day.
          tripChoice: values.tripChoice || undefined,
          deliveryCost: toNumber(values.transportCost),
          unloadingLabourCost: toNumber(values.laborCost),
          handlingCostPercent: values.handlingCostPercent === '' ? undefined : toNumber(values.handlingCostPercent),
          fuelCostPercent: values.fuelCostPercent === '' ? undefined : toNumber(values.fuelCostPercent),
          gstPercent: values.gstPercent === '' ? undefined : toNumber(values.gstPercent),
          freightWeightKg: values.freightWeightKg === '' ? undefined : toNumber(values.freightWeightKg),
          discountAmount: values.discountAmount === '' ? 0 : toNumber(values.discountAmount),
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
            itemCategory: item.itemCategory || 'tile',
            loadedWholeQty: isBag ? toNumber(item.qtyBags) : (item.fromBroken ? 0 : toNumber(item.loadedWholeQty)),
            loadedBrokenQty: isBag ? 0 : (item.fromBroken ? toNumber(item.loadedBrokenQty) : 0),
            fromBroken: Boolean(item.fromBroken),
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
        canSell: Boolean(updatedUser.can_sell),
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

      createUserForm.reset({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', divisions: ['Adhesive'], department: '', status: 'active', defaultLocationId: '' });
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
      canSell: Boolean(previewState.record.can_sell),
      salary: previewState.record.salary != null ? String(previewState.record.salary) : '',
      monthlySalesGoal: previewState.record.monthly_sales_goal != null ? String(previewState.record.monthly_sales_goal) : '',
      defaultLocationId: previewState.record.default_location_id != null ? String(previewState.record.default_location_id) : '',
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

  // Counts behind the tab badges. The approval queue and the change queue are
  // the only two things on this page that need chasing, so they are the only
  // two that carry a number.
  const pendingApprovals = Number(data?.pendingArrivals?.length || 0) + Number(data?.pendingDispatches?.length || 0);
  const pendingChangeRequests = (changeRequests || []).filter((request) => String(request?.status || '').toLowerCase() === 'pending').length;

  if (loading) {
    return (
      <div className="space-y-10 lg:space-y-12 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
          <div className="h-16 sm:h-20 w-full sm:w-3/4 max-w-lg bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl sm:rounded-[2.5rem]" />
        </div>
        <div className="grid grid-cols-1 gap-6">
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-96" />
          <div className="animate-pulse rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800 h-96" />
        </div>
      </div>
    );
  }
  if (!data && error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-2">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            <span className="text-slate-400">Stock</span>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">{t('adminTitle')}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            <span className="text-brand-primary">{t('adminTitle').split(' ')[0]}</span> {t('adminTitle').split(' ')[1] || 'Hub'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInsights(!showInsights)}
            className={`flex items-center justify-center p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 hover:shadow-md transition-all active:scale-95 ${showInsights ? 'text-brand-primary' : 'text-slate-400'}`}
            title={t('toggleInsights')}
          >
            <Activity className="h-5 w-5" />
          </button>
          <button
            onClick={() => refreshDashboard()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-sm active:scale-95"
          >
            <FileText className="h-4 w-4" />
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

      {/* Same strip as the dashboard and analytics: below sm only the active tab
          keeps its label, the rest collapse to icon circles. */}
      <div className="flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1 scrollbar-none dark:border-white/5 dark:bg-slate-900/40 sm:w-fit sm:gap-0 sm:overflow-x-auto">
        {[
          { id: 'approvals', label: t('approvals'), icon: ShieldCheck, badge: pendingApprovals },
          { id: 'changes', label: t('changes'), icon: Clock, badge: pendingChangeRequests },
          { id: 'users', label: t('users'), icon: UsersRound },
          // Freight charged twice, and the same tile entered as two products.
          // Both are things to go and fix, which is what this page is for, and
          // they keep the names they had on the analytics page.
          ...(canViewAnalytics ? [
            { id: 'freight', label: ta('tabFreight'), icon: Truck },
            { id: 'duplicates', label: ta('tabDuplicates'), icon: Copy },
          ] : []),
          // Branches are company setup, not user admin — its own tab rather
          // than buried in the users section.
          ...(canManageUsers ? [{ id: 'branches', label: language === 'hi' ? 'शाखाएँ' : 'Branches', icon: Building2 }] : []),
        ].map((tab) => {
          const isActive = mobileSection === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileSection(tab.id)}
              aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}
              aria-current={isActive ? 'true' : undefined}
              className={`${tabButtonClass(isActive)} relative`}
            >
              <Icon className="h-4 w-4 shrink-0 sm:hidden" />
              <span className={`overflow-hidden transition-all duration-300 ease-out sm:max-w-none sm:opacity-100 ${isActive ? 'max-w-[12rem] opacity-100' : 'max-w-0 opacity-0'}`}>
                {tab.label}
              </span>
              {/* Waiting work, shown as a count where there is room and a dot
                  where the tab has collapsed to an icon. */}
              {tab.badge ? (
                <>
                  <span className="ml-1.5 hidden rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] leading-none text-amber-600 dark:text-amber-400 sm:inline-block">{tab.badge}</span>
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 sm:hidden" />
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <section id="approval-queue" className={`space-y-6 ${mobileSection === 'approvals' ? '' : 'hidden'}`}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('date')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Shipment & Maintainer</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Supplier & Transport</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Quantities</th>
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
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{formatDateTime(item.arrival_date || item.created_at).split(',')[0]}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="w-fit bg-brand-primary/5 px-2 py-0.5 rounded border border-brand-primary/20 font-black text-brand-primary dark:text-orange-400 text-[10px]">{item.shipment_number}</span>
                            <span className="text-slate-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-widest">{item.maintainer_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-900 dark:text-slate-100 font-bold text-xs truncate max-w-[150px]">{item.supplier_name || '—'}</span>
                            <span className="text-slate-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-widest">{item.truck_license_plate || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {Number(item.total_bag_qty) > 0 && <span className="text-amber-600 dark:text-amber-400 font-black text-xs font-sans">{item.total_bag_qty} <span className="text-[9px] uppercase tracking-widest">Bags</span></span>}
                            {Number(item.total_sqft_qty) > 0 && <span className="text-sky-600 dark:text-sky-400 font-black text-xs font-sans">{Number(item.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[9px] uppercase tracking-widest">Sqft</span></span>}
                            {Number(item.total_whole_qty) > 0 && <span className="text-slate-900 dark:text-slate-100 font-black text-xs font-sans">{item.total_whole_qty} <span className="text-[9px] text-slate-400 uppercase tracking-widest">Whole</span></span>}
                            {Number(item.total_broken_qty) > 0 && <span className="text-rose-500 font-black text-xs font-sans">{item.total_broken_qty} <span className="text-[9px] text-rose-400 uppercase tracking-widest">Broken</span></span>}
                          </div>
                        </td>
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
                                promptApproveShipment('inbound-shipments', item);
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
                                promptRejectShipment('inbound-shipments', item);
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
                      <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic">{t('noPending')}</td></tr>
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('date')}</p>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{formatDateTime(item.arrival_date || item.created_at).split(',')[0]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Source</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 max-w-[120px] truncate">{item.supplier_name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('shipmentNo')} & Maintainer</p>
                        <p className="text-sm font-black text-brand-primary dark:text-orange-400 mb-1">{item.shipment_number}</p>
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{item.maintainer_name || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Quantities</p>
                        {Number(item.total_bag_qty) > 0 && <p className="text-xs font-black text-amber-600 dark:text-amber-400">{item.total_bag_qty} Bags</p>}
                        {Number(item.total_sqft_qty) > 0 && <p className="text-xs font-black text-sky-600 dark:text-sky-400">{Number(item.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Sqft</p>}
                        {Number(item.total_whole_qty) > 0 && <p className="text-xs font-black text-slate-900 dark:text-white">{item.total_whole_qty} Whole</p>}
                        {Number(item.total_broken_qty) > 0 && <p className="text-xs font-black text-rose-500">{item.total_broken_qty} Broken</p>}
                      </div>
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
                          promptApproveShipment('inbound-shipments', item);
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
                          promptRejectShipment('inbound-shipments', item);
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
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('date')}</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Shipment & Maintainer</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Supplier & Transport</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Quantities</th>
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
                          <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{formatDateTime(item.arrival_date || item.created_at).split(',')[0]}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="w-fit bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/20 font-black text-amber-600 dark:text-amber-400 text-[10px]">{item.shipment_number}</span>
                              <span className="text-slate-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-widest">{item.maintainer_name || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-slate-900 dark:text-slate-100 font-bold text-xs truncate max-w-[150px]">{item.supplier_name || '—'}</span>
                              <span className="text-slate-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-widest">{item.truck_license_plate || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {Number(item.total_sqft_qty || 0) > 0
                                ? <span className="text-sky-600 dark:text-sky-400 font-black text-xs font-sans">{Number(item.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[9px] uppercase tracking-widest">Sqft</span></span>
                                : <span className="text-slate-900 dark:text-slate-100 font-black text-xs font-sans">{item.total_whole_qty} <span className="text-[9px] text-slate-400 uppercase tracking-widest">Whole</span></span>}
                              {Number(item.total_broken_qty) > 0 && <span className="text-rose-500 font-black text-xs font-sans">{item.total_broken_qty} <span className="text-[9px] text-rose-400 uppercase tracking-widest">Broken</span></span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                promptDeleteShipment('inbound-shipments', item);
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
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('date')}</p>
                          <p className="text-xs font-black text-slate-900 dark:text-white">{formatDateTime(item.arrival_date || item.created_at).split(',')[0]}</p>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">Cancelled</Badge>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('shipmentNo')} & Maintainer</p>
                          <p className="text-sm font-black text-amber-600 dark:text-amber-400 mb-1">{item.shipment_number}</p>
                          <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{item.maintainer_name || '-'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Source & Quantities</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 max-w-[120px] truncate mb-1">{item.supplier_name || '—'}</p>
                          {Number(item.total_sqft_qty || 0) > 0
                          ? <p className="text-xs font-black text-sky-600 dark:text-sky-400">{Number(item.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Sqft</p>
                          : <p className="text-xs font-black text-slate-900 dark:text-white">{item.total_whole_qty} Whole</p>}
                        </div>
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
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{t('date')}</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Dispatch & Driver</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Customer & Value</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Quantities</th>
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
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold text-xs">{formatDateTime(item.dispatch_date).split(',')[0]}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="w-fit bg-brand-secondary/5 px-2 py-0.5 rounded border border-brand-secondary/20 font-black text-brand-secondary dark:text-indigo-400 text-[10px]">{item.shipment_number}</span>
                            <span className="text-slate-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-widest">{item.driver_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-900 dark:text-slate-100 font-bold text-xs truncate max-w-[150px]">{item.customer_name || '—'}</span>
                            {Number(item.total_selling_price_excl) > 0 && <span className="text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-bold tracking-widest">₹{Number(item.total_selling_price_excl).toLocaleString('en-IN')}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {Number(item.total_sqft_qty || 0) > 0
                                ? <span className="text-sky-600 dark:text-sky-400 font-black text-xs font-sans">{Number(item.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[9px] uppercase tracking-widest">Sqft</span></span>
                                : <span className="text-slate-900 dark:text-slate-100 font-black text-xs font-sans">{item.total_whole_qty} <span className="text-[9px] text-slate-400 uppercase tracking-widest">Whole</span></span>}
                            {Number(item.total_broken_qty) > 0 && <span className="text-rose-500 font-black text-xs font-sans">{item.total_broken_qty} <span className="text-[9px] text-rose-400 uppercase tracking-widest">Broken</span></span>}
                          </div>
                        </td>
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
                                promptApproveShipment('outbound-shipments', item);
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
                                promptRejectShipment('outbound-shipments', item);
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
                      <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] italic">{t('noPending')}</td></tr>
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('date')}</p>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{formatDateTime(item.dispatch_date).split(',')[0]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Customer</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 max-w-[120px] truncate">{item.customer_name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('dispatchNo')} & {t('driver')}</p>
                        <p className="text-sm font-black text-brand-secondary dark:text-indigo-400 mb-1">{item.shipment_number}</p>
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{item.driver_name || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Quantities</p>
                        {Number(item.total_sqft_qty || 0) > 0
                          ? <p className="text-xs font-black text-sky-600 dark:text-sky-400">{Number(item.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Sqft</p>
                          : <p className="text-xs font-black text-slate-900 dark:text-white">{item.total_whole_qty} Whole</p>}
                        {Number(item.total_broken_qty) > 0 && <p className="text-xs font-black text-rose-500">{item.total_broken_qty} Broken</p>}
                      </div>
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
                          promptApproveShipment('outbound-shipments', item);
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
                          promptRejectShipment('outbound-shipments', item);
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

        <section className={`space-y-6 ${mobileSection === 'changes' ? '' : 'hidden'}`}>
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

        {/* Branches: every site the company works from, with its geofence
            anchor. The same component renders in Attendance → Settings, so the
            two can never drift. onChanged refreshes the home-branch dropdowns
            on the user form and preview. */}
        {/* Money already on the books that looks wrong: a lorry charged more
            than once, and one tile carrying two product rows. Read-only - both
            widgets list what to go and check, and neither changes anything. */}
        <section id="freight-review" className={`space-y-6 ${mobileSection === 'freight' ? '' : 'hidden'}`}>
          {canViewAnalytics && (
            <FreightTripsWidget
              trips={reviewData?.freight?.trips || []}
              summary={reviewData?.freight?.summary || {}}
            />
          )}
        </section>

        <section id="duplicate-products" className={`space-y-6 ${mobileSection === 'duplicates' ? '' : 'hidden'}`}>
          {canViewAnalytics && (
            <DuplicateItemsWidget
              pairs={reviewData?.duplicateItems?.pairs || []}
              summary={reviewData?.duplicateItems?.summary || {}}
            />
          )}
        </section>

        <section id="branches" className={`space-y-6 ${mobileSection === 'branches' ? '' : 'hidden'}`}>
          {canManageUsers && <BranchesPanel onChanged={loadBranches} />}
        </section>

        <section id="users-contacts" className={`space-y-6 ${mobileSection === 'users' ? '' : 'hidden'}`}>
          <AnalyticsCard
            title={t('usersSalespersons')}
            subtitle={t('userManagementSubtitle')}
            insight={t('userManagementInsight')}
            showInsight={showInsights}
            topRight={
              canManageUsers && (
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
            {canManageUsers && showUserForm && (
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
                          <SelectItem value="read_only_admin">{language === 'hi' ? 'केवल-पढ़ने वाला एडमिन' : 'Read-Only Admin'}</SelectItem>
                          <SelectItem value="manager">{language === 'hi' ? 'मैनेजर' : 'Manager'}</SelectItem>
                          <SelectItem value="admin">{language === 'hi' ? 'सिस्टम एडमिन' : 'System Admin'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                        {language === 'hi' ? 'मुख्य शाखा' : 'Home Branch'}
                      </Label>
                      {/* Optional. Blank means no fixed branch, and the punch
                          location is resolved from GPS exactly as before. */}
                      <Select
                        value={createUserForm.watch('defaultLocationId') || 'none'}
                        onValueChange={(value) =>
                          createUserForm.setValue('defaultLocationId', value === 'none' ? '' : value, { shouldDirty: true })
                        }
                      >
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold">
                          <SelectValue placeholder={language === 'hi' ? 'कोई नहीं' : 'No home branch'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{language === 'hi' ? 'कोई मुख्य शाखा नहीं' : 'No home branch'}</SelectItem>
                          {branchOptions.map((branch) => (
                            <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
                          ))}
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
                        createUserForm.reset({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', department: 'Adhesive', status: 'active', division: '', defaultLocationId: '' });
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
                              promptToggleUser(u);
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
                                promptDeleteUser(u);
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
                      {u.role.replace(/_/g, ' ')}
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
                          promptToggleUser(u);
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

      {confirmModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 sm:p-8 animate-in zoom-in-95 duration-300">
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-2">{confirmModal.title}</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, open: false })}
                className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal({ ...confirmModal, open: false });
                }}
                className={`px-6 py-2.5 rounded-xl text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                  confirmModal.confirmVariant === 'rose' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' :
                  confirmModal.confirmVariant === 'amber' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20' :
                  'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

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
                          {
                            label: 'Home Branch',
                            value:
                              branchOptions.find((b) => String(b.id) === String(previewState.record?.default_location_id))?.name
                              || 'No home branch',
                          },
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
                          const sells = previewUserForm.watch('role') === 'salesperson' || previewUserForm.watch('canSell') === true;
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
                              canSell: previewUserForm.watch('canSell') === true,
                              defaultLocationId: previewUserForm.watch('defaultLocationId') || null,
                              ...(sells && { salary: salaryVal !== '' ? Number(salaryVal) : null }),
                              ...(sells && { monthlySalesGoal: goalVal !== '' ? Number(goalVal) : null }),
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
                                  <SelectItem value="read_only_admin">Read-Only Admin</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className={FORM_LABEL_CLASS}>Home Branch</Label>
                              {/* A soft default, never a restriction: it is the
                                  GPS-denied fallback, the kiosk's branch-first
                                  ordering, and per-branch reporting. */}
                              <Select
                                value={previewUserForm.watch('defaultLocationId') || 'none'}
                                onValueChange={(value) =>
                                  previewUserForm.setValue('defaultLocationId', value === 'none' ? '' : value, { shouldDirty: true })
                                }
                              >
                                <SelectTrigger className="h-11 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                  <SelectValue placeholder="No home branch" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No home branch</SelectItem>
                                  {branchOptions.map((branch) => (
                                    <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
                                  ))}
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

                          {/* Capability, not a role: the sales team always sells,
                              and an admin or manager can be flagged to sell too
                              without losing anything they already had. */}
                          {previewUserForm.watch('role') !== 'salesperson' && (
                            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={previewUserForm.watch('canSell') === true}
                                onChange={(e) => previewUserForm.setValue('canSell', e.target.checked, { shouldDirty: true })}
                                className="accent-brand-primary mt-0.5"
                              />
                              <span className="space-y-0.5">
                                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">Also sells</span>
                                <span className="block text-[10px] font-medium text-slate-400">
                                  Can be picked as the salesperson on a dispatch and sees their own performance. Keeps every existing permission.
                                </span>
                              </span>
                            </label>
                          )}

                          {(previewUserForm.watch('role') === 'salesperson' || previewUserForm.watch('canSell') === true) && (
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
                                canSell: Boolean(previewState.record?.can_sell),
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
                            onClick={() => promptToggleUser(previewState.record)}
                            disabled={actionLoading === `user-${previewState.record?.id}-update` || previewState.record?.is_active}
                            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            Restore Access
                          </button>
                          <button
                            type="button"
                            onClick={() => promptToggleUser(previewState.record)}
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
                        { label: 'Net Volume', value: formatShipmentVolume(previewState.items) },
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
                                    {formatLineVolume(item)}
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
