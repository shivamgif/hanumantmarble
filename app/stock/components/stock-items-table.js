'use client';

import { useCallback } from 'react';
import { Boxes } from 'lucide-react';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function StockItemsTable({ pagination, sort, setSort, search, setSearch, openPreview, t, tc }) {
  const toggleSort = useCallback((key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setSort]);

  return (
    <div className="stock-tab-panel" key="stock-panel-items">
      <div id="current-stock" className="overflow-hidden scroll-mt-6 rounded-xl border border-slate-200/70 bg-white dark:border-slate-700/70 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-sm font-semibold text-foreground">{t('currentStock')}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{pagination.total} {t('items')}</span>
        </div>
        <div className="border-b border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tc.searchItems}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50/95 font-medium text-slate-500 backdrop-blur-sm dark:bg-slate-900/95 dark:text-slate-400">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort('sku')} className="font-semibold tracking-wide hover:text-foreground transition-colors">{t('sku')}</button>
                </th>
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort('name')} className="font-semibold tracking-wide hover:text-foreground transition-colors">{t('name')}</button>
                </th>
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort('size')} className="font-semibold tracking-wide hover:text-foreground transition-colors">{t('size')}</button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button type="button" onClick={() => toggleSort('whole')} className="font-semibold tracking-wide hover:text-foreground transition-colors">{t('whole')}</button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button type="button" onClick={() => toggleSort('broken')} className="font-semibold tracking-wide hover:text-foreground transition-colors">{t('broken')}</button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button type="button" onClick={() => toggleSort('reorder')} className="font-semibold tracking-wide hover:text-foreground transition-colors">{t('reorder')}</button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/80">
              {pagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition-colors hover:bg-primary/4 focus-within:bg-primary/4 dark:hover:bg-primary/6 dark:focus-within:bg-primary/6"
                  onClick={() => openPreview(item)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPreview(item);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="border-r border-slate-100 px-3 py-2.5 font-mono text-[11px] font-semibold text-foreground dark:border-slate-800">{item.sku}</td>
                  <td className="px-3 py-2.5 truncate max-w-[200px] text-foreground/90" title={item.name}>{item.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{item.size_label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">{item.current_whole_qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-600 dark:text-amber-500">{item.current_broken_qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{item.reorder_level}</td>
                </tr>
              ))}
              {pagination.total === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-12">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <Boxes className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">{tc.noStockItems}</p>
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {tc.resetSearch}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={pagination.page}
          pageCount={pagination.pageCount}
          total={pagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={pagination.setPage}
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
  );
}
