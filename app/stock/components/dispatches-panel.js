'use client';

import { useCallback, useState } from 'react';
import { Download, ChevronRight, PackageCheck, Plus, Search, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { DispatchFormContent } from './dispatch-form';
import { formatDateTime, getGeneratedByRoleLabel, getStatusVariant, CLASSES, FORM_INPUT_CLASS, exportToCSV, EXPORT_PERIOD_PRESETS, filterRowsByPeriod, invalidateShipmentCache } from '../lib/stock-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function DispatchesPanel({
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

  return (
    <div className="stock-tab-panel" key="stock-panel-dispatches">
      <div className="mb-6 flex items-center justify-end gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-200/60 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Export Dispatches to CSV"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {EXPORT_PERIOD_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => {
                  const dateStr = new Date().toISOString().split('T')[0];
                  const columns = [
                    { id: 'date', label: 'Date', value: (row) => formatDateTime(row.dispatch_date || row.created_at) },
                    { id: 'shipment', label: 'Dispatch No', value: (row) => row.shipment_number || '' },
                    { id: 'customer', label: 'Customer Name', value: (row) => row.customer_name || '' },
                    { id: 'phone', label: 'Customer Phone', value: (row) => row.customer_phone_number || '' },
                    { id: 'products', label: 'Products', value: (row) => row.product_names || row.product_skus || '' },
                    { id: 'totalBags', label: 'Total Bags', value: (row) => row.total_bag_qty || '0' },
                    { id: 'wholeTiles', label: 'Whole Tiles', value: (row) => row.total_whole_qty || '0' },
                    { id: 'brokenTiles', label: 'Broken Tiles', value: (row) => row.total_broken_qty || '0' },
                    { id: 'returnWhole', label: 'Return Whole', value: (row) => row.total_return_whole_qty || '0' },
                    { id: 'returnBroken', label: 'Return Broken', value: (row) => row.total_return_broken_qty || '0' },
                    ...(canEdit ? [{ id: 'sellingPrice', label: 'Selling Price (Excl GST)', value: (row) => row.total_selling_price_excl || '0' }] : []),
                    { id: 'status', label: 'Status', value: (row) => row.status || '' },
                    { id: 'generatedBy', label: 'Generated By', value: (row) => row.generated_by || '' },
                  ];
                  const rows = filterRowsByPeriod(dispatchPagination.allRows, ['dispatch_date', 'created_at'], preset.id);
                  const suffix = preset.id === 'all' ? '' : `_${preset.id}`;
                  exportToCSV(`Dispatches_Export${suffix}_${dateStr}.csv`, rows, columns);
                }}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onNewDispatch}
          disabled={!canCreateDispatch}
          title={!canCreateDispatch ? 'Salesperson role cannot log new dispatches' : undefined}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t('newDispatch')}
        </button>
      </div>
      <section id="dispatches" className="flex h-full flex-col overflow-hidden scroll-mt-6 glass-panel rounded-2xl sm:rounded-3xl border border-slate-200/60 dark:border-white/5 shadow-2xl transition-all duration-500">
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-200/60 bg-slate-50/40 dark:bg-slate-900/40 px-6 py-5">
          <div className="space-y-1.5">
            <nav className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.4em] text-slate-400">
              <span>{tc.inventoryHub}</span>
              <ChevronRight className="h-2.5 w-2.5 opacity-50" />
              <span className="text-brand-primary">{tc.dispatches}</span>
            </nav>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{t('dispatches')}</h3>
              <span className="rounded-full bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest tabular-nums text-brand-primary shadow-sm">
                {dispatchPagination.total} {t('items')}
              </span>
            </div>
          </div>
          <Sheet open={dispatchSheetOpen} onOpenChange={setDispatchSheetOpen}>
            <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
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
        <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/50 px-3 py-2.5 backdrop-blur-md dark:bg-slate-900/50">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-brand-primary" />
            <input
              type="search"
              value={dispatchSearch}
              onChange={(event) => setDispatchSearch(event.target.value)}
              placeholder={tc.searchDispatches}
              className={`${FORM_INPUT_CLASS} pl-11`}
            />
          </div>
        </div>
        <div className={`space-y-4 p-3 md:hidden transition-opacity duration-200 ${dispatchFetching ? 'opacity-50' : ''}`}>
          {dispatchFetching && dispatchPagination.rows.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {dispatchPagination.rows.map((d) => {
            const expanded = dispatchExpandedId === d.id;
            return (
              <article key={`dispatch-mobile-${d.id}`} className="glass-panel rounded-2xl border border-white/5 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openShipmentPreview('dispatch', d)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open dispatch ${d.shipment_number}`}
                  >
                    <p className="break-all font-mono text-xs font-semibold text-primary dark:text-orange-400">{d.shipment_number}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(d.dispatch_date || d.created_at)}</p>
                  </button>
                  <Badge variant={getStatusVariant(d.status)}>{d.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {d.customer_name || '—'}
                  {d.customer_phone_number ? ` • ${d.customer_phone_number}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {Number(d.total_bag_qty || 0) > 0 && (
                    <span className="text-amber-500 font-black" title={`${Number(d.total_bag_qty)} Bags`}>
                      {Number(d.total_bag_qty)} <span className="text-[10px] uppercase text-amber-400/70">Bags</span>
                    </span>
                  )}
                  {((Number(d.total_whole_qty || 0) > 0 || Number(d.total_broken_qty || 0) > 0) || Number(d.total_bag_qty || 0) === 0) && (
                    <span title={`${Number(d.total_whole_qty || 0)} Whole and ${Number(d.total_broken_qty || 0)} Broken Tiles`}>
                      {Number(d.total_whole_qty || 0)} <span className="text-[10px] uppercase text-slate-400">Whole</span> / {Number(d.total_broken_qty || 0)} <span className="text-[10px] uppercase text-slate-400">Broken</span>
                    </span>
                  )}
                </div>
                {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0) ? (
                  <p className="text-xs text-rose-700 dark:text-rose-300 font-medium" title={`${Number(d.total_return_whole_qty || 0)} Whole and ${Number(d.total_return_broken_qty || 0)} Broken Tiles Returned`}>
                    Returned: {Number(d.total_return_whole_qty || 0)} Whole / {Number(d.total_return_broken_qty || 0)} Broken
                  </p>
                ) : null}
                {canEdit && Number(d.total_selling_price_excl || 0) > 0 ? (
                  <p className="mt-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                    ₹{Number(d.total_selling_price_excl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    <span className="ml-1 text-[10px] font-bold opacity-70">/ ₹{(Number(d.total_selling_price_excl) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 0 })} GST</span>
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{tc.payment}:</span>{' '}
                  <span className={`capitalize ${d.payment_status === 'paid' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>{d.payment_status || 'Unpaid'}</span>
                </p>
                {canEdit && d.approval_status === 'approved' && d.payment_status !== 'paid' && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setConfirmPaidId(d.id); }}
                    disabled={markingPaidId === d.id}
                    className="mt-1 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {markingPaidId === d.id ? '…' : 'Mark as Paid'}
                  </button>
                )}
                {expanded ? (
                  <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <p className="truncate">{d.product_names || d.product_skus || '—'}</p>
                    <p>{t('by')}: {d.generated_by || '—'}</p>
                  </div>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDispatchExpandedId((current) => (current === d.id ? null : d.id))}
                    className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700"
                    aria-label={expanded ? tc.collapse : tc.expand}
                  >
                    {expanded ? tc.collapse : tc.expand}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
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
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] no-scrollbar flex-1">
          <table className="hidden w-full text-left whitespace-nowrap md:table border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
              <tr className="border-b border-slate-200/60 dark:border-white/5">
                {[
                  { id: 'datetime', label: tc.datetime },
                  { id: 'shipment', label: t('dispatchNo') },
                  { id: 'customer', label: tc.customer },
                  { id: 'products', label: tc.products },
                  { id: 'quantities', label: tc.quantities, align: 'right' },
                  ...(canEdit ? [{ id: 'price', label: tc.sellingPrice ?? 'Selling Price', align: 'right' }] : []),
                  ...(canEdit ? [{ id: 'payment', label: tc.payment ?? 'Payment' }] : []),
                  ...(canEdit ? [{ id: 'edit', label: tc.edit, align: 'right' }] : []),
                  { id: 'status', label: t('status') },
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => col.id !== 'customer' && col.id !== 'return' && col.id !== 'edit' && col.id !== 'payment' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? toggleSort(col.id) : undefined}
                      className={`text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-2 group/th ${col.id !== 'customer' && col.id !== 'return' && col.id !== 'edit' && col.id !== 'payment' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? 'hover:text-brand-primary' : 'cursor-default transition-all duration-300'}`}
                    >
                      {col.label}
                      {col.id !== 'customer' && col.id !== 'return' && col.id !== 'edit' && col.id !== 'payment' && col.id !== 'generatedBy' && col.id !== 'approvedBy' && (
                        <span className={`h-1 w-1 rounded-full bg-brand-primary opacity-0 transition-opacity ${dispatchSort.key === col.id ? 'opacity-100' : 'group-hover/th:opacity-40'}`} />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {dispatchPagination.rows.map((d) => (
                <tr
                  key={d.id}
                  className={`group/row cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 ${highlightedShipmentKey === `dispatch-${d.id}` ? 'bg-primary/10 ring-1 ring-primary/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'}`}
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
                  <td className="px-4 py-3 text-[11px] text-muted-foreground tabular-nums">{formatDateTime(d.dispatch_date || d.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] font-black tracking-tight text-brand-primary dark:text-orange-400 bg-brand-primary/5 px-2 py-1 rounded-md border border-brand-primary/20 transition-colors group-hover/row:bg-brand-primary/10">
                      {d.shipment_number}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    <div className="font-black text-slate-700 dark:text-slate-300">{d.customer_name || '—'}</div>
                    {d.customer_phone_number ? <div className="text-[9px] font-bold opacity-60 tabular-nums">{d.customer_phone_number}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-xs font-black text-slate-900 dark:text-white" title={d.product_names || d.product_skus || ''}>{d.product_names || d.product_skus || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {Number(d.total_bag_qty || 0) > 0 && (
                        <div className="text-xs font-black text-amber-500 tabular-nums" title={`${Number(d.total_bag_qty)} Bags`}>
                          {Number(d.total_bag_qty)} <span className="text-[9px] font-bold text-amber-400/70 uppercase">Bags</span>
                        </div>
                      )}
                      {((Number(d.total_whole_qty || 0) > 0 || Number(d.total_broken_qty || 0) > 0) || Number(d.total_bag_qty || 0) === 0) && (
                        <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums" title={`${Number(d.total_whole_qty || 0)} Whole and ${Number(d.total_broken_qty || 0)} Broken Tiles`}>
                          {Number(d.total_whole_qty || 0)} <span className="text-[9px] font-bold text-slate-400 mr-1 uppercase">Whole</span>
                          <span className="opacity-50 mx-0.5">/</span> {Number(d.total_broken_qty || 0)} <span className="text-[9px] font-bold text-slate-400 uppercase">Broken</span>
                        </div>
                      )}
                      {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0) && (
                        <div className="text-[9px] font-bold text-rose-600 dark:text-rose-400 tabular-nums mt-0.5" title={`${Number(d.total_return_whole_qty || 0)} Whole and ${Number(d.total_return_broken_qty || 0)} Broken Tiles Returned`}>
                          {tc.return}: {Number(d.total_return_whole_qty || 0)} W / {Number(d.total_return_broken_qty || 0)} B
                        </div>
                      )}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      {Number(d.total_selling_price_excl || 0) > 0 ? (
                        <div>
                          <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            ₹{Number(d.total_selling_price_excl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-[9px] font-bold text-emerald-500/70 tabular-nums">
                            ₹{(Number(d.total_selling_price_excl) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 0 })} incl. GST
                          </div>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  {canEdit && (
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      <div className={`uppercase text-[9px] font-black tracking-widest ${d.payment_status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                        {d.payment_status || 'Unpaid'}
                      </div>
                      {d.approval_status === 'approved' && d.payment_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setConfirmPaidId(d.id); }}
                          disabled={markingPaidId === d.id}
                          title="Mark this dispatch as fully paid"
                          className="mt-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          {markingPaidId === d.id ? '…' : 'Mark as Paid'}
                        </button>
                      )}
                    </td>
                  )}
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                        onClick={e => {
                          e.stopPropagation();
                          onEdit(d);
                        }}
                      >
                        {tc.edit}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3"><Badge variant={getStatusVariant(d.status)}>{d.status}</Badge></td>
                </tr>
              ))}
              {dispatchFetching ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 6} className="px-3 py-10">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  </td>
                </tr>
              ) : dispatchPagination.total === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 6} className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageCheck className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noDispatches}</p>
                      <button
                        type="button"
                        onClick={() => setDispatchSearch('')}
                        className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
        <div className="px-6 py-4 bg-slate-50/40 dark:bg-slate-900/40 border-t border-slate-200/60 dark:border-white/5">
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
