'use client';

import { useCallback } from 'react';
import { ChevronRight, PackageCheck, Plus, Search, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { DispatchFormContent } from './dispatch-form';
import { formatDateTime, getGeneratedByRoleLabel, getStatusVariant, CLASSES, FORM_INPUT_CLASS } from '../lib/stock-utils';

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
  t,
  tc,
  language,
  userRole,
  onNewDispatch,
  onEdit,
}) {
  const canEdit = ['admin', 'manager'].includes(userRole);
  const toggleSort = useCallback((key) => {
    setDispatchSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setDispatchSort]);

  return (
    <div className="stock-tab-panel" key="stock-panel-dispatches">
      <button
        type="button"
        onClick={onNewDispatch}
        className="flex mb-6 justify-end items-center gap-2 rounded-full bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {t('newDispatch')}
      </button>
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
                <div className="flex items-center gap-3">
                  <div>
                    <SheetTitle className="text-base">{t('logNewDispatch')}</SheetTitle>
                    <SheetDescription className="text-xs">{t('logNewDispatchDesc')}</SheetDescription>
                  </div>
                </div>
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
                activeItems={activeItems}
                onAddItem={onAddDispatchItem}
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
        <div className="space-y-4 p-3 md:hidden">
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
                    <p className="break-all font-mono text-xs font-semibold text-primary">{d.shipment_number}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(d.dispatch_date || d.created_at)}</p>
                  </button>
                  <Badge variant={getStatusVariant(d.status)}>{d.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {d.customer_name || '—'}
                  {d.customer_phone_number ? ` • ${d.customer_phone_number}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{Number(d.total_whole_qty || 0)} whole / {Number(d.total_broken_qty || 0)} broken</p>
                {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0) ? (
                  <p className="text-xs text-rose-700 dark:text-rose-300">Return: {Number(d.total_return_whole_qty || 0)} whole / {Number(d.total_return_broken_qty || 0)} broken</p>
                ) : null}
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
        <div className="overflow-x-auto [scrollbar-width:thin] flex-1">
          <table className="hidden w-full text-left whitespace-nowrap md:table border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
              <tr className="border-b border-slate-200/60 dark:border-white/5">
                {[
                  { id: 'datetime', label: tc.datetime },
                  { id: 'shipment', label: t('dispatchNo') },
                  { id: 'customer', label: tc.customer },
                  { id: 'products', label: tc.products },
                  { id: 'quantities', label: tc.quantities, align: 'right' },
                  ...(canEdit ? [{ id: 'edit', label: tc.edit, align: 'right' }] : []),
                  { id: 'return', label: tc.return, align: 'right' },
                  { id: 'status', label: t('status') },
                  { id: 'generatedBy', label: tc.generatedBy },
                  { id: 'approvedBy', label: tc.approvedBy },
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => col.id !== 'customer' && col.id !== 'return' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? toggleSort(col.id) : undefined}
                      className={`text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-2 group/th ${col.id !== 'customer' && col.id !== 'return' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? 'hover:text-brand-primary' : 'cursor-default transition-all duration-300'}`}
                    >
                      {col.label}
                      {col.id !== 'customer' && col.id !== 'return' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' && (
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
                    <span className="font-mono text-[10px] font-black tracking-tight text-brand-primary bg-brand-primary/5 px-2 py-1 rounded-md border border-brand-primary/20 transition-colors group-hover/row:bg-brand-primary/10">
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
                    <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">
                      {Number(d.total_whole_qty || 0)} <span className="text-[9px] font-bold text-slate-400 mr-1 uppercase">W</span>
                      / {Number(d.total_broken_qty || 0)} <span className="text-[9px] font-bold text-slate-400 uppercase">B</span>
                    </div>
                  </td>
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
                  <td className="px-4 py-3 text-right text-rose-700 dark:text-rose-300 tabular-nums font-bold">
                    {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0)
                      ? `${Number(d.total_return_whole_qty || 0)}W / ${Number(d.total_return_broken_qty || 0)}B`
                      : '—'}
                  </td>
                  <td className="px-4 py-3"><Badge variant={getStatusVariant(d.status)}>{d.status}</Badge></td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{d.generated_by || '—'}</span>
                      <Badge variant="neutral" className="text-[9px] font-black uppercase tracking-tighter px-1">{getGeneratedByRoleLabel(d.generated_by_role)}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-bold text-muted-foreground">{d.approved_by || '—'}</td>
                </tr>
              ))}
              {dispatchPagination.total === 0 ? (
                <tr>
                  <td colSpan="8" className="px-3 py-10">
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
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setDispatchPage}
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
    </div>
  );
}
