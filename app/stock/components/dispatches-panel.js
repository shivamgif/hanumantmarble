'use client';

import { useCallback } from 'react';
import { PackageCheck, Plus, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { DispatchFormContent } from './dispatch-form';
import { formatDateTime, getGeneratedByRoleLabel, getStatusVariant } from '../lib/stock-utils';

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
      <section id="dispatches" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-base font-semibold text-foreground">{t('dispatches')}</h2>
          <Sheet open={dispatchSheetOpen} onOpenChange={setDispatchSheetOpen}>
            <button
              type="button"
              onClick={onNewDispatch}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t('newDispatch')}
              </span>
            </button>
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
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <input
            type="search"
            value={dispatchSearch}
            onChange={(event) => setDispatchSearch(event.target.value)}
            placeholder={tc.searchDispatches}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {dispatchPagination.rows.map((d) => {
            const expanded = dispatchExpandedId === d.id;
            return (
              <article key={`dispatch-mobile-${d.id}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/70">
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
                    <p>By: {d.generated_by || '—'}</p>
                  </div>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDispatchExpandedId((current) => (current === d.id ? null : d.id))}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label={expanded ? 'Collapse dispatch details' : 'Expand dispatch details'}
                  >
                    {expanded ? 'Collapse' : 'Expand'}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                      onClick={e => { e.stopPropagation(); onEdit(d); }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="hidden w-full text-xs text-left whitespace-nowrap md:table">
            <thead className="sticky top-0 bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('datetime')} className="font-medium hover:text-foreground">{tc.datetime}</button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('shipment')} className="font-medium hover:text-foreground">{t('dispatchNo')}</button>
                </th>
                <th className="px-3 py-2">
                  <span className="font-medium">Customer</span>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('products')} className="font-medium hover:text-foreground">Products</button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('quantities')} className="font-medium hover:text-foreground">Quantities</button>
                </th>
                {canEdit && (
                  <th className="px-3 py-2 text-right">
                    <span className="font-medium">Edit</span>
                  </th>
                )}
                <th className="px-3 py-2 text-right">
                  <span className="font-medium">Return</span>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('status')} className="font-medium hover:text-foreground">{t('status')}</button>
                </th>
                <th className="px-3 py-2">{tc.generatedBy}</th>
                <th className="px-3 py-2">{tc.approvedBy}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {dispatchPagination.rows.map((d) => (
                <tr
                  key={d.id}
                  className={`cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40 ${highlightedShipmentKey === `dispatch-${d.id}` ? 'bg-[#E07A00]/10 ring-1 ring-[#E07A00]/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'}`}
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
                  <td className="px-3 py-2 text-muted-foreground">{formatDateTime(d.dispatch_date || d.created_at)}</td>
                  <td className="px-3 py-2 font-mono font-medium text-primary">{d.shipment_number}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div>{d.customer_name || '—'}</div>
                    {d.customer_phone_number ? <div className="text-[10px]">{d.customer_phone_number}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-[260px] truncate" title={d.product_names || d.product_skus || ''}>{d.product_names || d.product_skus || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {Number(d.total_whole_qty || 0)} whole / {Number(d.total_broken_qty || 0)} broken
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                        onClick={e => {
                          e.stopPropagation();
                          onEdit(d);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                  <td className="px-3 py-2 text-right text-rose-700 dark:text-rose-300">
                    {(Number(d.total_return_whole_qty || 0) > 0 || Number(d.total_return_broken_qty || 0) > 0)
                      ? `${Number(d.total_return_whole_qty || 0)} whole / ${Number(d.total_return_broken_qty || 0)} broken`
                      : '—'}
                  </td>
                  <td className="px-3 py-2"><Badge variant={getStatusVariant(d.status)}>{d.status}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{d.generated_by || '—'}</span>
                      <Badge variant="neutral" className="text-[10px]">{getGeneratedByRoleLabel(d.generated_by_role)}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{d.approved_by || '—'}</td>
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
                        className="rounded-xl bg-[#E07A00] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c96d00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20"
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
      </section>
    </div>
  );
}
