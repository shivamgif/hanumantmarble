'use client';

import { useCallback, useMemo } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Check, FileText, Plus, Send, X } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { SelectField } from '@/components/ui/select';
import { CARTAGE_SAC, computeInvoiceTotals, GST_STATES } from '@/lib/gst-invoice.mjs';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { FormSectionTitle, InlineNotice, StockFormField, SuggestComboboxField } from './stock-form-fields';
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
/** A form charge row as an invoice line, for the totals preview (the server builds the stored one). */
const chargeLine = (row) => ({ itemCategory: 'charge', ratePerUnit: row.amount, gstRate: row.gstRate });

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
  const [items, charges, locationId, billToStateCode] = useWatch({ control: form.control, name: ['items', 'charges', 'locationId', 'billToStateCode'] });
  const chargesFieldArray = useFieldArray({ control: form.control, name: 'charges' });
  const sellerState = branches.find((branch) => String(branch.id) === String(locationId))?.stateCode;
  const totals = useMemo(
    () => (sellerState && billToStateCode
      ? computeInvoiceTotals([...(items || []), ...(charges || []).map(chargeLine)], sellerState, billToStateCode)
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
            <FormSectionTitle category={t('estimate')} icon={FileText} title={t('customerDetails')} description={t('branchHint')} tc={{}} />
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectFormField control={form.control} name="locationId" label={t('branch')} placeholder={t('selectBranch')}>
                {branches.map((branch) => (
                  <option key={branch.id} value={String(branch.id)}>{branch.name}</option>
                ))}
              </SelectFormField>
              <StockFormField control={form.control} name="customerName" label={t('customer')} placeholder="Customer name…" />
              <StockFormField control={form.control} name="customerPhoneNumber" label={t('phone')} placeholder="+91 9876543210" type="tel" />
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
              <TextareaFormField control={form.control} name="billToAddress" label={t('billToAddress')} />
              <StockFormField control={form.control} name="billToCity" label={t('city')} placeholder="Ahmedabad" />
              <StockFormField control={form.control} name="billToPincode" label={t('pincode')} inputMode="numeric" digitsOnly maxLength={6} placeholder="380001" />
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
                  tc={{ hsnCode: t('hsn'), gstRate: `${t('gst')} %` }}
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
                <div key={fieldRow.id} className="mt-2 grid grid-cols-2 items-start gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <SuggestComboboxField control={form.control} name={`charges.${index}.label`} label={t('charge')} options={CHARGE_NAMES} />
                  <StockFormField control={form.control} name={`charges.${index}.sacCode`} label="SAC" inputMode="numeric" digitsOnly maxLength={6} />
                  <StockFormField control={form.control} name={`charges.${index}.amount`} label={`${t('amount')} (₹)`} inputMode="decimal" placeholder="600" />
                  <StockFormField control={form.control} name={`charges.${index}.gstRate`} label={`${t('gst')} %`} inputMode="decimal" />
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
