'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Check, Download, ExternalLink, FileBadge, FileMinus, FilePlus, FileText, Pencil, Plus, Upload, X } from 'lucide-react';
import { isCharge, PROFORMA_VALIDITY_DAYS } from '@/lib/gst-invoice.mjs';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { canSell, getRoleFlags } from '@/lib/stock-roles.mjs';
import { invoiceFormSchema } from '@/lib/forms/stock-forms';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { InvoiceFormContent, formatRupees, invoiceStatus, useInvoiceText } from '../components/invoice-form';
import { StockToast } from '../components/stock-toast';
import { NoteSheet, NotesList, STATUS_TONE } from '../components/credit-notes';
import {
  CLASSES,
  createDispatchItemRow,
  fetchDashboardData,
  formatDateTime,
  PILL_BUTTON_CLASS,
  PILL_PRIMARY_BUTTON_CLASS,
  ERROR_BOX_CLASS,
  tabButtonClass,
  tabTrackClass,
} from '../lib/stock-utils';
import { PageHeader } from '../components/page-header';

const FILTERS = ['pending', 'needs_irn', 'approved', 'dispatched', 'all', 'creditNotes'];

const invoiceItemRow = () => ({ ...createDispatchItemRow(), hsnCode: '', gstRate: '18' });

/** A new estimate: place of supply defaults to the business's own state and city; the seller to whoever raises it. */
const blankInvoice = ({ branch = null, stateCode = '', city = '', seller = null } = {}) => ({
  locationId: branch ? String(branch.id) : '',
  customerName: '',
  customerPhoneNumber: '',
  billToAddress: '',
  billToGstin: '',
  billToStateCode: stateCode || '',
  billToCity: city || '',
  billToPincode: '',
  shipToAddress: '',
  shipToPincode: '',
  salespersonName: seller?.name || '',
  salespersonUserId: seller ? String(seller.id) : '',
  referredByName: '',
  referredByPhone: '',
  notes: '',
  items: [invoiceItemRow()],
  charges: [],
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
  shipToAddress: invoice.ship_to_address || '',
  shipToPincode: invoice.ship_to_pincode || '',
  salespersonName: invoice.salesperson_name || '',
  salespersonUserId: invoice.salesperson_user_id != null ? String(invoice.salesperson_user_id) : '',
  referredByName: invoice.referred_by_name || '',
  referredByPhone: invoice.referred_by_phone || '',
  notes: invoice.notes || '',
  // Charges (cartage) are stored among the lines; the form keeps them in their own section.
  charges: invoice.items.filter(isCharge).map((item) => ({
    label: item.itemLabel,
    sacCode: item.hsnCode,
    amount: String(item.ratePerUnit),
    gstRate: String(item.gstRate ?? 18),
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
    ratePerUnit: String(item.ratePerUnit),
    hsnCode: item.hsnCode || '',
    gstRate: String(item.gstRate ?? 18),
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

  const form = useForm({ resolver: zodResolver(invoiceFormSchema), defaultValues: blankInvoice() });
  const itemsFieldArray = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = filter === 'creditNotes' ? '/api/stock/notes'
      : `/api/stock/sales-invoices${filter === 'all' ? '' : `?status=${filter}`}`;
    fetch(url, { cache: 'no-store' })
      .then(readJson)
      .then((json) => {
        if (cancelled) return;
        if (filter === 'creditNotes') setNotes(json.notes || []); else setInvoices(json.invoices || []);
        setError('');
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter, refreshKey]);

  /** Opens the estimate form: blank for a new one, prefilled to review `invoice`. */
  const openEstimateForm = useCallback(async (invoice = null) => {
    setNotice(null);
    setEditing(invoice);
    setSheetOpen(true);
    try {
      const setup = formSetup || await Promise.all([fetchDashboardData(), loadInvoiceBranches()])
        .then(([dashboard, branches]) => ({ items: dashboard.activeItems || [], suggestions: dashboard.suggestions || {}, branches }));
      setFormSetup(setup);
      if (invoice) {
        form.reset(estimateToForm(invoice));
      } else {
        const { branches, suggestions } = setup;
        // One business behind every branch (the usual case): its state and city are the default place of supply.
        const business = new Set(branches.map((branch) => branch.businessId)).size === 1 ? branches[0] : null;
        const seller = (suggestions.salespersons || []).find((person) => Number(person.id) === Number(accessUser?.id));
        form.reset(blankInvoice({
          branch: branches.length === 1 ? branches[0] : null,
          stateCode: business?.stateCode,
          city: business?.city,
          seller,
        }));
      }
      if (!setup.branches.length) setNotice({ type: 'warning', message: t('branchHint') });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }, [form, formSetup, t, accessUser?.id]);
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
          <button type="button" onClick={openNewEstimate} className={PILL_PRIMARY_BUTTON_CLASS}>
            <Plus /> {t('newEstimate')}
          </button>
        ) : null}
      />

      <div className={tabTrackClass(visibleFilters.length)} role="tablist">
        {visibleFilters.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={tabButtonClass(filter === key, visibleFilters.length)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {filter === 'needs_irn' && isApprover ? (
        <div className="glass-panel space-y-2 rounded-xl p-4">
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
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
              {[...irnReport.problems, ...irnReport.skipped].map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="glass-panel overflow-hidden rounded-xl">
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 skeleton rounded-lg" />)}</div>
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
          <ul className="divide-y divide-border">
            {invoices.map((invoice) => {
              const status = invoiceStatus(invoice);
              const busy = busyId === invoice.id;
              return (
                <li key={invoice.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {invoice.invoice_number || invoice.proforma_number || `${t('estimate')} #${invoice.id}`}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>{t(status)}</span>
                      {invoice.proforma_number && !invoice.invoice_number ? (
                        <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">
                          {t('proforma')}{invoice.proforma_rev ? ` · ${t('rev')} ${invoice.proforma_rev}` : ''} · {t('validUntil')} {invoice.proforma_valid_until_text?.split('-').reverse().join('-')}
                        </span>
                      ) : null}
                      {invoice.proforma_number && invoice.invoice_number ? <span className="text-xs text-slate-500">{invoice.proforma_number}</span> : null}
                      {invoice.status === 'approved' && invoice.einvoice_status === 'pending' ? (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">{t('irnPending')}</span>
                      ) : null}
                      {invoice.dispatch_number ? <span className="text-xs text-slate-500">{invoice.dispatch_number}</span> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{invoice.bill_to_name}</p>
                    <p className="text-xs text-slate-500">
                      {invoice.location_name} · {invoice.salesperson_name || '—'}
                      {invoice.referred_by_name ? ` · ${t('ref')}: ${invoice.referred_by_name}` : ''} · {formatDateTime(invoice.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatRupees(invoice.grand_total)}</span>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/stock/invoices/${invoice.id}`} className={PILL_BUTTON_CLASS}>
                      <ExternalLink className="h-3.5 w-3.5" /> {t('open')}
                    </Link>
                    {canEdit(invoice) ? (
                      <button type="button" disabled={busy} onClick={() => openEstimateForm(invoice)} className={PILL_BUTTON_CLASS}>
                        <Pencil className="h-3.5 w-3.5" /> {isApprover ? t('review') : t('edit')}
                      </button>
                    ) : null}
                    {isApprover && invoice.status === 'pending' && !invoice.dispatch_id ? (
                      <button type="button" disabled={busy} onClick={() => issueProforma(invoice)} className={PILL_BUTTON_CLASS}>
                        <FileBadge className="h-3.5 w-3.5" /> {invoice.proforma_number ? t('extendProforma') : t('proforma')}
                      </button>
                    ) : null}
                    {/* Own estimates wait for another approver (server enforces it too). */}
                    {canApproveInvoice(invoice) ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => act(invoice, 'approve')} className={PILL_PRIMARY_BUTTON_CLASS}>
                          <Check className="h-3.5 w-3.5" /> {t('approve')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={PILL_BUTTON_CLASS}
                          onClick={() => setReasonDialog({
                            title: t('reject'),
                            description: `${invoice.bill_to_name} · ${formatRupees(invoice.grand_total)}`,
                            placeholder: t('rejectReason'),
                            required: true,
                            confirmText: t('reject'),
                            tone: 'rose',
                            onSubmit: (reason) => act(invoice, 'reject', { reason }),
                          })}
                        >
                          <X className="h-3.5 w-3.5" /> {t('reject')}
                        </button>
                      </>
                    ) : null}
                    {isApprover && invoice.status === 'approved' ? (
                      <>
                        <button type="button" onClick={() => setCreditNoteRequest({ invoiceId: invoice.id })} className={PILL_BUTTON_CLASS}>
                          <FileMinus className="h-3.5 w-3.5" /> {t('creditNote')}
                        </button>
                        <button type="button" onClick={() => setCreditNoteRequest({ invoiceId: invoice.id, kind: 'debit' })} className={PILL_BUTTON_CLASS}>
                          <FilePlus className="h-3.5 w-3.5" /> {t('debitNote')}
                        </button>
                      </>
                    ) : null}
                    {canCancel(invoice) ? (
                      <button
                        type="button"
                        disabled={busy}
                        className={PILL_BUTTON_CLASS}
                        onClick={() => setReasonDialog({
                          title: t('cancel'),
                          description: `${invoice.invoice_number || `${t('estimate')} #${invoice.id}`} · ${t('cancelConfirm')}`,
                          placeholder: t('notes'),
                          confirmText: t('cancel'),
                          tone: 'rose',
                          onSubmit: () => act(invoice, 'cancel'),
                        })}
                      >
                        <Ban className="h-3.5 w-3.5" /> {t('cancel')}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
            <p className="mt-6 text-sm text-slate-400">…</p>
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
      <StockToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
