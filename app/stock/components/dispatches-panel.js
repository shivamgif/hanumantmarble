'use client';

import { Fragment, useCallback, useState } from 'react';
import { BarChart3, Download, PackageCheck, Plus, Search, CalendarDays, ArrowDown, ArrowUp, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { DispatchFormContent } from './dispatch-form';
import { groupRowsByDay, formatTime } from '../lib/group-by-day.mjs';
import { ProductSalesReport } from './product-sales-report';
import { formatDateTime, getGeneratedByRoleLabel, getStatusVariant, CLASSES, FORM_INPUT_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS, exportToCSV, EXPORT_PERIOD_PRESETS, filterRowsByPeriod, invalidateShipmentCache, fetchAllPages, fetchDispatches } from '../lib/stock-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function DispatchesPanel({
  tabs,
  dispatchForm,
  dispatchItemsFieldArray,
  dispatchSheetOpen,
  setDispatchSheetOpen,
  dispatchAttachments,
  setDispatchAttachment,
  dispatchNotice,
  dispatchSubmitting,
  dispatchSearch,
  setDispatchSearch,
  dispatchSort,
  setDispatchSort,
  dispatchPagination,
  setDispatchPage,
  dispatchExpandedId,
  setDispatchExpandedId,
  highlightedShipmentKey,
  handleDispatchSubmit,
  handleDispatchInvalid,
  openShipmentPreview,
  onAddDispatchItem,
  activeItems,
  suggestions,
  t,
  tc,
  language,
  userRole,
  onNewDispatch,
  onEdit,
  pageSize,
  setPageSize,
  onRefreshData,
  dispatchFetching,
}) {
  const canEdit = ['admin', 'manager'].includes(userRole);
  const canCreateDispatch = ['admin', 'manager', 'stock_maintainer'].includes(userRole);
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [confirmPaidId, setConfirmPaidId] = useState(null);
  const [salesReportOpen, setSalesReportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleMarkAsPaid(id) {
    setConfirmPaidId(null);
    setMarkingPaidId(id);
    try {
      const res = await fetch(`/api/stock/outbound-shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_payment', paymentStatus: 'paid' }),
      });
      if (!res.ok) throw new Error('Failed to mark as paid');
      invalidateShipmentCache('dispatch', id);
      if (onRefreshData) await onRefreshData();
    } finally {
      setMarkingPaidId(null);
    }
  }

  const toggleSort = useCallback((key) => {
    setDispatchSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setDispatchSort]);
  // Newest first on the first press from any other sort, then it flips.
  const toggleDateSort = useCallback(() => {
    setDispatchSort((current) => ({
      key: 'datetime',
      direction: current.key === 'datetime' && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, [setDispatchSort]);

  // Sorted by date, rows are bunched per day so the date prints once; any other
  // sort keeps a date on every row, where a heading per row would only add noise.
  const dispatchGrouped = dispatchSort.key === 'datetime';
  const dispatchDateOf = (d) => d.dispatch_date || d.created_at;
  const dispatchGroups = dispatchGrouped
    ? groupRowsByDay(dispatchPagination.rows, dispatchDateOf, { today: tc.today, yesterday: tc.yesterday, locale: tc.dateLocale })
    : dispatchPagination.rows.map((d) => ({ key: d.id, label: formatDateTime(dispatchDateOf(d)), rows: [d] }));
  const dispatchWhen = (d) => (dispatchGrouped ? formatTime(dispatchDateOf(d), tc.dateLocale) : formatDateTime(dispatchDateOf(d)));
  // A phone number is something you tap to call, not a way into the preview.
  const phoneLink = (d) => (d.customer_phone_number ? (
    <a href={`tel:${d.customer_phone_number}`} onClick={(e) => e.stopPropagation()} className="tabular-nums text-slate-600 hover:underline dark:text-slate-300">{d.customer_phone_number}</a>
  ) : null);

  return (
    <div className="stock-tab-panel" key="stock-panel-dispatches">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        {tabs}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={PILL_BUTTON_CLASS}
            title="Export Dispatches to CSV"
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {EXPORT_PERIOD_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={async () => {
                const dateStr = new Date().toISOString().split('T')[0];
                const columns = [
                  { id: 'date', label: 'Date', value: (row) => formatDateTime(row.dispatch_date || row.created_at) },
                  { id: 'shipment', label: 'Dispatch No', value: (row) => row.shipment_number || '' },
                  { id: 'customer', label: 'Customer Name', value: (row) => row.customer_name || '' },
                  { id: 'phone', label: 'Customer Phone', value: (row) => row.customer_phone_number || '' },
                  { id: 'products', label: 'Products', value: (row) => row.product_names || row.product_skus || '' },
                  { id: 'totalBags', label: 'Total Bags', value: (row) => row.total_bag_qty || '0' },
                  { id: 'wholeTiles', label: 'Whole Tiles', value: (row) => row.total_whole_qty || '0' },
                  { id: 'totalSqft', label: 'Total Sqft', value: (row) => row.total_sqft_qty ? Number(row.total_sqft_qty).toFixed(3) : '0' },
                  { id: 'brokenTiles', label: 'Broken Tiles', value: (row) => row.total_broken_qty || '0' },
                  { id: 'returnWhole', label: 'Return Whole', value: (row) => row.total_return_whole_qty || '0' },
                  { id: 'returnBroken', label: 'Return Broken', value: (row) => row.total_return_broken_qty || '0' },
                  ...(canEdit ? [{ id: 'sellingPrice', label: 'Selling Price (Excl GST)', value: (row) => row.total_selling_price_excl || '0' }] : []),
                  { id: 'status', label: 'Status', value: (row) => row.status || '' },
                  { id: 'generatedBy', label: 'Generated By', value: (row) => row.generated_by || '' },
                ];
                setExporting(true);
                try {
                  const allRows = await fetchAllPages(
                    ({ page, pageSize: size }) => fetchDispatches({
                      page,
                      pageSize: size,
                      search: dispatchSearch,
                      sortKey: dispatchSort.key,
                      sortDir: dispatchSort.direction,
                    }),
                    'dispatches'
                  );
                  const rows = filterRowsByPeriod(allRows, ['dispatch_date', 'created_at'], preset.id);
                  const suffix = preset.id === 'all' ? '' : `_${preset.id}`;
                  exportToCSV(`Dispatches_Export${suffix}_${dateStr}.csv`, rows, columns);
                } finally {
                  setExporting(false);
                }
              }}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={() => setSalesReportOpen(true)}
        title="Monthly quantity sold per product, broken down by customer"
        className={PILL_BUTTON_CLASS}
      >
        <BarChart3 className="h-4 w-4" />
        Sales<span className="hidden sm:inline"> by Product</span>
      </button>
      <button
        type="button"
        onClick={onNewDispatch}
        disabled={!canCreateDispatch || dispatchSubmitting}
        title={!canCreateDispatch ? 'Your role cannot log new dispatches' : dispatchSubmitting ? 'Submission in progress...' : undefined}
        className={PILL_PRIMARY_BUTTON_CLASS}
      >
        <Plus className="h-4 w-4" />
        {t('newDispatch')}
      </button>
        </div>
        <Sheet open={dispatchSheetOpen} onOpenChange={setDispatchSheetOpen}>
          <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[80vw] lg:w-[70vw] xl:w-[62vw] 2xl:w-[55vw] md:max-w-[1100px]">
            <SheetHeader className="border-b border-border pb-4">
              <SheetTitle className="text-base">{t('logNewDispatch')}</SheetTitle>
              <SheetDescription className="text-xs">{t('logNewDispatchDesc')}</SheetDescription>
            </SheetHeader>
            <DispatchFormContent
              form={dispatchForm}
              itemsFieldArray={dispatchItemsFieldArray}
              attachments={dispatchAttachments}
              setAttachment={setDispatchAttachment}
              onSubmit={handleDispatchSubmit}
              onInvalid={handleDispatchInvalid}
              submitting={dispatchSubmitting}
              notice={dispatchNotice}
              allItems={activeItems}
              onAddItem={onAddDispatchItem}
              suggestions={suggestions}
              t={t}
              tc={tc}
              language={language}
              userRole={userRole}
            />
          </SheetContent>
        </Sheet>
      </div>
      <section id="dispatches" className="flex h-full flex-col overflow-hidden scroll-mt-6 glass-panel rounded-xl">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
          <div className="relative group min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={dispatchSearch}
              onChange={(event) => setDispatchSearch(event.target.value)}
              placeholder={tc.searchDispatches}
              className={`${FORM_INPUT_CLASS} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={toggleDateSort}
            aria-label={dispatchSort.key === 'datetime' && dispatchSort.direction === 'asc' ? tc.oldestFirst : tc.newestFirst}
            title={dispatchSort.key === 'datetime' && dispatchSort.direction === 'asc' ? tc.oldestFirst : tc.newestFirst}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium transition-colors hover:bg-muted ${dispatchGrouped ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">{dispatchSort.key === 'datetime' && dispatchSort.direction === 'asc' ? tc.oldestFirst : tc.newestFirst}</span>
            {dispatchGrouped ? (dispatchSort.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : null}
          </button>
        </div>
        <div className={`px-3 pb-1 md:hidden transition-opacity duration-200 ${dispatchFetching ? 'opacity-50' : ''}`}>
          {dispatchFetching && dispatchPagination.rows.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {dispatchGroups.map((group) => (
            <div key={group.key} className="-mx-3 border-t border-border first:border-t-0">
              {dispatchGrouped && (
                <h3 className="border-b border-border bg-muted px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{group.label}</h3>
              )}
              <div className="divide-y divide-border px-3">
              {group.rows.map((d) => {
                const expanded = dispatchExpandedId === d.id;
                return (
                  <article key={`dispatch-mobile-${d.id}`} className="px-1 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openShipmentPreview('dispatch', d)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Open dispatch ${d.shipment_number}`}
                      >
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{d.customer_name || d.shipment_number}</p>
                      </button>
                      <Badge variant={getStatusVariant(d.status)}>{d.status}</Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {phoneLink(d)}
                      {d.customer_phone_number ? <span aria-hidden="true">·</span> : null}
                      <span className="font-mono text-brand-primary">{d.shipment_number}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{dispatchWhen(d)}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {Number(d.total_sqft_qty || 0) > 0 && (
                        <span className="font-semibold text-slate-900 dark:text-slate-100" title={`${Number(d.total_sqft_qty)} Sqft`}>
                          {Number(d.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[11px] text-slate-500">Sqft</span>
                        </span>
                      )}
                      {Number(d.total_bag_qty || 0) > 0 && (
                        <span className="font-semibold text-slate-900 dark:text-slate-100" title={`${Number(d.total_bag_qty)} Bags`}>
                          {Number(d.total_bag_qty)} <span className="text-[11px] text-slate-500">Bags</span>
                        </span>
                      )}
                      {((Number(d.total_whole_qty || 0) > 0 || Number(d.total_broken_qty || 0) > 0) || (Number(d.total_bag_qty || 0) === 0 && Number(d.total_sqft_qty || 0) === 0)) && (
                        <span title={`${Number(d.total_whole_qty || 0)} Whole and ${Number(d.total_broken_qty || 0)} Broken Tiles`}>
                          {Number(d.total_whole_qty || 0)} <span className="text-[11px] text-slate-500">Whole</span> / {Number(d.total_broken_qty || 0)} <span className="text-[11px] text-slate-500">Broken</span>
                        </span>
                      )}
                      {canEdit && Number(d.total_selling_price_excl || 0) > 0 ? (
                        <span className="ml-auto font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{Number(d.total_selling_price_excl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          <span className="ml-1 text-[11px] font-bold opacity-70">/ ₹{(Number(d.total_selling_price_excl) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 0 })} GST</span>
                        </span>
                      ) : null}
                    </div>
                    {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0) ? (
                      <p className="text-xs text-rose-700 dark:text-rose-300 font-medium" title={`${Number(d.total_return_whole_qty || 0)} Whole and ${Number(d.total_return_broken_qty || 0)} Broken Tiles Returned`}>
                        Returned: {Number(d.total_return_whole_qty || 0)} Whole / {Number(d.total_return_broken_qty || 0)} Broken
                      </p>
                    ) : null}
                    {expanded ? (
                      <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <p className="truncate">{d.product_names || d.product_skus || '—'}</p>
                        <p>{t('by')}: {d.generated_by || '—'}</p>
                      </div>
                    ) : null}
                    {/* Money, payment state and every action share one wrapping row —
                        stacked they cost four extra lines on a phone. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      <span className={`capitalize ${d.payment_status === 'paid' ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {d.payment_status || 'Unpaid'}
                      </span>
                      {canEdit && d.approval_status === 'approved' && d.payment_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setConfirmPaidId(d.id); }}
                          disabled={markingPaidId === d.id}
                          className="rounded-lg border border-emerald-600/30 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
                        >
                          {markingPaidId === d.id ? '…' : 'Mark as Paid'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDispatchExpandedId((current) => (current === d.id ? null : d.id))}
                        className="ml-auto rounded-lg border border-border px-2 py-1 font-semibold text-muted-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700"
                        aria-label={expanded ? tc.collapse : tc.expand}
                      >
                        {expanded ? tc.collapse : tc.expand}
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="rounded-lg border border-border px-2 py-1 font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                          onClick={e => { e.stopPropagation(); onEdit(d); }}
                        >
                          {tc.edit}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] flex-1">
          <table className="hidden w-full text-left whitespace-nowrap md:table border-collapse">
            <thead className="sticky top-0 z-20 bg-muted">
              <tr className="border-b border-border">
                {[
                  { id: 'customer', label: tc.customer },
                  { id: 'products', label: tc.products },
                  { id: 'quantities', label: tc.quantities, align: 'right' },
                  ...(canEdit ? [{ id: 'price', label: tc.sellingPrice ?? 'Selling Price', align: 'right' }] : []),
                  ...(canEdit ? [{ id: 'payment', label: tc.payment ?? 'Payment' }] : []),
                  ...(canEdit ? [{ id: 'edit', label: tc.edit, align: 'right' }] : []),
                  { id: 'status', label: t('status') },
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => col.id !== 'return' && col.id !== 'edit' && col.id !== 'payment' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? toggleSort(col.id) : undefined}
                      className={`text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 group/th ${col.id !== 'return' && col.id !== 'edit' && col.id !== 'payment' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? 'hover:text-brand-primary' : 'cursor-default transition-all duration-300'}`}
                    >
                      {col.label}
                      {col.id !== 'return' && col.id !== 'edit' && col.id !== 'payment' && col.id !== 'generatedBy' && col.id !== 'approvedBy' && (
                        <span className={`h-1 w-1 rounded-full bg-brand-primary opacity-0 transition-opacity ${dispatchSort.key === col.id ? 'opacity-100' : 'group-hover/th:opacity-40'}`} />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dispatchGroups.map((group) => group.rows.map((d, index) => (
                <Fragment key={d.id}>
                {dispatchGrouped && index === 0 ? (
                  <tr className="bg-muted">
                    <td colSpan={canEdit ? 7 : 4} className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{group.label}</td>
                  </tr>
                ) : null}
                <tr
                  className={`group/row cursor-pointer transition-colors duration-100 hover:bg-muted/60 ${highlightedShipmentKey === `dispatch-${d.id}` ? 'bg-primary/10 ring-1 ring-primary/40' : ''}`}
                  onClick={() => openShipmentPreview('dispatch', d)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openShipmentPreview('dispatch', d);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-4 py-2.5">
                    <div className="max-w-[240px] truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={d.customer_name || ''}>{d.customer_name || '—'}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {phoneLink(d)}
                      {d.customer_phone_number ? <span aria-hidden="true">·</span> : null}
                      <span className="font-mono text-brand-primary group-hover/row:underline underline-offset-2">{d.shipment_number}</span>
                      <span aria-hidden="true">·</span><span className="tabular-nums">{dispatchWhen(d)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="max-w-[260px] truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={d.product_names || d.product_skus || ''}>{d.product_names || d.product_skus || '—'}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {Number(d.total_sqft_qty || 0) > 0 && (
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums" title={`${Number(d.total_sqft_qty)} Sqft`}>
                          {Number(d.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Sqft</span>
                        </div>
                      )}
                      {Number(d.total_bag_qty || 0) > 0 && (
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums" title={`${Number(d.total_bag_qty)} Bags`}>
                          {Number(d.total_bag_qty)} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Bags</span>
                        </div>
                      )}
                      {((Number(d.total_whole_qty || 0) > 0 || Number(d.total_broken_qty || 0) > 0) || (Number(d.total_bag_qty || 0) === 0 && Number(d.total_sqft_qty || 0) === 0)) && (
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums" title={`${Number(d.total_whole_qty || 0)} Whole and ${Number(d.total_broken_qty || 0)} Broken Tiles`}>
                          {Number(d.total_whole_qty || 0)} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mr-1">Whole</span>
                          <span className="mx-0.5 text-slate-300 dark:text-slate-600">/</span> {Number(d.total_broken_qty || 0)} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Broken</span>
                        </div>
                      )}
                      {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0) && (
                        <div className="text-[11px] font-medium text-rose-700 dark:text-rose-400 tabular-nums mt-0.5" title={`${Number(d.total_return_whole_qty || 0)} Whole and ${Number(d.total_return_broken_qty || 0)} Broken Tiles Returned`}>
                          {tc.return}: {Number(d.total_return_whole_qty || 0)} W / {Number(d.total_return_broken_qty || 0)} B
                        </div>
                      )}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      {Number(d.total_selling_price_excl || 0) > 0 ? (
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                            ₹{Number(d.total_selling_price_excl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            ₹{(Number(d.total_selling_price_excl) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 0 })} incl. GST
                          </div>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  {canEdit && (
                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                      <div className={`capitalize text-xs font-medium ${d.payment_status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                        {d.payment_status || 'Unpaid'}
                      </div>
                      {d.approval_status === 'approved' && d.payment_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setConfirmPaidId(d.id); }}
                          disabled={markingPaidId === d.id}
                          title="Mark this dispatch as fully paid"
                          className="mt-1.5 px-2 py-0.5 rounded-md border border-emerald-600/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {markingPaidId === d.id ? '…' : 'Mark as Paid'}
                        </button>
                      )}
                    </td>
                  )}
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-muted transition-colors"
                        onClick={e => {
                          e.stopPropagation();
                          onEdit(d);
                        }}
                      >
                        {tc.edit}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-2.5"><Badge variant={getStatusVariant(d.status)}>{d.status}</Badge></td>
                </tr>
                </Fragment>
              )))}
              {dispatchFetching ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 4} className="px-3 py-10">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  </td>
                </tr>
              ) : dispatchPagination.total === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 4} className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageCheck className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noDispatches}</p>
                      <button
                        type="button"
                        onClick={() => setDispatchSearch('')}
                        className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {tc.clearFilters}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border">
          <PaginationControls
            page={dispatchPagination.page}
            pageCount={dispatchPagination.pageCount}
            total={dispatchPagination.total}
            pageSize={pageSize}
            onPageChange={setDispatchPage}
            onPageSizeChange={setPageSize}
            labels={{
              showing: tc.paginationShowing,
              of: tc.paginationOf,
              previous: tc.paginationPrevious,
              next: tc.paginationNext,
              page: tc.paginationPage,
            }}
          />
        </div>
      </section>

      <ProductSalesReport open={salesReportOpen} onOpenChange={setSalesReportOpen} />

      <AlertDialog open={!!confirmPaidId} onOpenChange={(open) => { if (!open) setConfirmPaidId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the dispatch as fully paid. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmPaidId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleMarkAsPaid(confirmPaidId)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
