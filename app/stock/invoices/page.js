'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Check, Download, ExternalLink, FileText, Plus, Upload, X } from 'lucide-react';
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
import {
  CLASSES,
  createDispatchItemRow,
  fetchDashboardData,
  formatDateTime,
  PILL_BUTTON_CLASS,
  PILL_PRIMARY_BUTTON_CLASS,
} from '../lib/stock-utils';

const FILTERS = ['pending', 'needs_irn', 'approved', 'dispatched', 'all'];

const STATUS_TONE = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  dispatched: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  cancelled: 'bg-slate-500/10 text-slate-500',
};

const invoiceItemRow = () => ({ ...createDispatchItemRow(), hsnCode: '', gstRate: '18' });

const blankInvoice = (branch) => ({
  locationId: branch ? String(branch.id) : '',
  customerName: '',
  customerPhoneNumber: '',
  billToAddress: '',
  billToGstin: '',
  billToStateCode: branch?.stateCode || '',
  billToCity: '',
  billToPincode: '',
  shipToAddress: '',
  shipToPincode: '',
  salespersonName: '',
  salespersonUserId: '',
  notes: '',
  items: [invoiceItemRow()],
});

async function readJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || json.detail || 'Request failed');
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
    .map((location) => ({ ...location, stateCode: byId.get(location.businessId).stateCode }));
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

  const [filter, setFilter] = useState('pending');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [reasonDialog, setReasonDialog] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [irnReport, setIrnReport] = useState(null);
  const importRef = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [formSetup, setFormSetup] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({ resolver: zodResolver(invoiceFormSchema), defaultValues: blankInvoice() });
  const itemsFieldArray = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/stock/sales-invoices${filter === 'all' ? '' : `?status=${filter}`}`, { cache: 'no-store' })
      .then(readJson)
      .then((json) => { if (!cancelled) { setInvoices(json.invoices || []); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter, refreshKey]);

  const openNewEstimate = useCallback(async () => {
    setNotice(null);
    setSheetOpen(true);
    try {
      const setup = formSetup || await Promise.all([fetchDashboardData(), loadInvoiceBranches()])
        .then(([dashboard, branches]) => ({ items: dashboard.activeItems || [], suggestions: dashboard.suggestions || {}, branches }));
      setFormSetup(setup);
      form.reset(blankInvoice(setup.branches.length === 1 ? setup.branches[0] : null));
      if (!setup.branches.length) setNotice({ type: 'warning', message: t('branchHint') });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }, [form, formSetup, t]);

  const submitEstimate = useCallback(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      await readJson(await fetch('/api/stock/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }));
      setSheetOpen(false);
      setToast({ type: 'success', message: t('saved') });
      setFilter('pending');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [t]);

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
      setToast({ type: 'error', message: err.message });
    } finally {
      setBusyId(null);
    }
  }, [t]);

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

  return (
    <div className={CLASSES.contentWrap}>
      <div className={`${CLASSES.topCard} flex flex-wrap items-start justify-between gap-4`}>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <FileText className="h-5 w-5 text-brand-primary" /> {t('title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        {canRaise ? (
          <button type="button" onClick={openNewEstimate} className={PILL_PRIMARY_BUTTON_CLASS}>
            <Plus className="h-3.5 w-3.5" /> {t('newEstimate')}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.filter((key) => key !== 'needs_irn' || isApprover).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={filter === key ? PILL_PRIMARY_BUTTON_CLASS : PILL_BUTTON_CLASS}
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
          <p className="py-12 text-center text-sm text-slate-400">…</p>
        ) : error ? (
          <p className="py-12 text-center text-sm text-rose-500">{error}</p>
        ) : !invoices.length ? (
          <p className="py-12 text-center text-sm text-slate-400">{t('noInvoices')}</p>
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
                        {invoice.invoice_number || `${t('estimate')} #${invoice.id}`}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>{t(status)}</span>
                      {invoice.status === 'approved' && invoice.einvoice_status === 'pending' ? (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">{t('irnPending')}</span>
                      ) : null}
                      {invoice.dispatch_number ? <span className="text-xs text-slate-500">{invoice.dispatch_number}</span> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{invoice.bill_to_name}</p>
                    <p className="text-xs text-slate-500">
                      {invoice.location_name} · {invoice.salesperson_name || '—'} · {formatDateTime(invoice.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatRupees(invoice.grand_total)}</span>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/stock/invoices/${invoice.id}`} className={PILL_BUTTON_CLASS}>
                      <ExternalLink className="h-3.5 w-3.5" /> {t('open')}
                    </Link>
                    {/* Own estimates wait for another approver (server enforces it too). */}
                    {isApprover && invoice.status === 'pending'
                      && ![invoice.created_by_user_id, invoice.salesperson_user_id].map(Number).includes(Number(accessUser?.id)) ? (
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
            <SheetTitle className="text-base">{t('newEstimate')}</SheetTitle>
            <SheetDescription className="text-xs">{t('newEstimateDesc')}</SheetDescription>
          </SheetHeader>
          {formSetup ? (
            <InvoiceFormContent
              form={form}
              itemsFieldArray={itemsFieldArray}
              onSubmit={submitEstimate}
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

      <ReasonDialog request={reasonDialog} onClose={() => setReasonDialog(null)} />
      <StockToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
