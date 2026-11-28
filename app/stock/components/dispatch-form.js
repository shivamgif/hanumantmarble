'use client';

import { memo, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Send, Truck, X, Package } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import {
  AttachmentField,
  CustomerPhoneNameFields,
  FormSectionTitle,
  InlineNotice,
  ItemSuggestCombobox,
  StockDateField,
  StockFormField,
  StockMoneyField,
  SuggestComboboxField,
} from './stock-form-fields';
import {
  FORM_FOOTER_CLASS,
  FORM_GRID_CLASS,
  FORM_INPUT_CLASS,
  FORM_ITEM_HEAD_CLASS,
  FORM_ITEM_ROW_CLASS,
  FORM_LABEL_CLASS,
  FORM_SECTION_CLASS,
  SUBMIT_BUTTON_CLASS,
} from '../lib/stock-utils';

// On an invoice a line carries its HSN where a dispatch carries returns. The
// GST rate rides along hidden (18% unless the saved line had another): rates
// are typed GST-inclusive, so the shop never picks it.
function InvoiceTaxFields({ control, index, tc }) {
  return (
    <StockFormField control={control} name={`items.${index}.hsnCode`} label={tc?.hsnCode ?? 'HSN'} inputMode="numeric" digitsOnly maxLength={8} placeholder="690721" />
  );
}

// `invoice`: the same row on the estimate form — no broken-stock toggle (broken
// pieces are never billed) and no returns; HSN and GST % instead.
export const DispatchItemRow = memo(function DispatchItemRow({ index, fieldRow, control, allItems, t, tc, userRole, totalItems, onRemoveItem, invoice = false }) {
  const canEditReturns = ['admin', 'manager'].includes(userRole);
  const { watch, setValue } = useFormContext();
  const itemCategory = watch(`items.${index}.itemCategory`);
  const sellUnit = watch(`items.${index}.sellUnit`);
  const itemLabel = watch(`items.${index}.itemLabel`);
  const fromBroken = watch(`items.${index}.fromBroken`);
  const isBag = itemCategory === 'bag';
  // Stone is dispatched by total sqft — no boxes, pieces or broken bucket.
  const isStone = itemCategory === 'stone';
  const showBrokenToggle = !isBag && !invoice;
  // Estimates take the rate as quoted to the customer, GST included.
  const inclGst = invoice ? ` (${tc?.inclGst ?? 'incl. GST'})` : '';

  return (
    <div key={fieldRow.id} className={FORM_ITEM_ROW_CLASS}>
      <div className={FORM_ITEM_HEAD_CLASS}>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isBag ? 'bg-violet-400' : isStone ? 'bg-sky-400' : 'bg-foreground'}`} />
          <span className="text-xs font-semibold text-foreground">{tc?.itemLabel ?? 'Item'} {index + 1}</span>
          {isBag && <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Bag</span>}
          {isStone && <span className="text-xs font-medium text-sky-700 dark:text-sky-400">Stone</span>}
        </div>
        {totalItems > 1 && (
          <button
            type="button"
            onClick={() => onRemoveItem(index)}
            className="-mr-2 rounded-lg p-1.5 text-red-600 transition-colors hover:bg-muted dark:text-red-400"
            title="Remove item"
            aria-label="Remove item"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-4 p-4">
        {/* Item picker and the broken-stock switch share one line. */}
        <div className={`grid items-end gap-4 ${showBrokenToggle ? 'sm:grid-cols-[minmax(0,1fr)_auto]' : ''}`}>
          <FormField
            control={control}
            name={`items.${index}.itemId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{t('sku')} / {t('name')}</FormLabel>
                <FormControl>
                  <ItemSuggestCombobox
                    value={field.value ?? ''}
                    fallbackLabel={itemLabel}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    onItemSelect={(item) => {
                      setValue(`items.${index}.itemCategory`, item.unit_of_measure === 'bag' ? 'bag' : item.unit_of_measure === 'sqft' ? 'stone' : 'tile');
                      if (invoice && item.hsn_code) setValue(`items.${index}.hsnCode`, item.hsn_code);
                    }}
                    items={allItems}
                    placeholder={t('selectItem')}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          {showBrokenToggle && (
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(fromBroken)}
              title={fromBroken
                ? (tc?.brokenStockSaleHintOn ?? 'Selling from broken inventory')
                : (tc?.brokenStockSaleHintOff ?? 'Toggle for damaged stock')}
              onClick={() => {
                const next = !fromBroken;
                setValue(`items.${index}.fromBroken`, next);
                if (next) {
                  setValue(`items.${index}.loadedWholeQty`, '');
                } else {
                  setValue(`items.${index}.loadedBrokenQty`, '');
                }
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                fromBroken ? 'border-amber-500/60 text-amber-700 dark:text-amber-300' : 'border-input text-foreground hover:bg-muted'
              }`}
            >
              <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${fromBroken ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-card transition-transform ${fromBroken ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </span>
              {tc?.brokenStockSale ?? 'Broken-Stock Sale'}
            </button>
          )}
        </div>
        {isStone ? (
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-3`}>
            <StockFormField control={control} name={`items.${index}.qtySqft`} label={tc?.qtySqft ?? 'Qty (Sqft)'} type="number" min="0" step="0.001" placeholder="0" />
            <StockMoneyField control={control} name={`items.${index}.ratePerUnit`} label={(tc?.ratePerSqft ?? 'Rate / Sqft') + inclGst} />
            {invoice ? <InvoiceTaxFields control={control} index={index} tc={tc} /> : (
              <StockFormField control={control} name={`items.${index}.returnQtySqft`} label={tc?.retSqft ?? 'Return Sqft'} type="number" min="0" step="0.001" placeholder="0" disabled={!canEditReturns} />
            )}
          </div>
        ) : isBag ? (
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-3`}>
            <StockFormField control={control} name={`items.${index}.qtyBags`} label={tc?.qtyBags ?? 'Qty (Bags)'} type="number" min="0" placeholder="0" />
            <StockMoneyField control={control} name={`items.${index}.ratePerUnit`} label={(tc?.ratePerBag ?? 'Rate / Bag') + inclGst} />
            {invoice ? <InvoiceTaxFields control={control} index={index} tc={tc} /> : (
              <StockFormField control={control} name={`items.${index}.returnQtyBags`} label={tc?.retBags ?? 'Return Bags'} type="number" min="0" placeholder="0" disabled={!canEditReturns} />
            )}
          </div>
        ) : (
          // Quantity, unit, rate and the two return/tax fields: five on one line
          // when the drawer is wide enough, instead of three then two.
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${invoice ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}`}>
            {fromBroken ? (
              <StockFormField
                control={control}
                name={`items.${index}.loadedBrokenQty`}
                label={`${tc?.brokenQtySold ?? 'Broken Qty Sold'} (${sellUnit === 'piece' ? (tc?.piece ?? 'Piece') : (tc?.box ?? 'Box')})`}
                type="number"
                min="0"
                placeholder="0"
              />
            ) : (
              <StockFormField control={control} name={`items.${index}.loadedWholeQty`} label={sellUnit === 'piece' ? (tc?.pieces ?? 'Pieces') : (tc?.boxes ?? 'Boxes')} type="number" min="0" placeholder="0" />
            )}
            <div>
              <span className={FORM_LABEL_CLASS}>{tc?.sellUnit ?? 'Sell As'}</span>
              <div role="group" aria-label={tc?.sellUnit ?? 'Sell As'} className="flex h-9 items-center gap-1 rounded-lg bg-muted p-1">
                {['box', 'piece'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={sellUnit === u}
                    onClick={() => setValue(`items.${index}.sellUnit`, u)}
                    className={`h-7 flex-1 rounded-md px-2 text-xs transition-colors ${sellUnit === u ? 'glass-chip font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'}`}
                  >
                    {u === 'box' ? (tc?.box ?? 'Box') : (tc?.piece ?? 'Piece')}
                  </button>
                ))}
              </div>
            </div>
            <StockMoneyField control={control} name={`items.${index}.ratePerUnit`} label={(sellUnit === 'piece' ? (tc?.ratePerPiece ?? 'Rate / Piece') : (tc?.ratePerBox ?? 'Rate / Box')) + inclGst} />
            {invoice ? <InvoiceTaxFields control={control} index={index} tc={tc} /> : (
              <>
                <StockFormField control={control} name={`items.${index}.returnWholeQty`} label={tc?.retWhole ?? 'Ret. Whole'} type="number" min="0" placeholder="0" disabled={!canEditReturns} />
                <StockFormField control={control} name={`items.${index}.returnBrokenQty`} label={tc?.retBrok ?? 'Ret. Broken'} type="number" min="0" placeholder="0" disabled={!canEditReturns} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export function DispatchFormContent({
  form,
  itemsFieldArray,
  attachments,
  setAttachment,
  onSubmit,
  onInvalid,
  submitting,
  notice,
  activeItems,
  allItems,
  suggestions,
  onAddItem,
  t,
  tc,
  language,
  userRole,
}) {
  const resolvedItems = allItems || activeItems || [];
  const salespersonOptions = useMemo(() => {
    const people = Array.isArray(suggestions?.salespersons) ? suggestions.salespersons : [];
    return people.map((person) => ({
      id: String(person.id),
      name: String(person.name || ''),
      label: person.divisionNames
        ? `${person.name} (${person.divisionNames})`
        : String(person.name || ''),
    }));
  }, [suggestions?.salespersons]);

  const salespersonLabelMap = useMemo(
    () => new Map(salespersonOptions.map((option) => [option.label, option])),
    [salespersonOptions]
  );
  const salespersonUniqueNameMap = useMemo(() => {
    const counts = new Map();
    for (const option of salespersonOptions) {
      counts.set(option.name, (counts.get(option.name) || 0) + 1);
    }
    const unique = new Map();
    for (const option of salespersonOptions) {
      if ((counts.get(option.name) || 0) === 1) {
        unique.set(option.name, option);
      }
    }
    return unique;
  }, [salespersonOptions]);

  return (
    <Form {...form}>
      <form className="mt-6" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <fieldset disabled={submitting} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <section className={FORM_SECTION_CLASS}>
          <FormSectionTitle icon={Send} title={tc.dispatchBasics} description={tc.dispatchBasicsDesc} />
          {/* Who and by whom, then the invoice and its photo: two full rows of three. */}
          <div className={FORM_GRID_CLASS}>
            <CustomerPhoneNameFields form={form} phoneLabel={tc.customerPhone} nameLabel={t('customer')} autoFocus />
            <div className="min-w-0">
              <SuggestComboboxField
                control={form.control}
                name="salespersonName"
                label={t('salesperson')}
                placeholder="Salesperson..."
                options={salespersonOptions.map((option) => option.label)}
                onChangeExtra={(value) => {
                  const exact = salespersonLabelMap.get(value) || salespersonUniqueNameMap.get(value) || null;
                  if (exact) {
                    form.setValue('salespersonName', exact.name, { shouldDirty: true, shouldValidate: true });
                    form.setValue('salespersonUserId', exact.id, { shouldDirty: true, shouldValidate: true });
                    return;
                  }
                  form.setValue('salespersonUserId', '', { shouldDirty: true, shouldValidate: true });
                }}
              />
              <FormField
                control={form.control}
                name="salespersonUserId"
                render={() => (
                  <FormItem>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
            <StockFormField control={form.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." invoiceChars />
            <StockDateField control={form.control} name="dispatchDate" label={tc.invoiceDate} placeholder={tc.invoiceDate} />
            <AttachmentField label={tc.salesInvoicePhoto} file={attachments.salesInvoice} onChange={(file) => setAttachment('salesInvoice', file)} hint={tc.salesInvoiceHint} tc={tc} />
          </div>
        </section>
        <section className={FORM_SECTION_CLASS}>
          <FormSectionTitle icon={Truck} title={tc.transportAndVehicle} />
          {/* The gate pass goes with the lorry leaving the gate. */}
          <div className={FORM_GRID_CLASS}>
            <StockFormField control={form.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" />
            <StockFormField control={form.control} name="driverName" label={t('driver')} placeholder="Driver Name..." />
            <AttachmentField label={tc.gatepassPhoto} file={attachments.gatepass} onChange={(file) => setAttachment('gatepass', file)} accept="image/*" hint={tc.gatepassHint} tc={tc} />
          </div>
        </section>
        <section className={FORM_SECTION_CLASS}>
          <FormSectionTitle icon={Package} title={t('items')} />
          <div className="mt-4 space-y-4">
            {itemsFieldArray.fields.map((fieldRow, index) => (
              <DispatchItemRow
                key={fieldRow.id}
                index={index}
                fieldRow={fieldRow}
                control={form.control}
                allItems={resolvedItems}
                t={t}
                tc={tc}
                language={language}
                userRole={userRole}
                totalItems={itemsFieldArray.fields.length}
                onRemoveItem={(i) => itemsFieldArray.remove(i)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onAddItem}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-border active:scale-[0.96] [&>svg]:text-brand-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('addItem')}
          </button>
        </section>
        <section className={FORM_SECTION_CLASS}>
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
        </section>
        <InlineNotice notice={notice} />
        </fieldset>
        <div className={FORM_FOOTER_CLASS}>
          <button
            type="submit"
            disabled={submitting}
            className={`${SUBMIT_BUTTON_CLASS} sm:w-auto sm:min-w-48`}
          >
            <Send className="h-5 w-5" />
            {submitting ? tc.submitting : t('submitDispatch')}
            <kbd aria-hidden="true" className="hidden rounded-lg bg-white/20 px-2 font-sans text-[11px] font-medium sm:inline">Ctrl ↵</kbd>
          </button>
        </div>
      </form>
    </Form>
  );
}
