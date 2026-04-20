'use client';

import { useCallback } from 'react';
import { PackageCheck, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { ArrivalFormContent } from './arrival-form';
import { formatDateTime, getGeneratedByRoleLabel, getStatusVariant } from '../lib/stock-utils';

export function PurchasesPanel({
  arrivalForm,
  arrivalItemsFieldArray,
  arrivalWatchedItems,
  arrivalSheetOpen,
  setArrivalSheetOpen,
  arrivalAttachments,
  setArrivalAttachment,
  arrivalNotice,
  arrivalSubmitting,
  arrivalSearch,
  setArrivalSearch,
  arrivalSort,
  setArrivalSort,
  arrivalPagination,
  setArrivalPage,
  arrivalExpandedId,
  setArrivalExpandedId,
  highlightedShipmentKey,
  canCreateArrival,
  handleArrivalSubmit,
  handleArrivalInvalid,
  openShipmentPreview,
  onAddArrivalItem,
  onArrivalItemNameChange,
  suggestions,
  activeItems,
  t,
  tc,
  language,
}) {
  const toggleSort = useCallback((key) => {
    setArrivalSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setArrivalSort]);

  return (
    <div className="stock-tab-panel" key="stock-panel-purchases">
      <section id="purchases" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-base font-semibold text-foreground">{tc.purchases}</h2>
          <Sheet open={arrivalSheetOpen} onOpenChange={setArrivalSheetOpen}>
            <button
              type="button"
              onClick={() => setArrivalSheetOpen(true)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canCreateArrival}
              title={!canCreateArrival ? tc.insufficientNewPurchase : undefined}
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {tc.newPurchase}
              </span>
            </button>
            <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
              <SheetHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div>
                    <SheetTitle className="text-base">{tc.logNewPurchase}</SheetTitle>
                    <SheetDescription className="text-xs">{tc.purchaseSheetDesc}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <ArrivalFormContent
                form={arrivalForm}
                itemsFieldArray={arrivalItemsFieldArray}
                watchedItems={arrivalWatchedItems}
                attachments={arrivalAttachments}
                setAttachment={setArrivalAttachment}
                onSubmit={handleArrivalSubmit}
                onInvalid={handleArrivalInvalid}
                submitting={arrivalSubmitting}
                notice={arrivalNotice}
                suggestions={suggestions}
                activeItems={activeItems}
                onItemNameChange={onArrivalItemNameChange}
                onAddItem={onAddArrivalItem}
                t={t}
                tc={tc}
                language={language}
              />
            </SheetContent>
          </Sheet>
        </div>
        {!canCreateArrival ? (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Insufficient permission: salespeople can create dispatches but cannot create purchases.
          </div>
        ) : null}
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <input
            type="search"
            value={arrivalSearch}
            onChange={(event) => setArrivalSearch(event.target.value)}
            placeholder="Search purchases by date, product, qty, truck, or status"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {arrivalPagination.rows.map((a) => {
            const expanded = arrivalExpandedId === a.id;
            return (
              <article key={`arrival-mobile-${a.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openShipmentPreview('arrival', a)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open purchase ${a.shipment_number}`}
                  >
                    <p className="break-all font-mono text-xs font-semibold text-primary">{a.shipment_number}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(a.arrival_date || a.created_at)}</p>
                  </button>
                  <Badge variant={getStatusVariant(a.status)}>{a.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{Number(a.total_whole_qty || 0)} whole / {Number(a.total_broken_qty || 0)} broken</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Invoice: {a.invoice_number || '—'} {a.invoice_date ? `(${formatDateTime(a.invoice_date)})` : ''}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {a.origin_city || '—'} to {a.destination_warehouse_name || '—'} • {a.payment_status || 'unpaid'}
                </p>
                {expanded ? (
                  <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <p className="truncate">{a.product_names || a.product_skus || '—'}</p>
                    <p>Division: {a.divisions || 'General'}</p>
                    <p>SQM: {Number(a.total_qty_sqm || 0).toFixed(3)} • Avg cost/sqm: {Number(a.avg_cost_per_sqm || 0).toFixed(2)}</p>
                    <p>By: {a.generated_by || '—'}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setArrivalExpandedId((current) => (current === a.id ? null : a.id))}
                  className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={expanded ? 'Collapse purchase details' : 'Expand purchase details'}
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
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
                  <button type="button" onClick={() => toggleSort('shipment')} className="font-medium hover:text-foreground">{t('shipmentNo')}</button>
                </th>
                <th className="px-3 py-2">{tc.invoice}</th>
                <th className="px-3 py-2">{tc.route}</th>
                <th className="px-3 py-2">{tc.payment}</th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('products')} className="font-medium hover:text-foreground">Products</button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('quantities')} className="font-medium hover:text-foreground">Quantities</button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('grandTotal')} className="font-medium hover:text-foreground">Grand Total</button>
                </th>
                <th className="px-3 py-2 text-right">Freight (kg)</th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('status')} className="font-medium hover:text-foreground">{t('status')}</button>
                </th>
                <th className="px-3 py-2">{tc.generatedBy}</th>
                <th className="px-3 py-2">{tc.approvedBy}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {arrivalPagination.rows.map((a) => (
                <tr
                  key={a.id}
                  className={`cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40 ${highlightedShipmentKey === `arrival-${a.id}` ? 'bg-[#E07A00]/10 ring-1 ring-[#E07A00]/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'}`}
                  onClick={() => openShipmentPreview('arrival', a)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openShipmentPreview('arrival', a);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-3 py-2 text-muted-foreground">{formatDateTime(a.arrival_date || a.created_at)}</td>
                  <td className="px-3 py-2 font-mono font-medium text-primary">{a.shipment_number}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div>{a.invoice_number || '—'}</div>
                    <div className="text-[10px]">{a.invoice_date ? formatDateTime(a.invoice_date) : '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div className="max-w-[170px] truncate" title={`${a.origin_city || '—'} to ${a.destination_warehouse_name || '—'}`}>
                      {a.origin_city || '—'} to {a.destination_warehouse_name || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div className="uppercase text-[10px] font-semibold">{a.payment_status || 'unpaid'}</div>
                    {a.paid_amount != null ? <div className="text-[10px]">INR {Number(a.paid_amount).toFixed(2)}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-[260px] truncate" title={a.product_names || a.product_skus || ''}>{a.product_names || a.product_skus || '—'}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{a.divisions || 'General'}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {Number(a.total_whole_qty || 0)} whole / {Number(a.total_broken_qty || 0)} broken
                    <div className="text-[10px] text-muted-foreground">{Number(a.total_qty_sqm || 0).toFixed(3)} sqm</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div>INR {Number(a.grand_total || 0).toFixed(2)}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{Number(a.freight_weight_kg || 0).toFixed(2)}</td>
                  <td className="px-3 py-2"><Badge variant={getStatusVariant(a.status)}>{a.status}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{a.generated_by || '—'}</span>
                      <Badge variant="neutral" className="text-[10px]">{getGeneratedByRoleLabel(a.generated_by_role)}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{a.approved_by || '—'}</td>
                </tr>
              ))}
              {arrivalPagination.total === 0 ? (
                <tr>
                  <td colSpan="10" className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageCheck className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noPurchases}</p>
                      <button
                        type="button"
                        onClick={() => setArrivalSearch('')}
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
          page={arrivalPagination.page}
          pageCount={arrivalPagination.pageCount}
          total={arrivalPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setArrivalPage}
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
