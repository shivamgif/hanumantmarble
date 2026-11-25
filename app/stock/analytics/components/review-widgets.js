'use client';

// The admin page's review tabs. Kept out of widgets.js so the admin page
// doesn't pull recharts (about 130 KB gzipped) in for two tables.
import { Fragment, useState } from 'react';
import { ChevronDown, Truck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import {
  AnalyticsCard,
  EmptyState,
  formatCompactNumber,
  formatINR,
  formatCompactINR,
} from '../../components/dashboard-ui';

function formatTripDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day && month ? `${day}/${month}/${year.slice(2)}` : String(value);
}

// What a truck-day row says about its freight. One trip means its invoices
// share a single charge, which is the healthy case. A figure that appears more
// than once among the trips is the charge keyed twice, even when another
// invoice on the same lorry carries a different one. Trips whose figures are
// all different might be two real deliveries, so nothing is claimed.
function tripFreightStatus(trip) {
  if (Number(trip.trip_count || 1) <= 1) return 'shared';
  return trip.has_repeat ? 'repeated' : 'mixed';
}

// The shipments behind one trip. Rendered under the table row and inside the
// mobile card, so it lives on its own rather than being written twice.
function TripShipments({ shipments, t }) {
  if (!shipments || shipments.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('shipmentNumber')}</th>
            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('invoiceNumber')}</th>
            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('supplierName')}</th>
            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('unitsReceived')}</th>
            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('goodsValue')}</th>
            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('freightLabel')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {shipments.map((ship) => (
            <tr key={ship.id}>
              <td className="px-4 py-2 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{ship.shipment_number}</td>
              <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{ship.invoice_number || '\u2014'}</td>
              <td className="px-4 py-2 text-slate-500 truncate max-w-[180px]" title={ship.supplier || ''}>{ship.supplier || '\u2014'}</td>
              <td className="px-4 py-2 text-right font-sans font-bold text-slate-500 tabular-nums">{formatCompactNumber(ship.units)}</td>
              <td className="px-4 py-2 text-right font-sans font-bold text-slate-500">{formatCompactINR(ship.goods)}</td>
              <td className="px-4 py-2 text-right font-sans font-bold text-slate-900 dark:text-white">
                {ship.freight != null ? formatINR(ship.freight) : <span className="text-slate-400">{'\u2014'}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Freight per truck trip.
//
// The books do not have a "trip" - they have inbound shipments, and one lorry
// that arrives carrying four invoices is entered four times. Whoever keys the
// second shipment keys the freight again, so the charge is counted as many
// times as the load was split. Plate + arrival date is the closest thing the
// schema has to a trip identity; the driver name is shown but not part of it,
// because one misspelling used to split a lorry into two innocent-looking rows.
export function FreightTripsWidget({ trips, summary }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  // One row open at a time: the expanded block is a table of its own, and two
  // of them stacked makes the page unreadable on a phone.
  const [openTrip, setOpenTrip] = useState(null);
  const tripKey = (trip) => `${trip.plate}-${trip.arrival_date}`;

  const freightTotal = Number(summary?.freight_total || 0);
  const goodsTotal = Number(summary?.goods_total || 0);
  const freightShare = goodsTotal > 0 ? (freightTotal / goodsTotal) * 100 : null;
  const repeatedTotal = Number(trips?.[0]?.all_repeated_amount || 0);

  if (!trips || trips.length === 0) {
    return (
      <AnalyticsCard title={t('freightTrips')} subtitle={t('freightTripsSubtitle')}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }

  return (
    <AnalyticsCard
      title={t('freightTrips')}
      subtitle={t('freightTripsSubtitle')}
      topRight={
        <div className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-rose-500" />
          <span className="font-sans text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {formatCompactINR(repeatedTotal)}
          </span>
          <span className="text-xs font-medium text-slate-400">{t('repeatedFreight')}</span>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
          <p className="text-xs font-medium text-slate-400 mb-1">{t('freightBooked')}</p>
          <p className="font-sans text-base font-bold text-slate-900 dark:text-white">{formatCompactINR(freightTotal)}</p>
        </div>
        <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
          <p className="text-xs font-medium text-slate-400 mb-1">{t('ofGoodsValue')}</p>
          <p className="font-sans text-base font-bold text-amber-600 dark:text-amber-400">
            {freightShare != null ? `${freightShare.toFixed(1)}%` : '\u2014'}
          </p>
        </div>
        <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
          <p className="text-xs font-medium text-slate-400 mb-1">{t('repeatedFreight')}</p>
          <p className="font-sans text-base font-bold text-rose-600 dark:text-rose-400">{formatCompactINR(repeatedTotal)}</p>
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('licensePlate')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('driverName')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('arrivedOn')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('shipmentsLabel')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('freightExpected')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('freightBooked')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('goodsValue')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('repeatedFreight')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {trips.map((trip) => {
              const key = tripKey(trip);
              const isOpen = openTrip === key;
              return (
              <Fragment key={key}>
              <tr
                className="group hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setOpenTrip(isOpen ? null : key)}
                aria-expanded={isOpen}
              >
                <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 text-xs whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                      aria-label={t('expandTrip')}
                    />
                    {trip.plate}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-[140px]" title={trip.driver}>{trip.driver}</td>
                <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{formatTripDate(trip.arrival_date)}</td>
                <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-900 dark:text-white tabular-nums">
                  {trip.shipments}
                  {Number(trip.trip_count) > 1 ? (
                    <span className="block text-[11px] font-bold text-slate-400">{trip.trip_count} {t('tripsLabel')}</span>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-500">{formatINR(trip.freight_expected)}</td>
                <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-900 dark:text-white">{formatCompactINR(trip.freight_booked)}</td>
                <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-500">{formatCompactINR(trip.goods_value)}</td>
                <td className="px-6 py-4 text-right">
                  {tripFreightStatus(trip) === 'repeated' ? (
                    <span className="font-sans font-bold text-xs text-rose-600 dark:text-rose-400" title={t('sameAmountFlag')}>
                      {formatCompactINR(trip.repeated_amount)}
                    </span>
                  ) : (
                    <span className={`text-xs font-semibold ${tripFreightStatus(trip) === 'shared' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {t(tripFreightStatus(trip) === 'shared' ? 'sharedTripFlag' : 'mixedAmountFlag')}
                    </span>
                  )}
                </td>
              </tr>
              {isOpen ? (
                <tr>
                  <td colSpan={8} className="px-6 pb-6 pt-0 bg-muted/30">
                    <TripShipments shipments={trip.shipments_detail} t={t} />
                  </td>
                </tr>
              ) : null}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-4">
        {trips.map((trip) => {
          const key = tripKey(trip);
          const isOpen = openTrip === key;
          return (
          <div key={`trip-mob-${key}`} className="p-6 rounded-lg border border-border/60 bg-muted/20 space-y-4">
            <button
              type="button"
              className="flex w-full justify-between items-start gap-2 text-left focus-ring"
              onClick={() => setOpenTrip(isOpen ? null : key)}
              aria-expanded={isOpen}
            >
              <span className="min-w-0">
                <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                    aria-label={t('expandTrip')}
                  />
                  {trip.plate}
                </span>
                <span className="block text-[11px] text-slate-500 mt-1 truncate">{trip.driver} · {formatTripDate(trip.arrival_date)}</span>
              </span>
              {tripFreightStatus(trip) === 'repeated' ? (
                <span className="font-sans text-sm font-bold text-rose-600 dark:text-rose-400 shrink-0">{formatCompactINR(trip.repeated_amount)}</span>
              ) : (
                <span className={`text-xs font-semibold shrink-0 ${tripFreightStatus(trip) === 'shared' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {t(tripFreightStatus(trip) === 'shared' ? 'sharedTripFlag' : 'mixedAmountFlag')}
                </span>
              )}
            </button>
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border/60">
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">{t('shipmentsLabel')}</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {trip.shipments}{Number(trip.trip_count) > 1 ? ` · ${trip.trip_count} ${t('tripsLabel')}` : ''}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-slate-400 mb-1">{t('freightExpected')}</p>
                <p className="text-xs font-bold text-slate-500">{formatINR(trip.freight_expected)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-400 mb-1">{t('freightBooked')}</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{formatCompactINR(trip.freight_booked)}</p>
              </div>
            </div>
            {isOpen ? (
              <div className="overflow-x-auto">
                <TripShipments shipments={trip.shipments_detail} t={t} />
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">{t('freightNote')}</p>
    </AnalyticsCard>
  );
}

// How sure the pair is, and how it reads on screen. Certain is not a promise -
// it is "the names differ by a slip and both were bought at the same price",
// which is as far as the catalogue can argue on its own.
const DUPLICATE_TONES = {
  certain: 'text-rose-600 dark:text-rose-400',
  likely: 'text-amber-600 dark:text-amber-400',
  check: 'text-slate-500',
};

// The two product rows behind one pair, side by side, with the purchases that
// built each of them. This is what settles it: the same tile bought twice at
// one price under two spellings looks nothing like two products that happen to
// read alike.
function DuplicateItemSides({ pair, t }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {pair.items.map((side) => (
        <div key={side.id} className="rounded-lg border border-border/60 bg-background/60 p-4 space-y-2">
          <p className="text-xs font-bold text-slate-900 dark:text-white break-words">{side.name}</p>
          <p className="text-[11px]  text-slate-500 break-all">{side.sku}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>{t('stockLabel')}: <b className="text-slate-900 dark:text-white">{formatCompactNumber(side.qty)}</b></span>
            <span>{t('salesLabel')}: <b className="text-slate-900 dark:text-white">{formatCompactNumber(side.sells)}</b></span>
            <span>{t('avgCost')}: <b className="text-slate-900 dark:text-white">{side.unit_cost ? formatINR(side.unit_cost) : '—'}</b></span>
            {side.is_active ? null : (
              <span className="font-medium text-slate-400">{t('inactiveLabel')}</span>
            )}
          </div>
          {(side.purchases || []).length ? (
            <ul className="space-y-1 pt-1 border-t border-border/40">
              {side.purchases.map((buy) => (
                <li key={buy.shipment_number} className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                  <span className="tabular-nums">{formatTripDate(buy.arrival_date)}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{buy.invoice_number || buy.shipment_number}</span>
                  <span className="tabular-nums">{formatCompactNumber(buy.qty)} @ {buy.unit_cost ? formatINR(buy.unit_cost) : '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400 pt-1 border-t border-border/40">{t('noPurchases')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// The same tile, entered twice as two products.
//
// A product row is minted by its generated SKU, so a name typed a shade
// differently becomes a second product and the tile's stock splits across both
// - invisible to whoever searches the other spelling. Rows here are candidate
// pairs, ranked by how hard the catalogue argues for them; the judgement is
// still the reader's, which is why nothing here merges anything.
//
// Grade is part of the identity, so a Commercial and a Premium of one design
// never appear. They are different products at different prices, and reading
// them as duplicates would bury the handful of real ones.
export function DuplicateItemsWidget({ pairs, summary }) {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.analytics.${key}`, language);
  const [openPair, setOpenPair] = useState(null);

  if (!pairs || pairs.length === 0) {
    return (
      <AnalyticsCard title={t('duplicateItems')} subtitle={t('duplicateItemsSubtitle')}>
        <EmptyState label={t('noData')} />
      </AnalyticsCard>
    );
  }

  const strandedValue = Number(summary?.strandedValue || 0);

  return (
    <AnalyticsCard
      title={t('duplicateItems')}
      subtitle={t('duplicateItemsSubtitle')}
      topRight={
        <div className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-rose-500" />
          <span className="font-sans text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {summary?.pairCount ?? pairs.length}
          </span>
          <span className="text-xs font-medium text-slate-400">{t('duplicatePairs')}</span>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
          <p className="text-xs font-medium text-slate-400 mb-1">{t('confidentPairs')}</p>
          <p className="font-sans text-base font-bold text-rose-600 dark:text-rose-400">{summary?.certainCount ?? 0}</p>
        </div>
        <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
          <p className="text-xs font-medium text-slate-400 mb-1">{t('productsInvolved')}</p>
          <p className="font-sans text-base font-bold text-slate-900 dark:text-white">{summary?.productCount ?? 0}</p>
        </div>
        <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
          <p className="text-xs font-medium text-slate-400 mb-1">{t('strandedStock')}</p>
          <p className="font-sans text-base font-bold text-amber-600 dark:text-amber-400">{formatCompactINR(strandedValue)}</p>
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('productPair')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('specLabel')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('costRatio')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('strandedStock')}</th>
              <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t('confidenceLabel')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {pairs.map((pair) => {
              const isOpen = openPair === pair.key;
              const [a, b] = pair.items;
              return (
                <Fragment key={pair.key}>
                  <tr
                    className="group hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setOpenPair(isOpen ? null : pair.key)}
                    aria-expanded={isOpen}
                  >
                    <td className="px-6 py-4 text-xs">
                      <span className="flex items-start gap-2">
                        <ChevronDown
                          className={`w-3.5 h-3.5 mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                          aria-label={t('expandPair')}
                        />
                        <span className="min-w-0">
                          <span className="block font-bold text-slate-900 dark:text-slate-100 break-words">{a.name}</span>
                          <span className="block text-slate-500 break-words">{b.name}</span>
                          {pair.sharesPurchase ? (
                            <span className="inline-block mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              {t('samePurchaseFlag')}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                      {a.brand} · {a.size}{a.grade ? ` · ${a.grade}` : ''}
                    </td>
                    <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-500 tabular-nums">
                      {pair.costRatio == null ? '—' : `×${pair.costRatio.toFixed(2)}`}
                    </td>
                    <td className="px-6 py-4 text-right font-sans font-bold text-xs text-slate-900 dark:text-white">
                      {formatCompactINR(pair.strandedValue)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-xs font-semibold ${DUPLICATE_TONES[pair.confidence]}`}>
                        {t(`duplicate_${pair.confidence}`)}
                      </span>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={5} className="px-6 pb-6 pt-0 bg-muted/30">
                        <DuplicateItemSides pair={pair} t={t} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-4">
        {pairs.map((pair) => {
          const isOpen = openPair === pair.key;
          const [a, b] = pair.items;
          return (
            <div key={`dup-mob-${pair.key}`} className="p-6 rounded-lg border border-border/60 bg-muted/20 space-y-4">
              <button
                type="button"
                className="flex w-full justify-between items-start gap-2 text-left focus-ring"
                onClick={() => setOpenPair(isOpen ? null : pair.key)}
                aria-expanded={isOpen}
              >
                <span className="min-w-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-white flex items-start gap-2">
                    <ChevronDown
                      className={`w-3.5 h-3.5 mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                      aria-label={t('expandPair')}
                    />
                    <span className="min-w-0 break-words">{a.name}</span>
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-1 ml-6 break-words">{b.name}</span>
                  <span className="block text-[11px] text-slate-400 mt-1 ml-6">
                    {a.brand} · {a.size}{a.grade ? ` · ${a.grade}` : ''}
                  </span>
                </span>
                <span className={`text-xs font-semibold shrink-0 ${DUPLICATE_TONES[pair.confidence]}`}>
                  {t(`duplicate_${pair.confidence}`)}
                </span>
              </button>
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border/60">
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('costRatio')}</p>
                  <p className="text-xs font-bold text-slate-500 tabular-nums">
                    {pair.costRatio == null ? '—' : `×${pair.costRatio.toFixed(2)}`}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('strandedStock')}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{formatCompactINR(pair.strandedValue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-400 mb-1">{t('samePurchaseShort')}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{pair.sharesPurchase ? t('yes') : t('no')}</p>
                </div>
              </div>
              {isOpen ? <DuplicateItemSides pair={pair} t={t} /> : null}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">{t('duplicateItemsNote')}</p>
    </AnalyticsCard>
  );
}
