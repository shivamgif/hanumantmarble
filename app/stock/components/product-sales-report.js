'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MonthPicker } from '@/components/ui/month-picker';
import { groupByProduct } from '../lib/product-sales';
import { FORM_INPUT_CLASS, PILL_BUTTON_CLASS, exportToCSV } from '../lib/stock-utils';

const currentMonth = () => new Date().toISOString().slice(0, 7);

const int = (value) => Number(value || 0).toLocaleString('en-IN');
const sqft = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function QtyCells({ row }) {
  return (
    <>
      <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-slate-900 dark:text-white">
        {row.boxQty || row.brokenQty ? (
          <>
            {int(row.boxQty)}
            {row.brokenQty ? <span className="ml-1 text-[9px] font-bold text-rose-500">+{int(row.brokenQty)} brk</span> : null}
          </>
        ) : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-amber-500">
        {row.bagQty ? int(row.bagQty) : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-sky-500">
        {row.sqftQty ? sqft(row.sqftQty) : <span className="text-slate-400">—</span>}
      </td>
    </>
  );
}

export function ProductSalesReport({ open, onOpenChange }) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [canSeeRevenue, setCanSeeRevenue] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/stock/product-sales?month=${month}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load product sales');
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setRows(json.rows || []);
        setProducts(groupByProduct(json.rows));
        setCanSeeRevenue(!!json.canSeeRevenue);
      })
      .catch((err) => { if (!cancelled) { setError(err.message); setRows([]); setProducts([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, month]);

  const handleExport = useCallback((exportRows) => {
    exportToCSV(`Product_Sales_${month}.csv`, exportRows, [
      { id: 'product', label: 'Product', value: (r) => r.item_name || '' },
      { id: 'sku', label: 'SKU', value: (r) => r.sku || '' },
      { id: 'customer', label: 'Customer', value: (r) => r.customer_name || '' },
      { id: 'boxes', label: 'Boxes', value: (r) => r.box_qty || '0' },
      { id: 'broken', label: 'Broken', value: (r) => r.broken_qty || '0' },
      { id: 'bags', label: 'Bags', value: (r) => r.bag_qty || '0' },
      { id: 'sqft', label: 'Sqft', value: (r) => Number(r.sqft_qty || 0).toFixed(3) },
      { id: 'dispatches', label: 'Dispatches', value: (r) => r.dispatch_count || '0' },
      ...(canSeeRevenue ? [{ id: 'revenue', label: 'Revenue (Excl GST)', value: (r) => r.revenue_excl || '0' }] : []),
    ]);
  }, [month, canSeeRevenue]);

  const colSpan = canSeeRevenue ? 6 : 5;
  // A busy month runs to ~370 products, so filter client-side rather than scroll.
  const query = search.trim().toLowerCase();
  const matches = (name, sku) => `${name || ''} ${sku || ''}`.toLowerCase().includes(query);
  const visible = query ? products.filter((p) => matches(p.itemName, p.sku)) : products;
  const visibleRows = query ? rows.filter((r) => matches(r.item_name, r.sku)) : rows;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[80vw] lg:w-[70vw] xl:w-[62vw] 2xl:w-[55vw] md:max-w-[1100px]">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-base">Sales by Product</SheetTitle>
          <SheetDescription className="text-xs">
            Quantity sold per product for the selected month, net of returns. Expand a product for its customer breakdown.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-3 py-4">
          <MonthPicker
            value={month}
            max={currentMonth()}
            onChange={(next) => { setMonth(next || currentMonth()); setExpandedId(null); }}
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter products…"
            className={`${FORM_INPUT_CLASS} w-auto flex-1 min-w-[160px]`}
            aria-label="Filter products"
          />
          <span className="rounded-full bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest tabular-nums text-brand-primary">
            {visible.length} products
          </span>
          <button
            type="button"
            onClick={() => handleExport(visibleRows)}
            disabled={!visibleRows.length}
            className={`${PILL_BUTTON_CLASS} ml-auto`}
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}

        {/* Mobile */}
        <div className="space-y-3 md:hidden">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : !visible.length && !error ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{query ? 'No products match that filter.' : 'No sales in this month.'}</p>
          ) : null}
          {visible.map((p) => {
            const expanded = expandedId === p.itemId;
            return (
              <article key={`product-sales-mobile-${p.itemId}`} className="glass-panel rounded-2xl p-4">
                <button type="button" onClick={() => setExpandedId(expanded ? null : p.itemId)} className="w-full text-left">
                  <p className="text-xs font-black text-slate-900 dark:text-white">{p.itemName}</p>
                  <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{p.sku}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs font-black tabular-nums">
                    {p.boxQty || p.brokenQty ? <span className="text-slate-900 dark:text-white">{int(p.boxQty)} <span className="text-[10px] uppercase text-slate-400">Boxes</span></span> : null}
                    {p.bagQty ? <span className="text-amber-500">{int(p.bagQty)} <span className="text-[10px] uppercase text-amber-400/70">Bags</span></span> : null}
                    {p.sqftQty ? <span className="text-sky-500">{sqft(p.sqftQty)} <span className="text-[10px] uppercase text-sky-400/70">Sqft</span></span> : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {p.customers.length} customers
                    {canSeeRevenue ? <span className="ml-2 font-black text-emerald-600 dark:text-emerald-400">{rupees(p.revenueExcl)}</span> : null}
                  </p>
                </button>
                {expanded ? (
                  <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    {p.customers.map((c) => (
                      <li key={`${p.itemId}-${c.name}`} className="flex justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="truncate">{c.name}</span>
                        <span className="font-black tabular-nums">
                          {c.sqftQty ? `${sqft(c.sqftQty)} sqft` : c.bagQty ? `${int(c.bagQty)} bags` : `${int(c.boxQty)} boxes`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>

        {/* Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xl dark:bg-slate-900/90">
              <tr className="border-b border-slate-200/60 dark:border-white/5">
                {[
                  { id: 'product', label: 'Product' },
                  { id: 'boxes', label: 'Boxes', align: 'right' },
                  { id: 'bags', label: 'Bags', align: 'right' },
                  { id: 'sqft', label: 'Sqft', align: 'right' },
                  { id: 'customers', label: 'Customers', align: 'right' },
                  ...(canSeeRevenue ? [{ id: 'revenue', label: 'Revenue', align: 'right' }] : []),
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {visible.map((p) => {
                const expanded = expandedId === p.itemId;
                return [
                  <tr
                    key={`product-${p.itemId}`}
                    onClick={() => setExpandedId(expanded ? null : p.itemId)}
                    className="cursor-pointer transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-slate-100/50 dark:odd:bg-slate-900 dark:even:bg-slate-900/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-brand-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        <div>
                          <div className="text-xs font-black text-slate-900 dark:text-white">{p.itemName}</div>
                          <div className="font-mono text-[9px] font-bold text-slate-500 dark:text-slate-400">{p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <QtyCells row={p} />
                    <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-slate-600 dark:text-slate-300">{p.customers.length}</td>
                    {canSeeRevenue ? (
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs font-black tabular-nums text-emerald-600 dark:text-emerald-400">{rupees(p.revenueExcl)}</div>
                        <div className="text-[9px] font-bold tabular-nums text-emerald-500/70">{rupees(p.revenueExcl * 1.18)} incl. GST</div>
                      </td>
                    ) : null}
                  </tr>,
                  ...(expanded ? p.customers.map((c) => (
                    <tr key={`product-${p.itemId}-${c.name}`} className="bg-slate-50/40 dark:bg-slate-800/30">
                      <td className="px-4 py-2 pl-11 text-[11px] font-bold text-slate-600 dark:text-slate-300">{c.name}</td>
                      <QtyCells row={c} />
                      <td className="px-4 py-2 text-right text-[10px] font-bold tabular-nums text-slate-500">{int(c.dispatchCount)} disp.</td>
                      {canSeeRevenue ? (
                        <td className="px-4 py-2 text-right text-[11px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">{rupees(c.revenueExcl)}</td>
                      ) : null}
                    </tr>
                  )) : []),
                ];
              })}
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-10">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  </td>
                </tr>
              ) : !visible.length && !error ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {query ? 'No products match that filter.' : 'No sales in this month.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
