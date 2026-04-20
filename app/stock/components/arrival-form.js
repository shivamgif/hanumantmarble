'use client';

import { Boxes, FileText, ReceiptText, Sparkles, Truck } from 'lucide-react';
import { Plus } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

function ArrivalItemRow({ index, fieldRow, control, item, activeItems, onItemNameChange, tc, language }) {
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

  const itemInputClass = 'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <div key={fieldRow.id} className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-semibold text-foreground">{tc.itemLabel} {index + 1}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${isCatalogItem ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400'}`}>
          {isCatalogItem ? tc.autofilledCatalog : tc.newTileEntry}
        </span>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div>
            <label className={FORM_LABEL_CLASS}>{language === 'hi' ? 'टाइल नाम' : 'Tile Name'}</label>
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
                      options={(activeItems || []).map((it) => it.name).filter(Boolean)}
                      placeholder={tc.typeTileName}
                      className={`mt-1 ${itemInputClass}`}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
          <StockFormField control={control} name={`items.${index}.orderedBoxes`} label="Ordered Boxes" type="number" placeholder="0" className={itemInputClass} min="0" />
          <FormField
            control={control}
            name={`items.${index}.wholeQty`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{tc.wholeBox}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className={`mt-1 ${itemInputClass}`} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`items.${index}.brokenQty`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{tc.brokenTiles}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className={`mt-1 ${itemInputClass}`} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Ordered Qty (sqm)', value: orderedQtySqmDisplay },
            { label: 'Whole Qty (sqm)', value: wholeQtySqmDisplay },
            { label: 'Broken Qty (sqm)', value: brokenQtySqmDisplay },
          ].map(({ label, value }) => (
            <div key={label}>
              <label className={FORM_LABEL_CLASS}>{label}</label>
              <Input readOnly tabIndex={-1} value={value ?? ''} placeholder="—" className="mt-1 w-full rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-sm text-foreground shadow-sm outline-none" />
            </div>
          ))}
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-foreground/70">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {isCatalogItem ? 'Catalog Details' : 'New Tile Details'}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StockFormField control={control} name={`items.${index}.brandName`} label="Brand" placeholder="Brand" className={itemInputClass} disabled={isCatalogItem} list="sg-brandName" />
            <StockFormField control={control} name={`items.${index}.divisionName`} label="Division" placeholder="Division" className={itemInputClass} list="sg-divisionName" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.finish`} label="Finish" placeholder="Finish" className={itemInputClass} disabled={isCatalogItem} list="sg-finish" />
            <StockFormField control={control} name={`items.${index}.grade`} label="Quality" placeholder="Premium / Standard" className={itemInputClass} disabled={isCatalogItem} list="sg-grade" />
            <StockFormField control={control} name={`items.${index}.sizeWidthMm`} label="Size Width (mm)" type="number" placeholder="800" className={itemInputClass} min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.sizeLengthMm`} label="Size Length (mm)" type="number" placeholder="800" className={itemInputClass} min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.piecesPerBox`} label="Pieces / Box" type="number" placeholder="2" className={itemInputClass} min="0" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.reorderLevel`} label="Reorder Level" type="number" placeholder="20" className={itemInputClass} min="0" disabled />
            <StockFormField control={control} name={`items.${index}.sizeUnit`} label="Size Unit" placeholder="mm" className={itemInputClass} disabled />
            <StockFormField control={control} name={`items.${index}.hsnCode`} label="HSN Code" placeholder="HSN Code" className={itemInputClass} list="sg-hsnCode" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.thicknessMm`} label="Thickness (mm)" type="number" placeholder="Thickness (mm)" className={itemInputClass} min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.costPerSqm`} label="Cost / sqm" type="number" placeholder="Cost / sqm" className={itemInputClass} min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.description`} label="Description" placeholder="Description" className={`${itemInputClass} lg:col-span-2`} disabled={isCatalogItem} />
          </div>
        </div>
      </div>
    </div>
  );
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

  return (
    <Form {...form}>
      <form className="mt-6 space-y-5" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        {Object.entries(suggestions).map(([key, values]) => (
          <datalist key={key} id={`sg-${key}`}>
            {(values || []).map((v) => <option key={v} value={v} />)}
          </datalist>
        ))}
        <InlineNotice notice={notice} />
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle icon={FileText} title={tc.purchaseBasics} description={tc.purchaseBasicsDesc} />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <SuggestComboboxField control={form.control} name="supplierName" label={t('supplier')} placeholder="Supplier Name..." options={suggestions.supplierName} />
            <StockFormField control={form.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." />
            <StockDateField control={form.control} name="invoiceDate" label={tc.invoiceDate} placeholder={tc.invoiceDate} />
            <StockFormField control={form.control} name="handlingCostPercent" label="Handling Cost %" type="number" placeholder="1.0" className={percentFieldClass} min="0" step="0.1" />
            <StockFormField control={form.control} name="fuelCostPercent" label="Fuel Cost %" type="number" placeholder="5.0" className={percentFieldClass} min="0" step="0.1" />
            <StockFormField control={form.control} name="gstPercent" label="GST %" type="number" placeholder="18.0" className={percentFieldClass} min="0" step="0.1" />
            <AttachmentField label={tc.invoicePhoto} file={attachments.purchaseInvoice} onChange={(file) => setAttachment('purchaseInvoice', file)} hint={tc.invoicePhotoHint} />
            <AttachmentField label={tc.transporterBillPhoto} file={attachments.transporterBill} onChange={(file) => setAttachment('transporterBill', file)} accept="image/*" hint={tc.transporterBillHint} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle icon={Truck} title={tc.transportInvoice} />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <SuggestComboboxField control={form.control} name="transporterName" label={tc.transporter} placeholder="Transport company" options={suggestions.transporterName} />
            <StockFormField control={form.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" list="sg-truckLicensePlate" />
            <StockFormField control={form.control} name="driverName" label={t('driver')} placeholder="Driver Name..." list="sg-driverName" />
            <SuggestComboboxField control={form.control} name="originCity" label={tc.originCity} placeholder="Source city" options={suggestions.originCity} />
            <SuggestComboboxField control={form.control} name="destinationWarehouseName" label={tc.destinationWarehouse} placeholder="Warehouse name" options={suggestions.destinationWarehouseName} />
            <StockMoneyField control={form.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
            <StockMoneyField control={form.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
            <StockFormField control={form.control} name="freightWeightKg" label="Freight Weight (kg)" type="number" placeholder="0" className={percentFieldClass} min="0" step="0.01" />
          </div>
        </div>
        <div className="rounded-2xl bg-muted/20 p-0">
          <div className="flex justify-between items-center mb-2 gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-primary" />
              <label>{t('items')}</label>
            </div>
            <button
              type="button"
              onClick={onAddItem}
              className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t('addItem')}
              </span>
            </button>
          </div>
          <div className="space-y-3">
            {itemsFieldArray.fields.map((fieldRow, index) => (
              <ArrivalItemRow
                key={fieldRow.id}
                index={index}
                fieldRow={fieldRow}
                control={form.control}
                item={watchedItems[index] || fieldRow}
                activeItems={activeItems}
                onItemNameChange={onItemNameChange}
                tc={tc}
                language={language}
              />
            ))}
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
                  <Textarea {...field} value={field.value ?? ''} className={FORM_INPUT_CLASS} rows={2} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            <ReceiptText className="h-4 w-4" />
            {submitting ? tc.submitting : (language === 'hi' ? 'खरीद जमा करें' : 'Submit Purchase')}
          </span>
        </button>
      </form>
    </Form>
  );
}
