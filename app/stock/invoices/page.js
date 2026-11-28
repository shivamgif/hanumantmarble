'use client';

import { ListSkeleton } from '@/components/ui/skeleton';
import { TabTrack } from '../components/tab-track';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { lazyZodResolver } from '@/lib/forms/lazy-zod-resolver';
import { Ban, Check, CheckCircle2, Clock, Download, ExternalLink, FileBadge, FileKey, FileMinus, FilePlus, FileText, List, MoreHorizontal, Pencil, Plus, Search, Truck, Upload, X } from 'lucide-react';
import { inclusiveRate, isCharge, PROFORMA_VALIDITY_DAYS } from '@/lib/gst-invoice.mjs';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { canSell, getRoleFlags } from '@/lib/stock-roles.mjs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import PaginationControls from '@/components/ui/pagination-controls';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DEFAULT_PAGE_SIZE, getPageCount } from '@/lib/pagination';
import { InvoiceFormContent, formatRupees, invoiceStatus, useInvoiceText } from '../components/invoice-form';
import { StockToast } from '../components/stock-toast';
import { NoteSheet, NotesList, STATUS_TONE } from '../components/credit-notes';
import {
  CLASSES,
  createDispatchItemRow,
  fetchDashboardData,
  getJson,
  formatDateTime,
  PILL_BUTTON_CLASS,
  PILL_PRIMARY_BUTTON_CLASS,
  ERROR_BOX_CLASS,
  FORM_INPUT_CLASS,
  tabButtonClass, KBD_ON_PRIMARY_CLASS
} from '../lib/stock-utils';
import { PageHeader } from '../components/page-header';

const FILTERS = ['pending', 'needs_irn', 'approved', 'dispatched', 'all', 'creditNotes'];
const FILTER_ICONS = { pending: Clock, needs_irn: FileKey, approved: CheckCircle2, dispatched: Truck, all: List, creditNotes: FileMinus };

const invoiceItemRow = () => ({ ...createDispatchItemRow(), hsnCode: '', gstRate: '18' });

/** A new estimate: place of supply defaults to the business's own state and city; the seller to whoever raises it. */
const blankInvoice = ({ branch = null, stateCode = '', city = '', seller = null } = {}) => ({
  locationId: branch ? String(branch.id) : '',
  customerName: '',
  customerId: '',
  customerPhoneNumber: '',
  billToAddress: '',
  billToGstin: '',
  billToStateCode: stateCode || '',
  billToCity: city || '',
  billToPincode: '',
  shipToAddress: '',
  shipToPincode: '',
  sameAddress: true,
  salespersonName: seller?.name || '',
  salespersonUserId: seller ? String(seller.id) : '',
  referredByName: '',
  referredByPhone: '',
  notes: '',
  items: [invoiceItemRow()],
  charges: [],
  advanceAmount: '',
  advanceDate: '',
  advanceMode: '',
});

/** A saved estimate back into the form, for review. Lines are stored in the dispatch row shape. */
const estimateToForm = (invoice) => ({
  locationId: String(invoice.location_id),
  customerName: invoice.bill_to_name,
  customerPhoneNumber: invoice.bill_to_phone || '',
  billToAddress: invoice.bill_to_address || '',
  billToGstin: invoice.bill_to_gstin || '',
  billToStateCode: invoice.bill_to_state_code,
  billToCity: invoice.bill_to_city || '',
  billToPincode: invoice.bill_to_pincode || '',
  // No delivery address saved = delivered to the billing address.
  shipToAddress: invoice.ship_to_address || invoice.bill_to_address || '',
  shipToPincode: invoice.ship_to_pincode || invoice.bill_to_pincode || '',
  sameAddress: !invoice.ship_to_address
    || (invoice.ship_to_address === invoice.bill_to_address && (invoice.ship_to_pincode || invoice.bill_to_pincode) === invoice.bill_to_pincode),
  salespersonName: invoice.salesperson_name || '',
  salespersonUserId: invoice.salesperson_user_id != null ? String(invoice.salesperson_user_id) : '',
  referredByName: invoice.referred_by_name || '',
  referredByPhone: invoice.referred_by_phone || '',
  notes: invoice.notes || '',
  advanceAmount: Number(invoice.advance_amount) ? String(Number(invoice.advance_amount)) : '',
  advanceDate: invoice.advance_date_text || '',
  advanceMode: invoice.advance_mode || '',
  // Rates are stored without GST and typed with it: the box shows the price the
  // customer was quoted. On save the server applies each item's GST from its
  // purchase bill, so an estimate saved at 0% in the old form is corrected
  // and keeps its total — the GST is split out of the price, not added on.
  // Charges (cartage) are stored among the lines; the form keeps them in their own section.
  charges: invoice.items.filter(isCharge).map((item) => ({
    label: item.itemLabel,
    sacCode: item.hsnCode,
    amount: String(inclusiveRate(item.ratePerUnit, item.gstRate)),
    gstRate: '18',
  })),
  items: invoice.items.filter((item) => !isCharge(item)).map((item) => ({
    ...invoiceItemRow(),
    itemId: String(item.itemId),
    itemLabel: item.itemLabel,
    itemCategory: item.itemCategory,
    sellUnit: item.sellUnit,
    loadedWholeQty: item.itemCategory === 'tile' ? String(item.loadedWholeQty) : '',
    qtyBags: item.itemCategory === 'bag' ? String(item.qtyBags) : '',
    qtySqft: item.itemCategory === 'stone' ? String(item.qtySqft) : '',
    ratePerUnit: String(inclusiveRate(item.ratePerUnit, item.gstRate)),
    hsnCode: item.hsnCode || '',
    gstRate: '18',
  })),
});

/** The browser's local date, `days` from now, as YYYY-MM-DD. */
const localDate = (days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
};

async function readJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error || json.detail || 'Request failed'), { code: json.code });
  return json;
}

/**
 * Branches a sale can be raised from: active, linked to an active business.
 * Each carries its business's state so the form can preview CGST/SGST vs IGST.
 */
async function loadInvoiceBranches() {
  const [{ locations }, { businesses }] = await Promise.all([
    fetch('/api/stock/locations', { cache: 'no-store' }).then(readJson),
    fetch('/api/stock/businesses', { cache: 'no-store' }).then(readJson),
  ]);
  const byId = new Map(businesses.filter((b) => b.isActive).map((b) => [b.id, b]));
  return locations
    .filter((location) => location.isActive && byId.has(location.businessId))
    .map((location) => ({ ...location, stateCode: byId.get(location.businessId).stateCode, city: byId.get(location.businessId).city }));
}

/** The ⋯ menu on an invoice row. `items` may hold falsy entries; nothing to show, no button. */
function RowMenu({ items, busy, label }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  // modal={false}: a modal menu closing as a dialog opens leaves the page unclickable (Radix).
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={busy} aria-label={label} title={label} className={PILL_BUTTON_CLASS}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {shown.map(({ icon: Icon, label: itemLabel, onSelect, danger }) => (
          <DropdownMenuItem key={itemLabel} onSelect={onSelect} className={danger ? 'text-rose-600 dark:text-rose-400' : undefined}>
            <Icon className="mr-2 h-3.5 w-3.5" /> {itemLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function InvoicesPage() {
  const t = useInvoiceText();
  const { language } = useLanguage();
  const td = useCallback((key) => getTranslation(`stock.dashboard.${key}`, language), [language]);
  const { user } = useAuthUser();
  const { accessRole, accessUser } = useStockAccess(user);
  const isApprover = getRoleFlags(accessRole).canApprove;
  const canRaise = canSell(accessUser) || isApprover;
  // Mirrors the server: sellers withdraw their own pending estimate; another
  // approver may void an issued invoice that never shipped.
  // Mirrors the server: an estimate never issued as a proforma is deleted, not kept as cancelled.
  const deletable = (invoice) => invoice.status === 'pending' && !invoice.proforma_number;
  const canCancel = (invoice) => {
    if (invoice.dispatch_id) return false;
    const me = Number(accessUser?.id);
    const own = [invoice.created_by_user_id, invoice.salesperson_user_id].map(Number).includes(me);
    if (invoice.status === 'pending' && Number(invoice.created_by_user_id) === me) return true;
    return isApprover && !own && ['pending', 'approved'].includes(invoice.status);
  };
  // Mirrors the server: the seller edits their own estimate until a proforma
  // goes out; an approver corrects any pending estimate.
  const canEdit = (invoice) => invoice.status === 'pending' && !invoice.dispatch_id
    && (isApprover || (Number(invoice.created_by_user_id) === Number(accessUser?.id) && !invoice.proforma_number));
  // No self-approval: whoever raised or is credited with it needs another approver.
  const canApproveInvoice = (invoice) => isApprover && invoice.status === 'pending'
    && ![invoice.created_by_user_id, invoice.salesperson_user_id].map(Number).includes(Number(accessUser?.id));

  const [filter, setFilter] = useState('pending');
  // accessRole reads 'stock_maintainer' until access loads, hence the accessUser check.
  const notesOnly = Boolean(accessUser) && accessRole === 'stock_maintainer';
  useEffect(() => { if (notesOnly) setFilter('creditNotes'); }, [notesOnly]);
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  // Typing settles for 300 ms before it searches; a new query starts at page 1.
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [notes, setNotes] = useState([]);
  const [creditNoteRequest, setCreditNoteRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [reasonDialog, setReasonDialog] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [irnReport, setIrnReport] = useState(null);
  const importRef = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  // The estimate under review, or null for a new one.
  const [editing, setEditing] = useState(null);
  const [formSetup, setFormSetup] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({ resolver: lazyZodResolver('invoiceFormSchema'), defaultValues: blankInvoice() });
  const itemsFieldArray = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (!['all', 'creditNotes'].includes(filter)) params.set('status', filter);
    if (query) params.set('search', query);
    const url = `/api/stock/${filter === 'creditNotes' ? 'notes' : 'sales-invoices'}?${params}`;
    const show = (json) => {
      if (filter === 'creditNotes') setNotes(json.notes || []); else setInvoices(json.invoices || []);
      setTotal(json.total || 0);
    };
    // A revisit paints the last list at once; not after a save (refreshKey > 0).
    getJson(url, refreshKey ? undefined : (cached) => {
      if (cancelled) return;
      show(cached);
      setLoading(false);
    })
      .then((json) => {
        if (cancelled) return;
        show(json);
        setError('');
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter, refreshKey, page, pageSize, query]);

  // The form needs every item, the suggestions and the branches: the whole
  // dashboard payload. Fetched once, in the background as soon as someone who
  // can raise an estimate opens this page, so "New estimate" opens at once.
  const setupRequest = useRef(null);
  const loadFormSetup = useCallback(() => {
    setupRequest.current ||= Promise.all([fetchDashboardData(), loadInvoiceBranches()])
      .then(([dashboard, branches]) => ({ items: dashboard.activeItems || [], suggestions: dashboard.suggestions || {}, branches }))
      .catch((err) => { setupRequest.current = null; throw err; });
    return setupRequest.current;
  }, []);
  useEffect(() => {
    if (canRaise) loadFormSetup().then(setFormSetup).catch(() => {});
  }, [canRaise, loadFormSetup]);

  /** Opens the estimate form: blank for a new one, prefilled to review `invoice`. */
  const openEstimateForm = useCallback(async (invoice = null) => {
    setNotice(null);
    setEditing(invoice);
    setSheetOpen(true);
    try {
      const setup = formSetup || await loadFormSetup();
      setFormSetup(setup);
      if (invoice) {
        form.reset(estimateToForm(invoice));
      } else {
        const { branches, suggestions } = setup;
        // One business behind every branch (the usual case): its state and city are the default place of supply.
        const business = new Set(branches.map((branch) => branch.businessId)).size === 1 ? branches[0] : null;
        const seller = (suggestions.salespersons || []).find((person) => Number(person.id) === Number(accessUser?.id));
        // The seller's home branch (Attendance → Employees); without one, the
        // only showroom (sales are made where the customer saw the goods),
        // else the only branch.
        const home = branches.find((branch) => Number(branch.id) === Number(seller?.defaultLocationId));
        const showrooms = branches.filter((branch) => branch.locationType === 'showroom');
        form.reset(blankInvoice({
          branch: home || (showrooms.length === 1 ? showrooms[0] : null) || (branches.length === 1 ? branches[0] : null),
          stateCode: business?.stateCode,
          city: business?.city,
          seller,
        }));
      }
      if (!setup.branches.length) setNotice({ type: 'warning', message: t('branchHint') });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }, [form, formSetup, loadFormSetup, t, accessUser?.id]);
  const openNewEstimate = useCallback(() => openEstimateForm(), [openEstimateForm]);

  // ?new=estimate, from the topbar's "New estimate" command. Waits for the
  // access user so a viewer who cannot raise one just lands on the list.
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsNewEstimate = searchParams.get('new') === 'estimate';
  // ?creditNote=<invoiceId>[&shipment=<id>], from a dispatch's "Raise credit note";
  // ?purchaseNote=<purchaseId>, from a purchase's "Raise debit note".
  const creditNoteParam = searchParams.get('creditNote');
  const shipmentParam = searchParams.get('shipment');
  const purchaseNoteParam = searchParams.get('purchaseNote');
  useEffect(() => {
    if (!creditNoteParam && !purchaseNoteParam) return;
    setCreditNoteRequest(purchaseNoteParam
      ? { purchaseId: Number(purchaseNoteParam) }
      : { invoiceId: Number(creditNoteParam), shipmentId: Number(shipmentParam) || null });
    router.replace('/stock/invoices');
  }, [creditNoteParam, shipmentParam, purchaseNoteParam, router]);
  const handledNewRef = useRef(false);
  useEffect(() => {
    if (!wantsNewEstimate) { handledNewRef.current = false; return; }
    if (!accessUser || handledNewRef.current) return;
    handledNewRef.current = true;
    router.replace('/stock/invoices');
    if (canRaise) openNewEstimate();
  }, [wantsNewEstimate, accessUser, canRaise, openNewEstimate, router]);

  const act = useCallback(async (invoice, action, extra = {}) => {
    setBusyId(invoice.id);
    try {
      const json = await readJson(await fetch(`/api/stock/sales-invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      }));
      setToast({ type: 'success', message: json.message || t(action === 'reject' ? 'rejected' : 'cancelled') });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      // Over the customer's credit limit: the approver decides, with the numbers in front of them.
      if (err.code === 'credit_limit' && action === 'approve') {
        setReasonDialog({
          title: t('approve'),
          description: err.message,
          placeholder: t('notes'),
          confirmText: t('approve'),
          onSubmit: () => act(invoice, 'approve', { acknowledgeCreditLimit: true }),
        });
      } else {
        setToast({ type: 'error', message: err.message });
      }
    } finally {
      setBusyId(null);
    }
  }, [t]);

  // Bulk approve: the one-invoice approval, one after another, so each keeps its
  // own number lock, credit-limit check and no-self-approval rule. Anything
  // that stops is listed; over a credit limit, approve that one on its own.
  const [selected, setSelected] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // { done, of } while running; { approved, failed } after
  useEffect(() => { setSelected(new Set()); }, [filter, page, pageSize, query, refreshKey]);
  const toggleSelected = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const approveSelected = useCallback(async (chosen) => {
    const failed = [];
    for (const [index, invoice] of chosen.entries()) {
      setBulk({ done: index, of: chosen.length });
      try {
        await readJson(await fetch(`/api/stock/sales-invoices/${invoice.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        }));
      } catch (err) {
        failed.push(`${invoice.proforma_number || `${t('estimate')} #${invoice.id}`} · ${invoice.bill_to_name}: ${err.message}`);
      }
    }
    setBulk({ approved: chosen.length - failed.length, failed });
    setToast({ type: failed.length ? 'error' : 'success', message: t('bulkApproved', { count: chosen.length - failed.length, of: chosen.length }) });
    setRefreshKey((k) => k + 1);
  }, [t]);

  // New estimate → POST; review → PATCH update, then approve when asked to.
  const submitEstimate = useCallback(async (values, { approve = false } = {}) => {
    setSubmitting(true);
    setNotice(null);
    try {
      const json = await readJson(await fetch(editing ? `/api/stock/sales-invoices/${editing.id}` : '/api/stock/sales-invoices', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...values, action: 'update' } : values),
      }));
      setSheetOpen(false);
      if (approve) {
        await act(editing, 'approve');
      } else {
        setToast({ type: 'success', message: editing ? json.message : t('saved') });
        if (!editing) setFilter('pending');
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [t, editing, act]);

  const issueProforma = useCallback((invoice) => {
    const current = invoice.proforma_valid_until_text;
    setReasonDialog({
      title: invoice.proforma_number ? `${t('extendProforma')} · ${invoice.proforma_number}` : t('issueProforma'),
      description: t('issueProformaDesc', { days: PROFORMA_VALIDITY_DAYS }),
      placeholder: t('validUntil'),
      inputType: 'date',
      min: localDate(),
      initialValue: current && current >= localDate() ? current : localDate(PROFORMA_VALIDITY_DAYS),
      required: true,
      confirmText: invoice.proforma_number ? t('extendProforma') : t('issueProforma'),
      onSubmit: (validUntil) => act(invoice, 'proforma', { validUntil }),
    });
  }, [t, act]);

  const actNote = useCallback(async (note, action, extra = {}) => {
    setBusyId(`note-${note.id}`);
    try {
      const json = await readJson(await fetch(`/api/stock/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      }));
      setToast({ type: 'success', message: json.message });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setBusyId(null);
    }
  }, []);

  const downloadEinvoiceJson = useCallback(async () => {
    try {
      const { documents, problems } = await readJson(await fetch('/api/stock/sales-invoices/einvoice', { cache: 'no-store' }));
      setIrnReport({ problems, skipped: [] });
      if (!documents.length) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(documents, null, 2)], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `einvoice-${new Date().toISOString().slice(0, 10)}.json` });
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }, []);

  const importIrpResponse = useCallback(async (file) => {
    if (!file) return;
    try {
      const json = await readJson(await fetch('/api/stock/sales-invoices/einvoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: await file.text() }),
      }));
      setIrnReport({ problems: [], skipped: json.skipped.map((row) => `${row.docNo}: ${row.reason}`) });
      setToast({ type: 'success', message: t('irnImported', { count: json.updated.length }) });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }, [t]);

  const approvable = filter === 'creditNotes' ? [] : invoices.filter(canApproveInvoice);
  const bulkRunning = bulk != null && bulk.of != null;

  // Salespeople see estimates and invoices only: no IRN queue, no credit notes.
  // Stock maintainers land here only for supplier debit notes.
  const visibleFilters = notesOnly ? ['creditNotes'] : FILTERS.filter((key) => (key !== 'needs_irn' || isApprover)
    && (key !== 'creditNotes' || accessRole !== 'salesperson'));

  return (
    <div className={CLASSES.contentWrap}>
      <PageHeader
        icon={FileText}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={canRaise ? (
          <button type="button" onClick={openNewEstimate} className={PILL_PRIMARY_BUTTON_CLASS} aria-keyshortcuts="N">
            <Plus /> {t('newEstimate')} <kbd aria-hidden="true" className={KBD_ON_PRIMARY_CLASS}>N</kbd>
          </button>
        ) : null}
      />

      <TabTrack role="tablist">
        {visibleFilters.map((key) => { const Icon = FILTER_ICONS[key]; return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => { setFilter(key); setPage(1); }}
            className={tabButtonClass(filter === key, visibleFilters.length)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{t(key)}</span>
          </button>
        ); })}
      </TabTrack>

      {filter === 'needs_irn' && isApprover ? (
        <div className="glass-panel space-y-2 rounded-lg p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('irnSteps')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadEinvoiceJson} className={PILL_PRIMARY_BUTTON_CLASS}>
              <Download className="h-3.5 w-3.5" /> {t('downloadEinvoice')}
            </button>
            <button type="button" onClick={() => importRef.current?.click()} className={PILL_BUTTON_CLASS}>
              <Upload className="h-3.5 w-3.5" /> {t('importIrp')}
            </button>
            <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => importIrpResponse(e.target.files?.[0])} />
          </div>
          {irnReport && [...irnReport.problems, ...irnReport.skipped].length ? (
            <ul className="list-disc space-y-1 pl-6 text-xs text-amber-700 dark:text-amber-400">
              {[...irnReport.problems, ...irnReport.skipped].map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {bulk?.failed?.length ? (
        <div className="glass-panel space-y-1 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t('bulkNotApproved', { count: bulk.failed.length })}</p>
            <button type="button" onClick={() => setBulk(null)} aria-label={t('close')} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <ul className="list-disc space-y-1 pl-6 text-xs text-amber-700 dark:text-amber-400">
            {bulk.failed.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="text-xs text-slate-500">{t('bulkCreditHint')}</p>
        </div>
      ) : null}

      <section className="glass-panel overflow-hidden rounded-lg">
        {(
          <div className="border-b border-border px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t(filter === 'creditNotes' ? 'searchNotes' : 'searchInvoices')}
                aria-label={t(filter === 'creditNotes' ? 'searchNotes' : 'searchInvoices')}
                className={`${FORM_INPUT_CLASS} pl-10`}
              />
            </div>
          </div>
        )}
        {loading ? (
          <div className="p-4"><ListSkeleton rows={5} /></div>
        ) : error ? (
          <div className="p-4"><p role="alert" className={ERROR_BOX_CLASS}>{error}</p></div>
        ) : filter === 'creditNotes' ? (
          <NotesList
            notes={notes}
            accessUser={accessUser}
            isApprover={isApprover}
            busyId={busyId}
            onAct={actNote}
            setReasonDialog={setReasonDialog}
            t={t}
          />
        ) : !invoices.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noInvoices')}</p>
        ) : (
          <>
          {approvable.length ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm">
              <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Checkbox
                  checked={approvable.every((invoice) => selected.has(invoice.id))}
                  onChange={(event) => setSelected(event.target.checked ? new Set(approvable.map((invoice) => invoice.id)) : new Set())}
                  disabled={bulkRunning}
                />
                {t('selectAllApprovable', { count: approvable.length })}
              </label>
              {bulkRunning ? (
                <span className="text-xs text-slate-500 tabular-nums">{t('bulkApproving', { done: bulk.done + 1, of: bulk.of })}</span>
              ) : selected.size ? (
                <button
                  type="button"
                  className={PILL_PRIMARY_BUTTON_CLASS}
                  onClick={() => {
                    const chosen = approvable.filter((invoice) => selected.has(invoice.id));
                    setReasonDialog({
                      title: t('approveSelected', { count: chosen.length }),
                      description: t('approveSelectedDesc', {
                        count: chosen.length,
                        total: formatRupees(chosen.reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0)),
                      }),
                      placeholder: t('notes'),
                      confirmText: t('approve'),
                      onSubmit: () => approveSelected(chosen),
                    });
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> {t('approveSelected', { count: selected.size })}
                </button>
              ) : null}
            </div>
          ) : null}
          <ul className="divide-y divide-border">
            {invoices.map((invoice) => {
              const status = invoiceStatus(invoice);
              const busy = busyId === invoice.id;
              return (
                <li key={invoice.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
                  {approvable.length ? (
                    <Checkbox
                      aria-label={t('select')}
                      checked={selected.has(invoice.id)}
                      onChange={() => toggleSelected(invoice.id)}
                      disabled={bulkRunning || !canApproveInvoice(invoice)}
                      className={canApproveInvoice(invoice) ? undefined : 'invisible'}
                    />
                  ) : null}
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {invoice.invoice_number || invoice.proforma_number || `${t('estimate')} #${invoice.id}`}
                      </span>
                      <span className={`rounded-lg px-2 py-1 text-xs font-medium ${STATUS_TONE[status]}`}>{t(status)}</span>
                      {invoice.proforma_number && !invoice.invoice_number ? (
                        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                          {t('proforma')}{invoice.proforma_rev ? ` · ${t('rev')} ${invoice.proforma_rev}` : ''} · {t('validUntil')} {invoice.proforma_valid_until_text?.split('-').reverse().join('-')}
                        </span>
                      ) : null}
                      {invoice.proforma_number && invoice.invoice_number ? <span className="text-xs text-slate-500">{invoice.proforma_number}</span> : null}
                      {invoice.status === 'approved' && invoice.einvoice_status === 'pending' ? (
                        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">{t('irnPending')}</span>
                      ) : null}
                      {invoice.dispatch_number ? <span className="text-xs text-slate-500">{invoice.dispatch_number}</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{invoice.bill_to_name}</p>
                    <p className="text-xs text-slate-500">
                      {invoice.location_name} · {invoice.salesperson_name || '—'}
                      {invoice.referred_by_name ? ` · ${t('ref')}: ${invoice.referred_by_name}` : ''} · {formatDateTime(invoice.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatRupees(invoice.grand_total)}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/stock/invoices/${invoice.id}`} className={PILL_BUTTON_CLASS}>
                      <ExternalLink className="h-3.5 w-3.5" /> {t('open')}
                    </Link>
                    {/* One primary action on the row; the rest live in the ⋯ menu. */}
                    {canApproveInvoice(invoice) ? (
                      <button type="button" disabled={busy || bulkRunning} onClick={() => act(invoice, 'approve')} className={PILL_PRIMARY_BUTTON_CLASS}>
                        <Check className="h-3.5 w-3.5" /> {t('approve')}
                      </button>
                    ) : canEdit(invoice) ? (
                      <button type="button" disabled={busy} onClick={() => openEstimateForm(invoice)} className={PILL_BUTTON_CLASS}>
                        <Pencil className="h-3.5 w-3.5" /> {isApprover ? t('review') : t('edit')}
                      </button>
                    ) : null}
                    <RowMenu
                      busy={busy}
                      label={t('moreActions')}
                      items={[
                        canApproveInvoice(invoice) && canEdit(invoice) && {
                          icon: Pencil, label: t('review'), onSelect: () => openEstimateForm(invoice),
                        },
                        isApprover && invoice.status === 'pending' && !invoice.dispatch_id && {
                          icon: FileBadge,
                          label: invoice.proforma_number ? t('extendProforma') : t('issueProforma'),
                          onSelect: () => issueProforma(invoice),
                        },
                        isApprover && invoice.status === 'approved' && {
                          icon: FileMinus, label: t('creditNote'), onSelect: () => setCreditNoteRequest({ invoiceId: invoice.id }),
                        },
                        isApprover && invoice.status === 'approved' && {
                          icon: FilePlus, label: t('debitNote'), onSelect: () => setCreditNoteRequest({ invoiceId: invoice.id, kind: 'debit' }),
                        },
                        // Own estimates wait for another approver (server enforces it too).
                        canApproveInvoice(invoice) && {
                          icon: X,
                          label: deletable(invoice) ? t('rejectAndDelete') : t('reject'),
                          danger: true,
                          onSelect: () => setReasonDialog({
                            title: deletable(invoice) ? t('rejectAndDelete') : t('reject'),
                            description: `${invoice.bill_to_name} · ${formatRupees(invoice.grand_total)}${deletable(invoice) ? ` · ${t('deleteEstimateConfirm')}` : ''}`,
                            placeholder: t('rejectReason'),
                            required: true,
                            confirmText: deletable(invoice) ? t('rejectAndDelete') : t('reject'),
                            dismissText: t('goBack'),
                            tone: 'rose',
                            onSubmit: (reason) => act(invoice, 'reject', { reason }),
                          }),
                        },
                        canCancel(invoice) && {
                          icon: Ban,
                          label: deletable(invoice) ? t('deleteEstimate') : t('cancelInvoice'),
                          danger: true,
                          onSelect: () => setReasonDialog({
                            title: deletable(invoice) ? t('deleteEstimate') : t('cancelInvoice'),
                            description: deletable(invoice)
                              ? `${t('estimate')} #${invoice.id} · ${invoice.bill_to_name} · ${t('deleteEstimateConfirm')}`
                              : `${invoice.invoice_number || invoice.proforma_number || `${t('estimate')} #${invoice.id}`} · ${t('cancelConfirm')}`,
                            inputType: 'none',
                            confirmText: deletable(invoice) ? t('deleteEstimate') : t('cancelInvoice'),
                            dismissText: t('goBack'),
                            tone: 'rose',
                            onSubmit: () => act(invoice, 'cancel'),
                          }),
                        },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
        {!loading && !error ? (
          <div className="border-t border-border px-4 py-4">
            <PaginationControls
              page={page}
              pageCount={getPageCount(total, pageSize)}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              labels={{
                showing: td('paginationShowing'),
                of: td('paginationOf'),
                previous: td('paginationPrevious'),
                next: td('paginationNext'),
                page: td('paginationPage'),
              }}
            />
          </div>
        ) : null}
      </section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[80vw] lg:w-[70vw] xl:w-[62vw] md:max-w-[1100px]">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="text-base">
              {editing ? `${t('reviewEstimate')} · ${editing.proforma_number || `#${editing.id}`}` : t('newEstimate')}
            </SheetTitle>
            <SheetDescription className="text-xs">{editing ? t('reviewEstimateDesc') : t('newEstimateDesc')}</SheetDescription>
          </SheetHeader>
          {formSetup ? (
            <InvoiceFormContent
              form={form}
              itemsFieldArray={itemsFieldArray}
              onSubmit={(values) => submitEstimate(values)}
              onSubmitAndApprove={editing && canApproveInvoice(editing) ? (values) => submitEstimate(values, { approve: true }) : undefined}
              submitLabel={editing ? t('saveChanges') : undefined}
              submitting={submitting}
              notice={notice}
              allItems={formSetup.items}
              suggestions={formSetup.suggestions}
              branches={formSetup.branches}
              canPickSeller={accessRole !== 'salesperson'}
              onAddItem={() => itemsFieldArray.append(invoiceItemRow())}
              t={t}
              td={td}
              userRole={accessRole}
            />
          ) : notice ? (
            <p className="mt-6 text-sm text-rose-500">{notice.message}</p>
          ) : (
            <div className="mt-6"><ListSkeleton rows={6} /></div>
          )}
        </SheetContent>
      </Sheet>

      <NoteSheet
        request={creditNoteRequest}
        onClose={() => setCreditNoteRequest(null)}
        onSaved={(message) => {
          setCreditNoteRequest(null);
          setToast({ type: 'success', message });
          setFilter('creditNotes');
          setRefreshKey((k) => k + 1);
        }}
        t={t}
      />

      <ReasonDialog request={reasonDialog} onClose={() => setReasonDialog(null)} />
      <StockToast toast={toast} />
    </div>
  );
}
