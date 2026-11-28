'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Check, FileText, MapPin, Plus, Send, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { SelectField } from '@/components/ui/select';
import { CARTAGE_SAC, computeInvoiceTotals, exclusiveRate, GST_STATES } from '@/lib/gst-invoice.mjs';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { CustomerPhoneNameFields, FormSectionTitle, InlineNotice, StockDateField, StockFormField, SuggestComboboxField } from './stock-form-fields';
import { DispatchItemRow } from './dispatch-form';
import { FORM_CARD_CLASS, FORM_INPUT_CLASS, FORM_LABEL_CLASS, SUBMIT_BUTTON_CLASS, SUBMIT_SECONDARY_CLASS } from '../lib/stock-utils';

/** stock.invoices.* in the current language, with {slots} filled from `vars`. */
export function useInvoiceText() {
  const { language } = useLanguage();
  return useCallback(
    (key, vars) => String(getTranslation(`stock.invoices.${key}`, language)).replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? ''),
    [language]
  );
}

/** Displayed status: "dispatched" is derived from a live linked shipment. */
export function invoiceStatus(invoice) {
  return invoice.dispatch_id ? 'dispatched' : invoice.status;
}

export const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Printed as typed, like Tally's ledger names, so kept in English.
const CHARGE_NAMES = ['Cartage', 'Loading', 'Unloading'];
const newCharge = () => ({ label: 'Cartage', sacCode: CARTAGE_SAC, amount: '', gstRate: '18' });
// Rates and charges are typed with GST in; the preview converts them as the server will.
/** A form charge row as an invoice line, for the totals preview (the server builds the stored one). */
const chargeLine = (row) => ({ itemCategory: 'charge', ratePerUnit: exclusiveRate(row.amount, row.gstRate || 18), gstRate: row.gstRate });
const itemLine = (row) => ({ ...row, ratePerUnit: exclusiveRate(row.ratePerUnit, row.gstRate || 18) });
const ADVANCE_MODES = ['cash', 'upi', 'bank', 'cheque'];

function SelectFormField({ control, name, label, placeholder, children }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <SelectField value={field.value ?? ''} onChange={field.onChange} placeholder={placeholder} className={FORM_INPUT_CLASS}>
              {children}
            </SelectField>
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

// null = not asked yet; the server says whether a Google key is configured.
let placesEnabled = null;

/**
 * "Search on Google Maps" above an address box. Picking a suggestion fills the
 * address and whichever of city / PIN / state the caller maps. Hidden when the
 * server has no Google key. One session token per search-and-pick, so Google
 * bills it as one lookup.
 */
function AddressSearch({ label, onPick }) {
  const [enabled, setEnabled] = useState(placesEnabled);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const session = useRef('');

  useEffect(() => {
    if (placesEnabled !== null) return;
    fetch('/api/stock/places').then((res) => res.json()).then((json) => {
      placesEnabled = Boolean(json.enabled);
      setEnabled(placesEnabled);
    }).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!enabled || query.trim().length < 3) { setSuggestions([]); return undefined; }
    session.current ||= crypto.randomUUID();
    // ponytail: 350 ms debounce keeps an address to ~5 billed calls; no cache.
    const timer = setTimeout(() => {
      fetch(`/api/stock/places?${new URLSearchParams({ q: query, session: session.current })}`)
        .then((res) => res.json()).then((json) => setSuggestions(json.suggestions || [])).catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [enabled, query]);

  if (!enabled) return null;
  const pick = async (placeId) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/stock/places?${new URLSearchParams({ placeId, session: session.current })}`);
      if (res.ok) onPick(await res.json());
    } finally {
      session.current = '';
      setQuery('');
      setSuggestions([]);
      setBusy(false);
    }
  };

  return (
    <div className="relative sm:col-span-2 lg:col-span-3">
      <span className={FORM_LABEL_CLASS}>{label}</span>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          disabled={busy}
          placeholder="Gomti Nagar, Hazratganj, shop or landmark…"
          className={`${FORM_INPUT_CLASS} pl-9`}
          autoComplete="off"
          role="combobox"
          aria-expanded={suggestions.length > 0}
        />
      </div>
      {suggestions.length ? (
        <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-sm shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId} role="option" aria-selected="false">
              <button type="button" onClick={() => pick(s.placeId)} className="w-full px-3 py-2 text-left hover:bg-muted">{s.text}</button>
            </li>
          ))}
          <li className="px-3 py-1 text-right text-[10px] text-slate-400">Powered by Google</li>
        </ul>
      ) : null}
    </div>
  );
}

function TextareaFormField({ control, name, label }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} value={field.value ?? ''} rows={2} className={FORM_INPUT_CLASS} />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

/**
 * The seller's estimate. Item rows are the dispatch form's rows in invoice mode
 * (HSN + GST % instead of returns), so an approved invoice prefills a dispatch
 * as-is. Totals here are a preview; the server recomputes them on save and again
 * on approval. Editing (an approver's review) passes `submitLabel`, and
 * `onSubmitAndApprove` when they may approve it in the same step.
 */
export function InvoiceFormContent({
  form,
  itemsFieldArray,
  onSubmit,
  onSubmitAndApprove,
  submitLabel,
  submitting,
  notice,
  allItems,
  suggestions,
  branches,
  canPickSeller,
  onAddItem,
  t,
  td,
  userRole,
}) {
  const [items, charges, locationId, billToStateCode, advanceAmount] = useWatch({ control: form.control, name: ['items', 'charges', 'locationId', 'billToStateCode', 'advanceAmount'] });
  const chargesFieldArray = useFieldArray({ control: form.control, name: 'charges' });
  const sellerState = branches.find((branch) => String(branch.id) === String(locationId))?.stateCode;
  const totals = useMemo(
    () => (sellerState && billToStateCode
      ? computeInvoiceTotals([...(items || []).map(itemLine), ...(charges || []).map(chargeLine)], sellerState, billToStateCode)
      : null),
    [items, charges, sellerState, billToStateCode]
  );

  const salespersonOptions = useMemo(() => {
    const people = Array.isArray(suggestions?.salespersons) ? suggestions.salespersons : [];
    return people.map((person) => ({ id: String(person.id), name: String(person.name || '') }));
  }, [suggestions?.salespersons]);

  return (
    <Form {...form}>
      <form className="mt-6" onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset disabled={submitting} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <div className={FORM_CARD_CLASS}>
            <FormSectionTitle icon={FileText} title={t('customerDetails')} description={t('branchHint')} tc={{}} />
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectFormField control={form.control} name="locationId" label={t('branch')} placeholder={t('selectBranch')}>
                {branches.map((branch) => (
                  <option key={branch.id} value={String(branch.id)}>{branch.name}</option>
                ))}
              </SelectFormField>
              <CustomerPhoneNameFields form={form} phoneLabel={t('phone')} nameLabel={t('customer')} />
              <SelectFormField control={form.control} name="billToStateCode" label={t('billToState')} placeholder="State…">
                {Object.entries(GST_STATES).map(([code, name]) => (
                  <option key={code} value={code}>{code} · {name}</option>
                ))}
              </SelectFormField>
              <StockFormField control={form.control} name="billToGstin" label={t('billToGstin')} placeholder="Optional" maxLength={15} />
              {canPickSeller ? (
                <SuggestComboboxField
                  control={form.control}
                  name="salespersonName"
                  label={t('salesperson')}
                  placeholder="Salesperson…"
                  options={salespersonOptions.map((option) => option.name)}
                  onChangeExtra={(value) => {
                    const match = salespersonOptions.find((option) => option.name === value);
                    form.setValue('salespersonUserId', match ? match.id : '', { shouldDirty: true });
                  }}
                />
              ) : null}
              <SuggestComboboxField
                control={form.control}
                name="referredByName"
                label={t('referredBy')}
                placeholder={t('referredByPlaceholder')}
                options={suggestions?.referredByName || []}
              />
              <StockFormField control={form.control} name="referredByPhone" label={t('referredByPhone')} placeholder="Optional" type="tel" />
              <AddressSearch
                label={t('searchAddress')}
                onPick={(place) => {
                  const set = (name, value) => value && form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
                  set('billToAddress', place.address);
                  set('billToCity', place.city);
                  set('billToPincode', place.pincode);
                  set('billToStateCode', place.stateCode);
                }}
              />
              <TextareaFormField control={form.control} name="billToAddress" label={t('billToAddress')} />
              <StockFormField control={form.control} name="billToCity" label={t('city')} placeholder="Ahmedabad" />
              <StockFormField control={form.control} name="billToPincode" label={t('pincode')} inputMode="numeric" digitsOnly maxLength={6} placeholder="380001" />
              <AddressSearch
                label={t('searchDeliveryAddress')}
                onPick={(place) => {
                  const set = (name, value) => value && form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
                  set('shipToAddress', place.address);
                  set('shipToPincode', place.pincode);
                }}
              />
              <TextareaFormField control={form.control} name="shipToAddress" label={t('shipToAddress')} />
              <StockFormField control={form.control} name="shipToPincode" label={t('shipToPincode')} inputMode="numeric" digitsOnly maxLength={6} placeholder="Optional" />
            </div>
          </div>

          <div className={FORM_CARD_CLASS}>
            <h3 className="mb-4 px-1 text-base font-semibold text-slate-900 dark:text-white">{td('items')}</h3>
            <div className="space-y-4">
              {itemsFieldArray.fields.map((fieldRow, index) => (
                <DispatchItemRow
                  key={fieldRow.id}
                  index={index}
                  fieldRow={fieldRow}
                  control={form.control}
                  allItems={allItems}
                  t={td}
                  tc={{ hsnCode: t('hsn'), inclGst: t('inclGst') }}
                  userRole={userRole}
                  totalItems={itemsFieldArray.fields.length}
                  onRemoveItem={(i) => itemsFieldArray.remove(i)}
                  invoice
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onAddItem}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-xs font-semibold text-foreground [&>svg]:text-brand-primary transition-colors hover:bg-border"
            >
              <Plus className="h-3.5 w-3.5" />
              {td('addItem')}
            </button>
          </div>

          <div className={FORM_CARD_CLASS}>
            {/* Optional: cartage or loading billed to the customer. Taxed and booked, never dispatched. */}
            <div className="mb-6">
              <h3 className="px-1 text-base font-semibold text-slate-900 dark:text-white">{t('otherCharges')}</h3>
              <p className="px-1 text-xs text-slate-500">{t('otherChargesHint')}</p>
              {chargesFieldArray.fields.map((fieldRow, index) => (
                <div key={fieldRow.id} className="mt-2 grid grid-cols-2 items-start gap-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <SuggestComboboxField control={form.control} name={`charges.${index}.label`} label={t('charge')} options={CHARGE_NAMES} />
                  <StockFormField control={form.control} name={`charges.${index}.sacCode`} label="SAC" inputMode="numeric" digitsOnly maxLength={6} />
                  <StockFormField control={form.control} name={`charges.${index}.amount`} label={`${t('amount')} (₹, ${t('inclGst')})`} inputMode="decimal" placeholder="600" />
                  <button
                    type="button"
                    onClick={() => chargesFieldArray.remove(index)}
                    aria-label={t('removeCharge')}
                    className="mt-8 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-muted hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => chargesFieldArray.append(newCharge())}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-xs font-semibold text-foreground [&>svg]:text-brand-primary transition-colors hover:bg-border"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('addCharge')}
              </button>
            </div>
            {/* Advance the customer paid: printed as "Less: Advance" and the balance due. */}
            <div className="mb-6">
              <h3 className="px-1 text-base font-semibold text-slate-900 dark:text-white">{t('advanceReceived')}</h3>
              <p className="px-1 text-xs text-slate-500">{t('advanceHint')}</p>
              <div className="mt-2 grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
                <StockFormField control={form.control} name="advanceAmount" label={`${t('amount')} (₹)`} inputMode="decimal" placeholder="0" />
                <StockDateField control={form.control} name="advanceDate" label={t('advanceDate')} placeholder={t('advanceDate')} />
                <SelectFormField control={form.control} name="advanceMode" label={t('advanceMode')} placeholder={t('advanceMode')}>
                  {ADVANCE_MODES.map((mode) => <option key={mode} value={mode}>{t(`mode_${mode}`)}</option>)}
                </SelectFormField>
              </div>
            </div>
            <TextareaFormField control={form.control} name="notes" label={t('notes')} />
            {totals ? (
              <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm tabular-nums">
                <dt className="text-slate-500">{t('taxable')}</dt><dd className="text-right">{formatRupees(totals.taxableTotal)}</dd>
                {totals.interState ? (
                  <><dt className="text-slate-500">{t('igst')}</dt><dd className="text-right">{formatRupees(totals.igst)}</dd></>
                ) : (
                  <>
                    <dt className="text-slate-500">{t('cgst')}</dt><dd className="text-right">{formatRupees(totals.cgst)}</dd>
                    <dt className="text-slate-500">{t('sgst')}</dt><dd className="text-right">{formatRupees(totals.sgst)}</dd>
                  </>
                )}
                {totals.roundOff ? <><dt className="text-slate-500">{t('roundOff')}</dt><dd className="text-right">{formatRupees(totals.roundOff)}</dd></> : null}
                <dt className="border-t border-border pt-1 font-semibold">{t('grandTotal')}</dt>
                <dd className="border-t border-border pt-1 text-right font-semibold">{formatRupees(totals.grandTotal)}</dd>
                {Number(advanceAmount) > 0 ? (
                  <>
                    <dt className="text-slate-500">{t('lessAdvance')}</dt><dd className="text-right">− {formatRupees(advanceAmount)}</dd>
                    <dt className="font-semibold">{t('balanceDue')}</dt><dd className="text-right font-semibold">{formatRupees(totals.grandTotal - Number(advanceAmount))}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
          </div>
          <InlineNotice notice={notice} />
        </fieldset>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={submitting}
            className={SUBMIT_BUTTON_CLASS}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Send className="h-4 w-4" />
              {submitting ? t('submitting') : submitLabel || t('submitEstimate')}
              <kbd aria-hidden="true" className="ml-1 hidden rounded-lg bg-white/20 px-2 font-sans text-[11px] font-medium sm:inline">Ctrl ↵</kbd>
            </span>
          </button>
          {onSubmitAndApprove ? (
            <button
              type="button"
              disabled={submitting}
              onClick={form.handleSubmit(onSubmitAndApprove)}
              className={SUBMIT_SECONDARY_CLASS}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Check className="h-4 w-4" /> {t('saveAndApprove')}
              </span>
            </button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}
