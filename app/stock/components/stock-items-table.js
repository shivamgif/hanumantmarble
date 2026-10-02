'use client';

import { useCallback } from 'react';
import { Download, Boxes, ChevronUp, ChevronDown, Package, Search } from 'lucide-react';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, exportToCSV } from '../lib/stock-utils';
import { showroomSplit } from '@/lib/stock-showroom';

const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Bags show kg per bag, stone the last slab size received (it varies per
// delivery), tiles their size.
function stockSpec(item) {
  if (item.unit_of_measure === 'bag') return item.weight_per_unit_kg ? `${item.weight_per_unit_kg} kg/bag` : item.type_name;
  if (item.unit_of_measure === 'sqft') return item.last_slab_size_label ? `${item.last_slab_size_label} (last)` : item.type_name;
  return item.size_label;
}

// The headline figure for a row, in the item's own unit. low = at or below its
// reorder level, which is what someone scanning this list is looking for.
function stockQty(item, t) {
  const reorder = Number(item.reorder_level || 0);
  if (item.unit_of_measure === 'bag') {
    const n = Number(item.current_whole_qty || 0);
    return { value: fmtQty(n), unit: 'bags', low: reorder > 0 && n <= reorder };
  }
  if (item.unit_of_measure === 'sqft') {
    const n = Number(item.current_sqft || 0);
    return { value: fmtQty(n), unit: 'sqft', low: reorder > 0 && n <= reorder };
  }
  const n = Number(item.current_whole_qty || 0);
  const pieces = Number(item.current_piece_remainder || 0);
  return { value: fmtQty(n), unit: t('boxes').toLowerCase(), extra: pieces > 0 ? `+${pieces} pc` : null, low: reorder > 0 && n <= reorder };
}

export function StockItemsTable({ tabs, kpis, pagination, sort, setSort, search, setSearch, openPreview, t, tc, pageSize, setPageSize }) {
  const toggleSort = useCallback((key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setSort]);

  return (
    <div className="stock-tab-panel" key="stock-panel-items">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        {tabs}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">
        <button
          type="button"
          onClick={() => {
            const dateStr = new Date().toISOString().split('T')[0];
            const columns = [
              { id: 'sku', label: 'SKU', value: (row) => row.sku || '' },
              { id: 'name', label: 'Name', value: (row) => row.name || '' },
              { id: 'brand', label: 'Brand', value: (row) => row.brand_name || '' },
              { id: 'division', label: 'Category/Division', value: (row) => row.division_name || '' },
              { id: 'size', label: 'Size', value: (row) => row.size_label || row.type_name || '' },
              { id: 'whole', label: 'Whole Qty', value: (row) => row.current_whole_qty || '0' },
              { id: 'piece_remainder', label: 'Piece Remainder', value: (row) => row.current_piece_remainder || '0' },
              { id: 'broken', label: 'Broken Qty', value: (row) => row.current_broken_qty || '0' },
              { id: 'broken_piece_remainder', label: 'Broken Piece Remainder', value: (row) => row.current_broken_piece_remainder || '0' },
              { id: 'bags', label: 'Bags Qty', value: (row) => row.unit_of_measure === 'bag' ? row.current_whole_qty : '0' },
              { id: 'sqft', label: 'Sqft Left', value: (row) => row.unit_of_measure === 'sqft' ? Number(row.current_sqft || 0) : '0' },
              { id: 'showroom', label: 'At Showroom', value: (row) => showroomSplit(row).total },
              { id: 'showroom_cassette', label: 'Showroom On Cassette', value: (row) => showroomSplit(row).cassette },
              { id: 'showroom_installed', label: 'Showroom Installed', value: (row) => showroomSplit(row).installed },
              { id: 'slab_size', label: 'Last Slab Size', value: (row) => row.last_slab_size_label || '' },
              { id: 'reorder', label: 'Reorder Level', value: (row) => row.reorder_level || '0' },
            ];
            exportToCSV(`Inventory_Export_${dateStr}.csv`, pagination.allRows, columns);
          }}
          className={PILL_BUTTON_CLASS}
          title="Export Inventory to CSV"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
        </div>
      </div>
      <div id="current-stock" className="glass-panel overflow-hidden rounded-xl">

        {kpis && <div className="border-b border-border px-3 py-3 sm:px-4">{kpis}</div>}
        <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2.5">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tc.searchItems}
              className={`${FORM_INPUT_CLASS} pl-9`}
            />
          </div>
        </div>

        {/* Phones: a list, product left and quantity right, so nothing scrolls sideways. */}
        <ul className="divide-y divide-border md:hidden">
          {pagination.rows.map((item) => {
            const q = stockQty(item, t);
            const sr = showroomSplit(item);
            return (
              <li key={item.id}>
                <button type="button" onClick={() => openPreview(item)} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left active:bg-muted/60">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {item.name}
                      {item.unit_of_measure === 'bag' && <span className="ml-1.5 rounded border border-border px-1 py-px align-middle text-[10px] font-medium text-slate-600 dark:text-slate-300">Bag</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{[stockSpec(item), item.division_name || item.brand_name].filter(Boolean).join(' · ')}</p>
                    <p className="font-mono text-[11px] text-slate-400">{item.sku}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-base font-semibold tabular-nums ${q.low ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-50'}`}>
                      {q.value} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{q.unit}</span>
                    </p>
                    {q.extra ? <p className="text-xs tabular-nums text-slate-500">{q.extra}</p> : null}
                    {Number(item.current_broken_qty || 0) > 0 && item.unit_of_measure !== 'bag' && item.unit_of_measure !== 'sqft' ? (
                      <p className="text-xs tabular-nums text-amber-700 dark:text-amber-400">{item.current_broken_qty} {t('broken').toLowerCase()}</p>
                    ) : null}
                    {sr.total ? <p className="text-xs tabular-nums text-slate-500">{fmtQty(sr.total)} {tc.atShowroom ?? 'at showroom'}</p> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden max-h-[60vh] overflow-y-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-20 bg-muted">
              <tr className="border-b border-border">
                {[
                  { id: 'name', label: t('name') },
                  { id: 'whole', label: t('whole'), align: 'right' },
                  { id: 'broken', label: t('broken'), align: 'right' },
                  { id: 'showroom', label: tc.atShowroom ?? 'At Showroom', align: 'right' },
                  { id: 'reorder', label: t('reorder'), align: 'right' },
                ].map((col) => (
                  <th key={col.id} className={`whitespace-nowrap px-4 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className={`text-[11px] font-semibold uppercase tracking-wider hover:text-slate-900 dark:hover:text-slate-100 transition-colors duration-150 inline-flex items-center gap-1 group/th focus-ring rounded ${sort.key === col.id ? 'text-slate-900 dark:text-slate-100' : 'text-muted-foreground'}`}
                    >
                      {col.label}
                      {sort.key === col.id ? (
                        sort.direction === 'asc'
                          ? <ChevronUp className="h-3 w-3 text-brand-primary" />
                          : <ChevronDown className="h-3 w-3 text-brand-primary" />
                      ) : (
                        <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover/th:opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagination.rows.map((item) => {
                const q = stockQty(item, t);
                const isTile = item.unit_of_measure !== 'bag' && item.unit_of_measure !== 'sqft';
                const { total, cassette, installed, unit } = showroomSplit(item);
                return (
                  <tr
                    key={item.id}
                    className="group/row cursor-pointer transition-colors duration-100 hover:bg-muted/60 focus-visible:bg-muted/60 outline-none"
                    onClick={() => openPreview(item)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openPreview(item);
                      }
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
                        {item.unit_of_measure === 'bag' && (
                          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-px text-[10px] font-medium text-slate-600 dark:text-slate-300">
                            <Package className="h-2.5 w-2.5" />
                            Bag
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{item.sku}</span>
                        {[stockSpec(item), item.division_name || item.brand_name].filter(Boolean).map((bit) => (
                          <span key={bit} className="contents"><span aria-hidden="true">·</span><span>{bit}</span></span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className={`tabular-nums text-sm font-semibold ${q.low ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`} title={q.low ? `At or below reorder level (${item.reorder_level})` : undefined}>
                        {q.value} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">{q.unit}</span>
                      </div>
                      {q.extra ? <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{q.extra}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {!isTile ? (
                        <div className="tabular-nums text-sm text-slate-300 dark:text-slate-600">—</div>
                      ) : (
                        <div className={`tabular-nums text-sm ${item.current_broken_qty > 0 ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>
                          {item.current_broken_qty}
                          {Number(item.current_broken_piece_remainder || 0) > 0 && (
                            <span className="ml-1 text-[11px] font-normal">+{item.current_broken_piece_remainder}pc</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {/* Stock physically at the showroom: display pieces, cassette
                          slabs. Owned and sellable, but not in the warehouse count. */}
                      {!total ? (
                        <div className="tabular-nums text-sm text-slate-300 dark:text-slate-600">—</div>
                      ) : (
                        <div className="tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                          {fmtQty(total)}
                          <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">{unit}</span>
                          {/* Installed stock is physically there but not sellable. */}
                          {installed > 0 && (
                            <div className="text-[11px] font-normal text-amber-700 dark:text-amber-400">
                              {fmtQty(installed)} installed{cassette > 0 ? ` · ${fmtQty(cassette)} on cassette` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className="tabular-nums text-sm text-slate-500 dark:text-slate-400">{item.reorder_level}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagination.total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center border border-border">
              <Boxes className="h-5 w-5 text-slate-400" strokeWidth={1.75} />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-600 dark:text-slate-300">{tc.noStockItems}</p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-sm font-medium text-brand-primary hover:underline underline-offset-4"
              >
                {tc.resetSearch}
              </button>
            </div>
          </div>
        ) : null}
        <div className="px-4 py-3 border-t border-border">
          <PaginationControls
            page={pagination.page}
            pageCount={pagination.pageCount}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={pagination.setPage}
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
      </div>
    </div>
  );
}
