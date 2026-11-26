'use client';
// The detail behind any clicked chart mark: one slice of the range, broken
// down by division / item / customer / salesperson, plus the dispatches in it.
// Clicking a row narrows the slice; the breadcrumb walks back out.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { EmptyState, formatCompactINR, formatCompactNumber, formatINR, formatRangeLabel } from '../../components/dashboard-ui';
import { RankedBars, SERIES } from './chart-kit';

const DIMENSIONS = ['division', 'item', 'customer', 'salesperson'];

function sliceUrl({ filter, by }, range) {
  const params = new URLSearchParams({ section: 'drill', by, from: filter.from || range.from, to: filter.to || range.to });
  for (const dim of DIMENSIONS) if (filter[dim] != null) params.set(dim, filter[dim]);
  return `/api/stock/admin/analytics?${params}`;
}

export function DrillSheet({ request, range, onClose }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const [stack, setStack] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // A new click from the page starts a new trail.
  useEffect(() => {
    setStack(request ? [{ ...request, filter: request.filter || {}, by: request.by || 'division' }] : []);
  }, [request]);

  const current = stack[stack.length - 1];
  const url = current && range ? sliceUrl(current, range) : null;

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setError('');
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        if (!cancelled) setData({ url, ...json });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const loading = !error && data?.url !== url;
  const filtered = current ? DIMENSIONS.filter((d) => current.filter[d] != null) : [];
  const byOptions = DIMENSIONS.filter((d) => !filtered.includes(d));
  const setBy = (by) => setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], by }]);
  const narrow = (row) => {
    if (!current || row.key === '-' ) return;
    const value = current.by === 'item' || current.by === 'customer' ? Number(row.key) : row.key;
    const filter = { ...current.filter, [current.by]: value };
    const nextBy = DIMENSIONS.find((d) => filter[d] == null) || current.by;
    setStack((s) => [...s, { title: row.label, filter, by: nextBy }]);
  };

  const sliceRange = current ? { from: current.filter.from || range?.from, to: current.filter.to || range?.to } : null;
  const totals = data?.totals || {};
  const rows = (data?.breakdown || []).map((r) => ({
    key: r.key,
    label: r.label || '—',
    sub: r.sub || null,
    value: Number(r.revenue || 0),
    share: totals.revenue > 0 ? (Number(r.revenue || 0) / totals.revenue) * 100 : null,
    color: SERIES[0],
    extra: [
      r.margin_pct != null ? `${Number(r.margin_pct).toFixed(1)}%` : null,
      `${r.dispatches} ${t('dispatchesShort')}`,
      current?.by === 'item' ? `${formatCompactNumber(r.units)} ${t('units')}` : null,
    ].filter(Boolean).join(' · '),
  }));
  const canNarrow = byOptions.length > 1;

  return (
    <Sheet open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-card md:w-[640px] md:max-w-[90vw]">
        <SheetHeader className="space-y-2 border-b border-border pb-4 text-left">
          {stack.length > 1 ? (
            <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Drill path">
              {stack.map((step, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                  {i < stack.length - 1 ? (
                    <button type="button" onClick={() => setStack((s) => s.slice(0, i + 1))} className="rounded hover:text-foreground hover:underline focus-ring">
                      {step.title}
                    </button>
                  ) : (
                    <span className="text-foreground">{step.title}</span>
                  )}
                </span>
              ))}
            </nav>
          ) : null}
          <SheetTitle className="text-base">{current?.title}</SheetTitle>
          <SheetDescription className="text-xs">{formatRangeLabel(sliceRange)}</SheetDescription>
        </SheetHeader>

        {error ? (
          <div className="py-8"><EmptyState label={error} /></div>
        ) : (
          <div className={`space-y-6 py-4 transition-opacity ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [t('revenue'), formatCompactINR(totals.revenue)],
                [t('profit'), formatCompactINR(totals.profit)],
                [t('margin'), totals.marginPct != null ? `${Number(totals.marginPct).toFixed(1)}%` : '—'],
                [t('dispatchesUnit'), formatCompactNumber(totals.dispatches)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/60 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{data ? value : '—'}</dd>
                </div>
              ))}
            </dl>
            {totals.uncostedRevenue > 0 ? (
              <p className="-mt-3 text-[11px] text-muted-foreground">{formatCompactINR(totals.uncostedRevenue)} {t('uncostedRevenue')}</p>
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-foreground">{t('breakdownBy')}</h4>
                <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label={t('breakdownBy')}>
                  {byOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBy(d)}
                      aria-pressed={current?.by === d}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-ring ${current?.by === d ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {t(`dim_${d}`)}
                    </button>
                  ))}
                </div>
              </div>
              {loading && !data ? (
                <div className="flex h-40 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : rows.length === 0 ? (
                <EmptyState label={t('noData')} />
              ) : (
                <>
                  <RankedBars rows={rows} format={formatCompactINR} onSelect={canNarrow ? narrow : undefined} />
                  {totals.groups > rows.length ? (
                    <p className="text-[11px] text-muted-foreground">{t('showingTop')} {rows.length} / {totals.groups}</p>
                  ) : null}
                </>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground">
                {t('dispatchesInSlice')}
                {totals.dispatches > (data?.dispatches?.length || 0) ? (
                  <span className="ml-1 font-normal text-muted-foreground">({t('showingTop')} {data.dispatches.length} / {totals.dispatches})</span>
                ) : null}
              </h4>
              <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                {(data?.dispatches || []).map((d) => (
                  <Link
                    key={d.id}
                    href={`/stock?entityType=outbound_shipment&entityId=${d.id}`}
                    className="group flex items-center gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/60 focus-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {d.shipment_number} <span className="font-normal text-muted-foreground">· {d.dispatch_date}</span>
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{d.customer || '—'} · {d.salesperson || '—'}</p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatINR(d.value)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
                {data && !data.dispatches?.length ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('noData')}</p> : null}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
