'use client';

import { useCallback } from 'react';
import { Download, Boxes, ChevronRight, ChevronUp, ChevronDown, Package, Search } from 'lucide-react';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, exportToCSV } from '../lib/stock-utils';

export function StockItemsTable({ pagination, sort, setSort, search, setSearch, openPreview, t, tc, pageSize, setPageSize }) {
  const toggleSort = useCallback((key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setSort]);

  return (
    <div className="stock-tab-panel space-y-6" key="stock-panel-items">
      <div id="current-stock" className="glass-panel overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/5 shadow-2xl transition-all duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 bg-slate-50/40 dark:bg-slate-900/40 px-6 py-5">
          <div className="space-y-1.5">
            <nav className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.4em] text-slate-400">
              <span>{tc.inventoryHub}</span>
              <ChevronRight className="h-2.5 w-2.5 opacity-50" />
              <span className="text-brand-primary">{tc.stockLedger}</span>
            </nav>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{t('currentStock')}</h3>
              <span className="rounded-full bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest tabular-nums text-brand-primary shadow-sm">
                {pagination.total} {t('items')}
              </span>
            </div>
          </div>
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
                { id: 'broken', label: 'Broken Qty', value: (row) => row.current_broken_qty || '0' },
                { id: 'bags', label: 'Bags Qty', value: (row) => row.unit_of_measure === 'bag' ? row.current_whole_qty : '0' },
                { id: 'reorder', label: 'Reorder Level', value: (row) => row.reorder_level || '0' },
              ];
              exportToCSV(`Inventory_Export_${dateStr}.csv`, pagination.allRows, columns);
            }}
            className="flex items-center gap-2 rounded-full border border-slate-200/60 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Export Inventory to CSV"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>

        <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/50 px-3 py-2.5 backdrop-blur-md dark:bg-slate-900/50">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-brand-primary" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tc.searchItems}
              className={`${FORM_INPUT_CLASS} pl-11`}
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] no-scrollbar">
          <table className="w-full text-left whitespace-nowrap border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
              <tr className="border-b border-slate-200/60 dark:border-white/5">
                {[
                  { id: 'sku', label: t('sku') },
                  { id: 'name', label: t('name') },
                  { id: 'size', label: t('size') },
                  { id: 'whole', label: t('whole'), align: 'right' },
                  { id: 'broken', label: t('broken'), align: 'right' },
                  { id: 'reorder', label: t('reorder'), align: 'right' },
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 hover:text-brand-primary transition-all duration-300 flex items-center gap-2 group/th"
                    >
                      {col.label}
                      {sort.key === col.id ? (
                        sort.direction === 'asc'
                          ? <ChevronUp className="h-2.5 w-2.5 text-brand-primary" />
                          : <ChevronDown className="h-2.5 w-2.5 text-brand-primary" />
                      ) : (
                        <span className="h-1 w-1 rounded-full bg-brand-primary opacity-0 transition-opacity group-hover/th:opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {pagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="group/row cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70"
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
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] font-black tracking-tight text-slate-700 dark:text-white/90 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md border border-slate-200/60 dark:border-white/5 group-hover/row:border-brand-primary/30 transition-colors">
                      {item.sku}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-black text-slate-900 dark:text-white transition-transform group-hover/row:translate-x-1 duration-300">{item.name}</div>
                      {item.unit_of_measure === 'bag' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-400">
                          <Package className="h-2.5 w-2.5" />
                          Bag
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest opacity-60">{item.division_name || item.brand_name || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {item.unit_of_measure === 'bag' ? (
                      <div className="text-xs font-bold text-slate-400">
                        {item.weight_per_unit_kg ? `${item.weight_per_unit_kg} kg/bag` : item.type_name || '—'}
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-slate-400">{item.size_label}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.unit_of_measure === 'bag' ? (
                      <div className="tabular-nums text-xs font-black text-amber-500">
                        {item.current_whole_qty}
                        <span className="ml-1 text-[9px] font-bold text-amber-400/70 uppercase">bags</span>
                      </div>
                    ) : (
                      <div className="tabular-nums text-xs font-black text-slate-900 dark:text-white">{item.current_whole_qty}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.unit_of_measure === 'bag' ? (
                      <div className="tabular-nums text-xs text-slate-400 opacity-30">—</div>
                    ) : (
                      <div className={`tabular-nums text-xs font-black ${item.current_broken_qty > 0 ? 'text-amber-500' : 'text-slate-500 opacity-30'}`}>
                        {item.current_broken_qty}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-[10px] font-bold text-slate-500 opacity-60 group-hover/row:opacity-90 transition-opacity">
                      {item.reorder_level}
                    </div>
                  </td>
                </tr>
              ))}
              {pagination.total === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="h-16 w-16 rounded-3xl bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center border border-slate-200 dark:border-white/5 animate-pulse">
                        <Boxes className="h-8 w-8 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-black uppercase tracking-widest text-slate-400 leading-relaxed">{tc.noStockItems}</p>
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary hover:underline underline-offset-4"
                        >
                          {tc.resetSearch}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50/40 dark:bg-slate-900/40 border-t border-slate-200/60 dark:border-white/5">
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
