'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Boxes, FileText, Plus, ReceiptText, Truck, ChevronRight, X, Package } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AttachmentField,
  FormSectionTitle,
  InlineNotice,
  StockDateField,
  StockFormField,
  StockMoneyField,
  SuggestCombobox,
  SuggestComboboxField,
} from './stock-form-fields';
import { FORM_CARD_CLASS, FORM_INPUT_CLASS, FORM_LABEL_CLASS, parseSizeLabelSqm, round3, toNumber } from '../lib/stock-utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { normalizePlate } from '@/lib/stock-inbound-trips.mjs';

// Transporter, truck and driver, plus the escape hatch for the rare delivery
// that shows up with no transport paperwork at all. Shared by the tile form and
// the flat-rate (bag/stone) form so all three enforce the same rule — see
// refineTransporter in lib/forms/stock-forms.js, which requires a note instead.
function TransporterFields({ form, suggestions, t, tc }) {
  // useWatch, not form.watch: see TripPicker.
  const unknown = useWatch({ control: form.control, name: 'transporterUnknown' });

  return (
    <>
      <SuggestComboboxField
        control={form.control}
        name="transporterName"
        label={tc?.transporter ?? 'Transporter'}
        placeholder={unknown ? 'Not recorded' : 'Transport company'}
        options={suggestions?.transporterName}
        disabled={unknown}
      />
      <StockFormField
        control={form.control}
        name="truckLicensePlate"
        label={t?.('truck') ?? 'Truck'}
        placeholder={unknown ? 'Not recorded' : 'RJ 14 XY 0000'}
        list="sg-truckLicensePlate"
        disabled={unknown}
      />
      <StockFormField
        control={form.control}
        name="driverName"
        label={t?.('driver') ?? 'Driver'}
        placeholder={unknown ? 'Not recorded' : 'Driver Name...'}
        list="sg-driverName"
        disabled={unknown}
      />
      <FormField
        control={form.control}
        name="transporterUnknown"
        render={({ field }) => (
          <FormItem className="flex items-start gap-2.5 sm:col-span-2 lg:col-span-3">
            <FormControl>
              <input
                type="checkbox"
                checked={Boolean(field.value)}
                onChange={(event) => {
                  field.onChange(event.target.checked);
                  if (event.target.checked) {
                    // Clear rather than keep-and-ignore, so what is stored
                    // matches what the form says was unavailable.
                    form.setValue('transporterName', '', { shouldValidate: true });
                    form.setValue('truckLicensePlate', '', { shouldValidate: true });
                    form.setValue('driverName', '', { shouldValidate: true });
                  }
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary"
              />
            </FormControl>
            <div className="space-y-0.5">
              <FormLabel className="text-xs font-medium text-foreground/70 cursor-pointer">
                {tc?.noTransporterDetails ?? 'No transporter details'}
              </FormLabel>
              <p className="text-[11px] font-medium text-muted-foreground">
                {unknown
                  ? 'Explain in the notes below why they are unavailable.'
                  : 'Tick this if the delivery arrived with no transport paperwork at all.'}
              </p>
            </div>
          </FormItem>
        )}
      />
    </>
  );
}

// Freight weight, stored in kg, typed in kg or tonnes. Shared by the tile and
// the bag/stone forms. The toggle sits beside the input at every width: stacked
// under it on a phone it stretched to a full-width bar with its buttons stuck
// to one end.
function FreightWeightField({ form, label }) {
  const [unit, setUnit] = useState('kg');
  return (
    <FormField
      control={form.control}
      name="freightWeightKg"
      render={({ field }) => {
        const displayValue = field.value === '' || field.value == null
          ? ''
          : unit === 't'
            ? String(round3(toNumber(field.value) / 1000))
            : field.value;
        return (
          <FormItem>
            <FormLabel className={FORM_LABEL_CLASS}>{label ?? 'Freight Weight'}</FormLabel>
            <div className="flex items-center gap-2">
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0"
                  inputMode="decimal"
                  className={`${FORM_INPUT_CLASS} min-w-0 flex-1`}
                  value={displayValue}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') { field.onChange(''); return; }
                    const num = parseFloat(raw);
                    if (isNaN(num)) return;
                    field.onChange(unit === 't' ? String(num * 1000) : raw);
                  }}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <div role="group" aria-label="Weight unit" className="inline-flex shrink-0 items-center rounded-full bg-slate-100 p-1 dark:bg-slate-800">
                {['kg', 't'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    aria-pressed={unit === u}
                    className={`h-8 min-w-10 rounded-full px-3 text-xs font-semibold transition-colors ${unit === u ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <FormMessage className="text-xs" />
          </FormItem>
        );
      }}
    />
  );
}

const inr = (value) => `\u20b9${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;

// Freight is charged once per lorry, and a lorry often brings several invoices.
// When the truck typed here already has a trip within a few days of this
// invoice, offer to add the invoice to it: the freight fields then show that
// trip's charge, shared by every invoice on it, instead of inviting a second
// copy of the same charge.
//
// Nothing is pre-selected. "Separate delivery" used to be ticked from the
// start, so an operator who never looked at this card booked the lorry again
// with the freight they had already typed - which is how RJ 10 GC 0916 was
// charged Rs 1,87,660 twice for 15 Sep. The choice is now the operator's to
// make, and tripChoice stays "" until they make it, which blocks the save.
// Separate is still allowed; it just has to be said out loud, and when the
// amount matches a trip already on the truck it has to be said twice.
function TripPicker({ form }) {
  const { language } = useLanguage();
  const tt = (key) => getTranslation(`stock.dashboard.${key}`, language);
  // useWatch subscribes this component itself. form.watch only re-renders the
  // component that called useForm, and only for names registered since the
  // last form.reset() - which clears that list. The purchase sheet resets the
  // form every time it opens or closes, so after that, typing a plate never
  // reached this component and the trip was never looked up.
  const [plate, date, watchedTripId, watchedChoice, typedTransport, typedLabour] = useWatch({
    control: form.control,
    name: ['truckLicensePlate', 'invoiceDate', 'tripId', 'tripChoice', 'transportCost', 'laborCost'],
  });
  const tripId = watchedTripId || '';
  const choice = watchedChoice || '';
  const [trips, setTrips] = useState([]);
  // The radio the operator actually clicked, kept apart from tripChoice: while
  // a matching amount is waiting to be confirmed, "separate" is selected on
  // screen but is not yet an answer the save will accept.
  const [pickedSeparate, setPickedSeparate] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // On edit, the purchase's own trip comes back too. Alone on it, that is not
  // "another delivery by this truck", so it is not offered.
  const ownTripId = String(form.formState.defaultValues?.tripId || '');

  useEffect(() => {
    // normalizePlate, not a copy of it: this has to key the truck exactly the
    // way the plate_key generated column does, or the form offers a trip the
    // server will not match, or misses one it would.
    const plateKey = normalizePlate(plate);
    if (plateKey.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      setTrips([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/stock/inbound-trips?plate=${encodeURIComponent(plateKey)}&date=${date}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { trips: null }))
        .then((json) => {
          if (!json.trips) return; // a failed lookup changes nothing
          setTrips(json.trips);
          // A trip picked for a different truck or date must not ride along.
          const current = form.getValues('tripId');
          if (current && !json.trips.some((trip) => String(trip.id) === String(current))) {
            form.setValue('tripId', '', { shouldDirty: true });
          }
        })
        .catch(() => {});
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [plate, date, form]);

  const offered = trips.filter((trip) => !(String(trip.id) === ownTripId && (trip.shipments?.length || 0) <= 1));

  // The freight being typed is already on one of this truck's trips. That is
  // not a coincidence worth waving through - it is what the same lorry keyed
  // twice looks like, down to the rupee.
  const amountMatch = offered.find(
    (trip) =>
      Number(typedTransport || 0) > 0 &&
      Number(typedTransport || 0) === Number(trip.delivery_cost || 0) &&
      Number(typedLabour || 0) === Number(trip.unloading_labour_cost || 0)
  );
  const needsConfirm = Boolean(amountMatch) && !tripId && pickedSeparate;

  // tripChoice is what the schema refuses to save while empty, so every path
  // through this card has to end by setting it. Derived in one place rather
  // than in each handler: the amounts can change after "separate" is picked,
  // and the answer has to follow them.
  useEffect(() => {
    const next = offered.length === 0
      ? 'none'
      : tripId
        ? String(tripId)
        : pickedSeparate && (!needsConfirm || confirmed)
          ? 'separate'
          : '';
    if (form.getValues('tripChoice') !== next) {
      form.setValue('tripChoice', next, { shouldDirty: false });
    }
  }, [offered.length, tripId, pickedSeparate, needsConfirm, confirmed, form]);

  if (offered.length === 0) return null;

  const join = (trip) => {
    setPickedSeparate(false);
    setConfirmed(false);
    form.setValue('tripId', String(trip.id), { shouldDirty: true });
    // Same lorry, same route. Overwritten rather than filled-if-empty: an origin
    // typed before picking the trip is the one that disagrees with the truck.
    if (trip.origin_city) {
      form.setValue('originCity', trip.origin_city, { shouldDirty: true, shouldValidate: true });
    }
    if (trip.destination_warehouse_name) {
      form.setValue('destinationWarehouseName', trip.destination_warehouse_name, { shouldDirty: true, shouldValidate: true });
    }
    // Stored in kg whichever unit the toggle shows; the field converts for display.
    if (Number(trip.freight_weight_kg) > 0) {
      form.setValue('freightWeightKg', String(Number(trip.freight_weight_kg)), { shouldDirty: true, shouldValidate: true });
    }
    form.setValue('transportCost', String(Number(trip.delivery_cost || 0)), { shouldDirty: true, shouldValidate: true });
    form.setValue('laborCost', String(Number(trip.unloading_labour_cost || 0)), { shouldDirty: true, shouldValidate: true });
  };
  const separate = () => {
    const joined = offered.find((trip) => String(trip.id) === String(tripId));
    setPickedSeparate(true);
    setConfirmed(false);
    form.setValue('tripId', '', { shouldDirty: true });
    // Leaving a trip with its charge still in the boxes is how the charge got
    // keyed twice in the first place, so it goes with the trip.
    if (joined
      && Number(form.getValues('transportCost') || 0) === Number(joined.delivery_cost || 0)
      && Number(form.getValues('laborCost') || 0) === Number(joined.unloading_labour_cost || 0)) {
      form.setValue('transportCost', '', { shouldDirty: true, shouldValidate: true });
      form.setValue('laborCost', '', { shouldDirty: true, shouldValidate: true });
    }
  };
  const selected = offered.find((trip) => String(trip.id) === String(tripId));
  // Not `!tripId`: that was true before the operator had answered anything,
  // which is exactly how the duplicate got saved without a decision.
  const separateChecked = pickedSeparate && !tripId;

  return (
    <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <p className="text-xs font-bold text-foreground">{tt('tripFoundTitle')}</p>
      <p className="text-[11px] text-muted-foreground">{tt('tripFoundHint')}</p>
      <div className="space-y-2" role="radiogroup" aria-label={tt('tripFoundTitle')}>
        {offered.map((trip) => {
          const invoices = (trip.shipments || []).map((ship) => ship.invoice_number || ship.shipment_number).filter(Boolean);
          const checked = String(trip.id) === String(tripId);
          return (
            <label
              key={trip.id}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? 'border-brand-primary bg-brand-primary/5' : 'border-border hover:bg-muted/40'}`}
            >
              <input type="radio" name="trip-choice" className="mt-1 accent-brand-primary" checked={checked} onChange={() => join(trip)} />
              <span className="min-w-0 space-y-1">
                <span className="block text-xs font-bold text-foreground">
                  {String(trip.arrival_date).split('-').reverse().join('/')} · {trip.truck_license_plate}{trip.driver_name ? ` · ${trip.driver_name}` : ''}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {tt('transportCost')} {inr(trip.delivery_cost)} · {tt('laborCost')} {inr(trip.unloading_labour_cost)}
                </span>
                <span className="block text-[11px] text-muted-foreground truncate" title={invoices.join(', ')}>
                  {invoices.length} {tt('tripInvoices')}: {invoices.join(', ')}
                </span>
              </span>
            </label>
          );
        })}
        <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${separateChecked ? 'border-brand-primary bg-brand-primary/5' : 'border-border hover:bg-muted/40'}`}>
          <input type="radio" name="trip-choice" className="accent-brand-primary" checked={separateChecked} onChange={separate} />
          <span className="text-xs font-bold text-foreground">{tt('tripSeparate')}</span>
        </label>
      </div>
      {selected ? (
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{tt('tripSharedFreightNote')}</p>
      ) : null}
      {needsConfirm ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 space-y-2">
          <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
            {tt('tripSameAmountWarning')}
          </p>
          <p className="text-[11px] text-rose-700/90 dark:text-rose-400/90">
            {String(amountMatch.arrival_date).split('-').reverse().join('/')} · {amountMatch.truck_license_plate} ·{' '}
            {tt('transportCost')} {inr(amountMatch.delivery_cost)} · {tt('laborCost')} {inr(amountMatch.unloading_labour_cost)}
            {(amountMatch.shipments || []).length
              ? ` — ${(amountMatch.shipments || []).map((ship) => ship.invoice_number || ship.shipment_number).filter(Boolean).join(', ')}`
              : ''}
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-rose-600"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{tt('tripSameAmountConfirm')}</span>
          </label>
        </div>
      ) : null}
      {choice === '' ? (
        <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{tt('tripChoiceRequired')}</p>
      ) : null}
    </div>
  );
}

// Bag and stone arrivals are the same form: a quantity x a unit rate, with no
// size/box math. Only the accent, labels and the per-item fields differ, so they
// share one component driven by this config rather than two near-copies.
export const FLAT_RATE_VARIANTS = {
  bag: {
    key: 'bag',
    badge: 'Bag',
    breadcrumb: 'Bag Goods',
    accentText: 'text-amber-700 dark:text-amber-400',
    accentDot: 'bg-amber-400',
    accentChip: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    accentAddBtn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20',
    accentSubmitBtn: 'bg-amber-600',
    addItemLabel: 'Add Bag Item',
    submitArrivalLabel: 'Submit Bag Purchase',
    submitDispatchLabel: 'Submit Bag Dispatch',
    arrivalDescription: 'Invoice and cost details for bag goods',
    dispatchTitle: 'Bag Dispatch Basics',
    dispatchDescription: 'Invoice and customer details for bag goods dispatch',
    gstPlaceholder: '18.0',
    unitOfMeasure: 'bag',
    typeSuggestKey: 'bagType',
    itemNameSuggestKey: 'bagItemName',
  },
  stone: {
    key: 'stone',
    badge: 'Stone',
    breadcrumb: 'Stone Goods',
    accentText: 'text-sky-700 dark:text-sky-400',
    accentDot: 'bg-sky-400',
    accentChip: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    accentAddBtn: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20',
    accentSubmitBtn: 'bg-sky-600',
    addItemLabel: 'Add Stone Item',
    submitArrivalLabel: 'Submit Stone Purchase',
    submitDispatchLabel: 'Submit Stone Dispatch',
    arrivalDescription: 'Invoice and cost details for stone traded by square foot',
    dispatchTitle: 'Stone Dispatch Basics',
    dispatchDescription: 'Invoice and customer details for stone dispatch',
    // Stone is taxed at 5%, tiles and bags at 18%.
    gstPlaceholder: '5.0',
    unitOfMeasure: 'sqft',
    typeSuggestKey: 'stoneType',
    itemNameSuggestKey: 'stoneItemName',
  },
};

const ArrivalItemRow = memo(function ArrivalItemRow({ index, fieldRow, control, item, activeItems, itemNames, onItemNameChange, onGradeChange, t, tc, language, totalItems, onRemoveItem }) {
  const isCatalogItem = Boolean(item?.itemId);
  const _sizeSqm = parseSizeLabelSqm(item?.sizeLabel);
  const _piecesPerBox = toNumber(item?.piecesPerBox);
  const _sqmPerBox = _sizeSqm && _piecesPerBox > 0 ? _sizeSqm * _piecesPerBox : null;
  const _orderedBoxes = toNumber(item?.orderedBoxes);
  const _wholeQty = toNumber(item?.wholeQty);
  const _brokenQty = toNumber(item?.brokenQty);
  const orderedQtySqmDisplay = _sqmPerBox != null ? round3(_sqmPerBox * _orderedBoxes) : null;
  const wholeQtySqmDisplay = _sqmPerBox != null ? round3(_sqmPerBox * _wholeQty) : null;
  const brokenQtySqmDisplay = _sqmPerBox != null ? round3(_sqmPerBox * _brokenQty) : null;

  return (
    <div key={fieldRow.id} className="glass-panel rounded-xl overflow-hidden group/item">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tc.itemLabel} {index + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${isCatalogItem ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
            {isCatalogItem ? tc.autofilledCatalog : tc.newTileEntry}
          </span>
          {totalItems > 1 && (
            <button
              type="button"
              onClick={() => onRemoveItem(index)}
              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove item"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-5">
        <div className="mb-4">
          <div>
            <div className={FORM_LABEL_CLASS}>{t('name')}</div>
            <FormField
              control={control}
              name={`items.${index}.itemName`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SuggestCombobox
                      value={field.value ?? ''}
                      onChange={(v) => onItemNameChange(index, v)}
                      onBlur={field.onBlur}
                      options={itemNames}
                      placeholder={tc.typeTileName}
                      className={FORM_INPUT_CLASS}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StockFormField control={control} name={`items.${index}.orderedBoxes`} label={tc.ordered} type="number" placeholder="0" min="0" />
            <StockFormField control={control} name={`items.${index}.wholeQty`} label={tc.wholeBox} type="number" placeholder="0" min="0"  />
            <StockFormField control={control} name={`items.${index}.brokenQty`} label={tc.brokenTiles} type="number"  placeholder="0"  min="0"/>
          </div>
        <div className="grid gap-3 sm:grid-cols-3 p-3 rounded-xl bg-muted/50 border border-border">
          {[
            { label: tc.orderedSqm, value: orderedQtySqmDisplay },
            { label: tc.wholeSqm, value: wholeQtySqmDisplay },
            { label: tc.brokenSqm, value: brokenQtySqmDisplay },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-xs font-medium text-slate-500/60 mb-1">{label}</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">{value ?? '—'}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-400">
            {isCatalogItem ? tc.catalogIntelligence : tc.technicalEntry}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <StockFormField control={control} name={`items.${index}.brandName`} label={tc.brand} placeholder={tc.brand} disabled={isCatalogItem} list="sg-brandName" />
            <FormField
              control={control}
              name={`items.${index}.divisionName`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={FORM_LABEL_CLASS}>{tc.division}</FormLabel>
                  {isCatalogItem ? (
                    <Input disabled value={field.value ?? ''} className={FORM_INPUT_CLASS} />
                  ) : (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={FORM_INPUT_CLASS}>
                          <SelectValue placeholder={tc.division} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Ceramic">Ceramic</SelectItem>
                        <SelectItem value="Eternity (GVT)">Eternity (GVT)</SelectItem>
                        <SelectItem value="Vitronite (PVT)">Vitronite (PVT)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`items.${index}.finish`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={FORM_LABEL_CLASS}>{tc.finish}</FormLabel>
                  {isCatalogItem ? (
                    <Input disabled value={field.value ?? ''} className={FORM_INPUT_CLASS} />
                  ) : (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={FORM_INPUT_CLASS}>
                          <SelectValue placeholder={tc.finish} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Polished">Polished</SelectItem>
                        <SelectItem value="Vitrified">Vitrified</SelectItem>
                        <SelectItem value="Matte">Matte</SelectItem>
                        <SelectItem value="Satin">Satin</SelectItem>
                        <SelectItem value="Carving">Carving</SelectItem>
                        <SelectItem value="High-gloss">High-gloss</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`items.${index}.grade`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={FORM_LABEL_CLASS}>{tc.quality}</FormLabel>
                  <Select value={field.value || ''} onValueChange={(v) => onGradeChange ? onGradeChange(index, v) : field.onChange(v)}>
                    <FormControl>
                      <SelectTrigger className={FORM_INPUT_CLASS}>
                        <SelectValue placeholder={tc.quality} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Premium">Premium</SelectItem>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <StockFormField control={control} name={`items.${index}.sizeWidthMm`} label={`${tc.width} (${tc.mm})`} type="number" placeholder="800" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.sizeLengthMm`} label={`${tc.length} (${tc.mm})`} type="number" placeholder="800" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.piecesPerBox`} label={tc.piecesPerBox} type="number" placeholder="2" min="0" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.hsnCode`} label={tc.hsn} placeholder={tc.hsn} list="sg-hsnCode" disabled={isCatalogItem} digitsOnly />
            <StockFormField control={control} name={`items.${index}.thicknessMm`} label={`${tc.thickness} (${tc.mm})`} type="number" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.costPerSqm`} label={t('costPerSqm')} type="number" min="0" step="0.01" />
            <StockFormField control={control} name={`items.${index}.discountAmount`} label="Discount (₹)" type="number" placeholder="0" min="0" step="0.01" />
            <StockFormField control={control} name={`items.${index}.description`} label={tc.description} placeholder="Notes..." className="sm:col-span-2 lg:col-span-3 2xl:col-span-4" disabled={isCatalogItem} />
          </div>
        </div>
      </div>
    </div>
  );
});

const FlatRateArrivalItemRow = memo(function FlatRateArrivalItemRow({ index, fieldRow, control, variant, bagTypes, bagBrands, bagItemNames, onItemNameChange, tc, totalItems, onRemoveItem }) {
  const v = variant ?? FLAT_RATE_VARIANTS.bag;
  const isStone = v.key === 'stone';
  return (
    <div key={fieldRow.id} className="glass-panel rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${v.accentDot}`} />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tc?.itemLabel ?? 'Item'} {index + 1}</span>
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${v.accentChip}`}>{v.badge}</span>
        </div>
        {totalItems > 1 && (
          <button type="button" onClick={() => onRemoveItem(index)} className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className={FORM_LABEL_CLASS}>{tc?.productName ?? 'Product Name'}</div>
            <FormField
              control={control}
              name={`items.${index}.itemName`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SuggestCombobox
                      value={field.value ?? ''}
                      onChange={(v) => onItemNameChange(index, v)}
                      onBlur={field.onBlur}
                      options={bagItemNames}
                      placeholder={tc?.selectProduct ?? 'Select Product'}
                      className={FORM_INPUT_CLASS}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
          <SuggestComboboxField control={control} name={`items.${index}.brandName`} label={tc?.brand ?? 'Brand'} placeholder={tc?.brand ?? 'Brand'} options={bagBrands} />
          <SuggestComboboxField control={control} name={`items.${index}.typeName`} label={tc?.type ?? 'Type'} placeholder={tc?.type ?? 'Type'} options={bagTypes} />
          {isStone ? (
            <StockFormField control={control} name={`items.${index}.qtySqft`} label={tc?.qtySqft ?? 'Qty (Sqft)'} type="number" placeholder="0" min="0" step="0.001" />
          ) : (
            <StockFormField control={control} name={`items.${index}.qtyBags`} label={tc?.qtyBags ?? 'Qty (Bags)'} type="number" placeholder="0" min="0" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isStone ? (
            <>
              <StockFormField control={control} name={`items.${index}.ratePerSqft`} label={tc?.ratePerSqft ?? 'Rate per Sqft (₹)'} type="number" placeholder="0" min="0" step="0.01" />
              {/* Slab size is recorded per delivery — it changes next time, so it is
                  a note on this consignment, not a property of the item. */}
              <StockFormField control={control} name={`items.${index}.sizeLabel`} label={tc?.slabSize ?? 'Slab Size (this delivery)'} placeholder="e.g. 2x2 ft" />
              <StockFormField control={control} name={`items.${index}.thicknessMm`} label={`${tc?.thickness ?? 'Thickness'} (${tc?.mm ?? 'mm'})`} type="number" placeholder="25" min="0" step="0.01" />
            </>
          ) : (
            <>
              <StockFormField control={control} name={`items.${index}.weightPerUnitKg`} label={tc?.weightPerBag ?? 'Weight per Bag (kg)'} type="number" placeholder="25" min="0" step="0.1" />
              <StockFormField control={control} name={`items.${index}.ratePerBag`} label={tc?.ratePerBag ?? 'Rate per Bag (₹)'} type="number" placeholder="0" min="0" step="0.01" />
            </>
          )}
          <StockFormField control={control} name={`items.${index}.discountAmount`} label="Discount (₹)" type="number" placeholder="0" min="0" step="0.01" />
          <StockFormField control={control} name={`items.${index}.hsnCode`} label={tc?.hsn ?? 'HSN Code'} placeholder={tc?.hsn ?? 'HSN Code'} list="sg-hsnCode" digitsOnly />
        </div>
        <StockFormField control={control} name={`items.${index}.description`} label={tc?.description ?? 'Description'} placeholder={tc?.notesPlaceholder ?? 'Notes...'} />
      </div>
    </div>
  );
});

export function FlatRateArrivalFormContent({
  form,
  itemsFieldArray,
  attachments,
  setAttachment,
  onSubmit,
  onInvalid,
  submitting,
  notice,
  suggestions,
  activeItems,
  onItemNameChange,
  onAddItem,
  t,
  tc,
  variant,
}) {
  const v = variant ?? FLAT_RATE_VARIANTS.bag;
  const bagTypes = suggestions?.[v.typeSuggestKey] || [];
  const bagItemNames = suggestions?.[v.itemNameSuggestKey] || [];
  const bagBrands = useMemo(() => {
    const seen = new Set();
    return (activeItems || [])
      .filter((i) => i.unit_of_measure === v.unitOfMeasure && i.brand_name)
      .map((i) => i.brand_name)
      .filter((b) => { if (seen.has(b)) return false; seen.add(b); return true; });
  }, [activeItems, v.unitOfMeasure]);

  return (
    <Form {...form}>
      <form className="mt-6" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <fieldset disabled={submitting} className="space-y-6 border-0 p-0 m-0 min-w-0">
        {Object.entries(suggestions || {}).map(([key, values]) => (
          <datalist key={key} id={`sg-${key}`}>
            {[...new Set(values || [])].map((v, idx) => <option key={`${key}-${idx}`} value={v} />)}
          </datalist>
        ))}
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Intake Strategy" icon={FileText} title="Purchase Basics" description={v.arrivalDescription} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <SuggestComboboxField control={form.control} name="supplierName" label={t?.('supplier') ?? 'Supplier'} placeholder="Supplier Name..." options={suggestions?.supplierName} />
            <StockFormField control={form.control} name="invoiceNumber" label={t?.('invoiceNo') ?? 'Invoice No.'} placeholder="INV-..." invoiceChars />
            <StockDateField control={form.control} name="invoiceDate" label={tc?.invoiceDate ?? 'Invoice Date'} placeholder="Invoice Date" />
            <StockFormField control={form.control} name="handlingCostPercent" label="Handling Cost %" type="number" placeholder="1.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="fuelCostPercent" label="Fuel Cost %" type="number" placeholder="5.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="gstPercent" label="GST %" type="number" placeholder={v.gstPlaceholder} min="0" step="0.1" />
            <StockFormField control={form.control} name="discountAmount" label="Shipment Discount (₹)" type="number" placeholder="0" min="0" step="0.01" />
            <AttachmentField label={tc?.invoicePhoto ?? 'Invoice Photo'} file={attachments?.purchaseInvoice} onChange={(file) => setAttachment('purchaseInvoice', file)} hint={tc?.invoicePhotoHint} tc={tc} />
            <AttachmentField label={tc?.transporterBillPhoto ?? 'Transporter Bill'} file={attachments?.transporterBill} onChange={(file) => setAttachment('transporterBill', file)} accept="image/*" hint={tc?.transporterBillHint} tc={tc} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Mobility Details" icon={Truck} title={tc?.transportInvoice ?? 'Transport & Vehicle'} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <TransporterFields form={form} suggestions={suggestions} t={t} tc={tc} />
            <TripPicker form={form} />
            <SuggestComboboxField control={form.control} name="originCity" label={tc?.originCity ?? 'Origin City'} placeholder="Source city" options={suggestions?.originCity} />
            <SuggestComboboxField control={form.control} name="destinationWarehouseName" label={tc?.destinationWarehouse ?? 'Destination Warehouse'} placeholder="Warehouse name" options={suggestions?.destinationWarehouseName} />
            <StockMoneyField control={form.control} name="transportCost" label={t?.('transportCost') ?? 'Transport Cost'} hint={tc?.amountInInr} />
            <StockMoneyField control={form.control} name="laborCost" label={t?.('laborCost') ?? 'Labour Cost'} hint={tc?.amountInInr} />
            <FreightWeightField form={form} label={tc?.weightKg ?? 'Freight Weight'} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <div className="flex justify-between items-center mb-4 gap-4 px-1">
            <div className="space-y-1">
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Inventory Hub</span>
                <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                <span className={v.accentText}>{v.breadcrumb}</span>
              </nav>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Items</h3>
            </div>
          </div>
          <div className="space-y-4">
            {itemsFieldArray.fields.map((fieldRow, index) => (
              <FlatRateArrivalItemRow
                key={fieldRow.id}
                index={index}
                fieldRow={fieldRow}
                control={form.control}
                variant={v}
                bagTypes={bagTypes}
                bagBrands={bagBrands}
                bagItemNames={bagItemNames}
                onItemNameChange={onItemNameChange}
                tc={tc}
                totalItems={itemsFieldArray.fields.length}
                onRemoveItem={(i) => itemsFieldArray.remove(i)}
              />
            ))}
            <button
              type="button"
              onClick={onAddItem}
              className={`inline-flex mb-4 mt-4 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${v.accentAddBtn}`}
            >
              <Plus className="h-3.5 w-3.5" />
              {v.addItemLabel}
            </button>
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{t?.('notes') ?? 'Notes'}</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ''} className={FORM_INPUT_CLASS} rows={3} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
        <InlineNotice notice={notice} />
        </fieldset>
        <button
          type="submit"
          disabled={submitting}
          className={`mt-6 w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${v.accentSubmitBtn}`}
        >
          <span className="inline-flex items-center gap-3">
            <Package className="h-5 w-5" />
            {submitting ? (tc?.submitting ?? 'Submitting...') : v.submitArrivalLabel}
          </span>
        </button>
      </form>
    </Form>
  );
}

// Existing call sites keep importing BagArrivalFormContent unchanged.
export function BagArrivalFormContent(props) {
  return <FlatRateArrivalFormContent {...props} variant={FLAT_RATE_VARIANTS.bag} />;
}

export function StoneArrivalFormContent(props) {
  return <FlatRateArrivalFormContent {...props} variant={FLAT_RATE_VARIANTS.stone} />;
}

export function ArrivalFormContent({
  form,
  itemsFieldArray,
  watchedItems,
  attachments,
  setAttachment,
  onSubmit,
  onInvalid,
  submitting,
  onGradeChange,
  notice,
  suggestions,
  activeItems,
  onItemNameChange,
  onAddItem,
  t,
  tc,
  language,
}) {
  const percentFieldClass = 'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';
  const itemNames = useMemo(() => (activeItems || []).map((it) => it.name).filter(Boolean), [activeItems]);

  return (
    <Form {...form}>
      <form className="mt-6" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <fieldset disabled={submitting} className="space-y-6 border-0 p-0 m-0 min-w-0">
        {Object.entries(suggestions).map(([key, values]) => (
          <datalist key={key} id={`sg-${key}`}>
            {[...new Set(values || [])].map((v, idx) => <option key={`${key}-${idx}`} value={v} />)}
          </datalist>
        ))}
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Intake Strategy" icon={FileText} title={tc.purchaseBasics} description={tc.purchaseBasicsDesc} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <SuggestComboboxField control={form.control} name="supplierName" label={t('supplier')} placeholder="Supplier Name..." options={suggestions.supplierName} />
            <StockFormField control={form.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." invoiceChars />
            <StockDateField control={form.control} name="invoiceDate" label={tc.invoiceDate} placeholder={tc.invoiceDate} />
            <StockFormField control={form.control} name="handlingCostPercent" label={`${tc.handlingCost} %`} type="number" placeholder="1.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="fuelCostPercent" label={`${tc.fuelCost} %`} type="number" placeholder="5.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="gstPercent" label={`${tc.gst} %`} type="number" placeholder="18.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="discountAmount" label="Shipment Discount (₹)" type="number" placeholder="0" min="0" step="0.01" />
            <AttachmentField label={tc.invoicePhoto} file={attachments.purchaseInvoice} onChange={(file) => setAttachment('purchaseInvoice', file)} hint={tc.invoicePhotoHint} tc={tc} />
            <AttachmentField label={tc.transporterBillPhoto} file={attachments.transporterBill} onChange={(file) => setAttachment('transporterBill', file)} accept="image/*" hint={tc.transporterBillHint} tc={tc} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Mobility Details" icon={Truck} title={tc.transportInvoice} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <TransporterFields form={form} suggestions={suggestions} t={t} tc={tc} />
            <TripPicker form={form} />
            <SuggestComboboxField control={form.control} name="originCity" label={tc.originCity} placeholder="Source city" options={suggestions.originCity} />
            <SuggestComboboxField control={form.control} name="destinationWarehouseName" label={tc.destinationWarehouse} placeholder="Warehouse name" options={suggestions.destinationWarehouseName} />
            <StockMoneyField control={form.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
            <StockMoneyField control={form.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
            <FreightWeightField form={form} label={tc.weightKg} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <div className="flex justify-between items-center mb-4 gap-4 px-1">
            <div className="space-y-1">
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>{tc.inventoryHub}</span>
                <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                <span className="text-brand-primary">{tc.assets}</span>
              </nav>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{t('items')}</h3>
            </div>

          </div>
          <div className="space-y-4">
            
            {itemsFieldArray.fields.map((fieldRow, index) => (
              <ArrivalItemRow
                key={fieldRow.id}
                index={index}
                fieldRow={fieldRow}
                control={form.control}
                item={watchedItems[index] || fieldRow}
                activeItems={activeItems}
                itemNames={itemNames}
                onItemNameChange={onItemNameChange}
                onGradeChange={onGradeChange}
                t={t}
                tc={tc}
                language={language}
                totalItems={itemsFieldArray.fields.length}
                onRemoveItem={(i) => itemsFieldArray.remove(i)}
              />
            ))}
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex mb-4 items-center gap-2 rounded-lg bg-brand-primary/10 px-4 py-2 text-[13px] font-semibold text-brand-primary transition hover:bg-brand-primary/20 active:scale-[0.96]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('addItem')}
            </button>
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{t('notes')}</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ''} className={FORM_INPUT_CLASS} rows={3} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
        <InlineNotice notice={notice} />
        </fieldset>
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-3">
            <ReceiptText className="h-5 w-5" />
            {submitting ? tc.submitting : tc.submitPurchase}
          </span>
        </button>
      </form>
    </Form>
  );
}
