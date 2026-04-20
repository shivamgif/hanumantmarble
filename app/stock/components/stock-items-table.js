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
      <div id="current-stock" className="overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-base font-semibold text-foreground">{t('currentStock')}</h2>
          <span className="text-xs text-muted-foreground">{pagination.total} {t('items')}</span>
        </div>
        <div className="border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tc.searchItems}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('sku')} className="font-medium hover:text-foreground">{t('sku')}</button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('name')} className="font-medium hover:text-foreground">{t('name')}</button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('size')} className="font-medium hover:text-foreground">{t('size')}</button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('whole')} className="font-medium hover:text-foreground">{t('whole')}</button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('broken')} className="font-medium hover:text-foreground">{t('broken')}</button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('reorder')} className="font-medium hover:text-foreground">{t('reorder')}</button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer bg-white transition hover:bg-slate-50 focus-within:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40"
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
                  <td className="border-r border-slate-100 px-3 py-2 font-mono font-medium text-foreground dark:border-slate-800">{item.sku}</td>
                  <td className="px-3 py-2 truncate max-w-[200px]" title={item.name}>{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.size_label}</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{item.current_whole_qty}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{item.current_broken_qty}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{item.reorder_level}</td>
                </tr>
              ))}
              {pagination.total === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <Boxes className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noStockItems}</p>
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="rounded-xl bg-[#E07A00] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c96d00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20"
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
