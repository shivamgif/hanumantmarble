'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, Search, Store } from 'lucide-react';
import PaginationControls from '@/components/ui/pagination-controls';
import { paginateRows } from '@/lib/pagination';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FORM_INPUT_CLASS, formatDateTime, exportToCSV, EXPORT_PERIOD_PRESETS, filterRowsByPeriod,
  normalizeSearchValue, matchesQuery, SHOWROOM_ACTIONS, showroomActionOf, formatShowroomQty,
} from '../lib/stock-utils';

/**
 * Every warehouse <-> showroom move, across all items. The per-item view lives
 * in the item preview sheet; this is the audit surface.
 *
 * ponytail: fetches up to 200 rows and filters/paginates client-side, the same
 * way the Current Stock tab treats items. Showroom moves are a handful a week.
 * If this ever gets slow, push search + paging into the route's existing
 * limit/offset params.
 */
export function ShowroomPanel({ tc, pageSize, setPageSize, refreshKey }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stock/movements?limit=200');
      const json = await response.json();
      setMovements(response.ok ? (json.movements || []) : []);
    } catch {
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const rows = useMemo(() => movements.filter((movement) => {
    const query = normalizeSearchValue(search);
    if (!query) return true;
    const action = showroomActionOf(movement);
    return [
      movement.sku, movement.name, movement.created_by, movement.notes,
      action ? SHOWROOM_ACTIONS[action].short : movement.movement_type,
    ].some((value) => matchesQuery(value, query));
  }), [movements, search]);

  const pagination = useMemo(() => paginateRows(rows, page, pageSize), [rows, page, pageSize]);

  return (
    <div className="stock-tab-panel" key="stock-panel-showroom">
      <div className="mb-6 flex items-center justify-end gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-200/60 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Export Showroom Movements to CSV"
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
                    { id: 'date', label: 'Date', value: (row) => formatDateTime(row.created_at) },
                    { id: 'sku', label: 'SKU', value: (row) => row.sku || '' },
                    { id: 'name', label: 'Item', value: (row) => row.name || '' },
                    { id: 'action', label: 'Action', value: (row) => SHOWROOM_ACTIONS[showroomActionOf(row)]?.label || row.movement_type },
                    { id: 'qty', label: 'Quantity', value: (row) => formatShowroomQty(row) },
                    { id: 'by', label: 'Recorded By', value: (row) => row.created_by || '' },
                    { id: 'notes', label: 'Notes', value: (row) => row.notes || '' },
                  ];
                  const filtered = filterRowsByPeriod(rows, ['created_at'], preset.id);
                  const suffix = preset.id === 'all' ? '' : `_${preset.id}`;
                  exportToCSV(`Showroom_Export${suffix}_${dateStr}.csv`, filtered, columns);
                }}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <section id="showroom" className="flex h-full flex-col overflow-hidden scroll-mt-6 glass-panel rounded-2xl">
        <div className="flex items-start justify-between border-b border-border/60 bg-muted/40 px-6 py-5">
          <div className="space-y-1.5">
            <nav className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.4em] text-slate-400">
              <span>{tc.inventoryHub}</span>
              <ChevronRight className="h-2.5 w-2.5 opacity-50" />
              <span className="text-brand-primary">{tc.showroom ?? 'Showroom'}</span>
            </nav>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                {tc.showroomMovements ?? 'Showroom Movements'}
              </h3>
              <span className="rounded-full bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest tabular-nums text-brand-primary shadow-sm">
                {pagination.total}
              </span>
            </div>
          </div>
        </div>

        <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/50 px-3 py-2.5 backdrop-blur-md dark:bg-slate-900/50">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-brand-primary" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search item, SKU, action or person…"
              className={`${FORM_INPUT_CLASS} pl-11`}
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] no-scrollbar">
          <table className="w-full text-left whitespace-nowrap border-collapse">
            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-sm">
              <tr className="border-b border-border/60">
                {['Date', 'SKU', 'Item', 'Action', 'Qty', 'By', 'Notes'].map((label, index) => (
                  <th
                    key={label}
                    className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ${index === 4 ? 'text-right' : ''}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {pagination.rows.map((movement) => {
                const action = showroomActionOf(movement);
                return (
                  <tr key={movement.id} className="transition-colors duration-150 hover:bg-muted/50 odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70">
                    <td className="px-4 py-3 tabular-nums text-xs font-bold text-slate-500">{formatDateTime(movement.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] font-black tracking-tight text-slate-700 dark:text-white/90 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md border border-slate-200/60 dark:border-white/5">
                        {movement.sku}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-slate-900 dark:text-white">{movement.name}</td>
                    <td className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest ${action ? SHOWROOM_ACTIONS[action].tone : 'text-slate-500'}`}>
                      {action ? SHOWROOM_ACTIONS[action].short : movement.movement_type}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-black text-slate-900 dark:text-white">{formatShowroomQty(movement)}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-400">{movement.created_by}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 italic max-w-xs truncate">{movement.notes || '—'}</td>
                  </tr>
                );
              })}
              {pagination.total === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Store className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <div className="mt-3 text-xs font-black uppercase tracking-widest text-slate-400">
                      {loading ? 'Loading…' : search ? 'No matching movements' : 'Nothing has moved to the showroom yet'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border/60">
          <PaginationControls
            page={pagination.page}
            pageCount={pagination.pageCount}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={setPage}
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
    </div>
  );
}

export default ShowroomPanel;
