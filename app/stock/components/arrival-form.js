'use client';

import { memo, useMemo } from 'react';
import { Boxes, FileText, Plus, ReceiptText, Sparkles, Truck, ChevronRight, X } from 'lucide-react';
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

const ArrivalItemRow = memo(function ArrivalItemRow({ index, fieldRow, control, item, activeItems, itemNames, onItemNameChange, t, tc, language, totalItems, onRemoveItem }) {
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
    <div key={fieldRow.id} className="glass-panel rounded-2xl border border-white/5 shadow-xl transition-all duration-500 overflow-hidden group/item">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-slate-900/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">{tc.itemLabel} {index + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest shadow-sm ${isCatalogItem ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-400'}`}>
            {isCatalogItem ? tc.autofilledCatalog : tc.newTileEntry}
          </span>
          {totalItems > 1 && (
            <button
              type="button"
              onClick={() => onRemoveItem(index)}
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove item"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StockFormField control={control} name={`items.${index}.orderedBoxes`} label={tc.ordered} type="number" placeholder="0" min="0" />
            <StockFormField control={control} name={`items.${index}.wholeQty`} label={tc.wholeBox} type="number" min="0" placeholder="0" />
            <StockFormField control={control} name={`items.${index}.brokenQty`} label={tc.brokenTiles} type="number" min="0" placeholder="0" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 p-3 rounded-xl bg-slate-500/5 border border-white/5">
          {[
            { label: tc.orderedSqm, value: orderedQtySqmDisplay },
            { label: tc.wholeSqm, value: wholeQtySqmDisplay },
            { label: tc.brokenSqm, value: brokenQtySqmDisplay },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500/60 mb-1">{label}</div>
              <div className="text-sm font-black text-slate-900 dark:text-white tabular-nums tracking-tight">{value ?? '—'}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
            {isCatalogItem ? tc.catalogIntelligence : tc.technicalEntry}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StockFormField control={control} name={`items.${index}.brandName`} label={tc.brand} placeholder={tc.brand} disabled={isCatalogItem} list="sg-brandName" />
            <FormField
              control={control}
              name={`items.${index}.divisionName`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={FORM_LABEL_CLASS}>{tc.division}</FormLabel>
                  <FormControl>
                    <Select value={field.value || ''} onValueChange={field.onChange} disabled={isCatalogItem}>
                      <SelectTrigger className={FORM_INPUT_CLASS}>
                        <SelectValue placeholder={tc.division} />
                      </SelectTrigger>
                      <SelectContent className="glass-panel">
                        <SelectItem value="Ceramic">Ceramic</SelectItem>
                        <SelectItem value="Eternity (GVT)">Eternity (GVT)</SelectItem>
                        <SelectItem value="Vitronite (PVT)">Vitronite (PVT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
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
                  <FormControl>
                    <Select value={field.value || ''} onValueChange={field.onChange} disabled={isCatalogItem}>
                      <SelectTrigger className={FORM_INPUT_CLASS}>
                        <SelectValue placeholder={tc.finish} />
                      </SelectTrigger>
                      <SelectContent className="glass-panel">
                        <SelectItem value="Polished">Polished</SelectItem>
                        <SelectItem value="Vitrified">Vitrified</SelectItem>
                        <SelectItem value="Matte">Matte</SelectItem>
                        <SelectItem value="Satin">Satin</SelectItem>
                        <SelectItem value="Carving">Carving</SelectItem>
                        <SelectItem value="High-gloss">High-gloss</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
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
                  <FormControl>
                    <Select value={field.value || ''} onValueChange={field.onChange} disabled={isCatalogItem}>
                      <SelectTrigger className={FORM_INPUT_CLASS}>
                        <SelectValue placeholder={tc.quality} />
                      </SelectTrigger>
                      <SelectContent className="glass-panel">
                        <SelectItem value="Premium">Premium</SelectItem>
                        <SelectItem value="Standard">Standard</SelectItem>
                        <SelectItem value="Commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <StockFormField control={control} name={`items.${index}.sizeWidthMm`} label={`${tc.width} (${tc.mm})`} type="number" placeholder="800" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.sizeLengthMm`} label={`${tc.length} (${tc.mm})`} type="number" placeholder="800" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.piecesPerBox`} label={tc.piecesPerBox} type="number" placeholder="2" min="0" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.hsnCode`} label={tc.hsn} placeholder={tc.hsn} list="sg-hsnCode" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.thicknessMm`} label={`${tc.thickness} (${tc.mm})`} type="number" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.costPerSqm`} label={t('costPerSqm')} type="number" min="0" step="0.01" disabled={isCatalogItem} />
            <StockFormField control={control} name={`items.${index}.description`} label={tc.description} placeholder="Notes..." className="lg:col-span-2" disabled={isCatalogItem} />
          </div>
        </div>
      </div>
    </div>
  );
});

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
  const itemNames = useMemo(() => (activeItems || []).map((it) => it.name).filter(Boolean), [activeItems]);

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
          <FormSectionTitle category="Intake Strategy" icon={FileText} title={tc.purchaseBasics} description={tc.purchaseBasicsDesc} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
            <SuggestComboboxField control={form.control} name="supplierName" label={t('supplier')} placeholder="Supplier Name..." options={suggestions.supplierName} />
            <StockFormField control={form.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." />
            <StockDateField control={form.control} name="invoiceDate" label={tc.invoiceDate} placeholder={tc.invoiceDate} />
            <StockFormField control={form.control} name="handlingCostPercent" label={`${tc.handlingCost} %`} type="number" placeholder="1.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="fuelCostPercent" label={`${tc.fuelCost} %`} type="number" placeholder="5.0" min="0" step="0.1" />
            <StockFormField control={form.control} name="gstPercent" label={`${tc.gst} %`} type="number" placeholder="18.0" min="0" step="0.1" />
            <AttachmentField label={tc.invoicePhoto} file={attachments.purchaseInvoice} onChange={(file) => setAttachment('purchaseInvoice', file)} hint={tc.invoicePhotoHint} tc={tc} />
            <AttachmentField label={tc.transporterBillPhoto} file={attachments.transporterBill} onChange={(file) => setAttachment('transporterBill', file)} accept="image/*" hint={tc.transporterBillHint} tc={tc} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Mobility Details" icon={Truck} title={tc.transportInvoice} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
            <SuggestComboboxField control={form.control} name="transporterName" label={tc.transporter} placeholder="Transport company" options={suggestions.transporterName} />
            <StockFormField control={form.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" list="sg-truckLicensePlate" />
            <StockFormField control={form.control} name="driverName" label={t('driver')} placeholder="Driver Name..." list="sg-driverName" />
            <SuggestComboboxField control={form.control} name="originCity" label={tc.originCity} placeholder="Source city" options={suggestions.originCity} />
            <SuggestComboboxField control={form.control} name="destinationWarehouseName" label={tc.destinationWarehouse} placeholder="Warehouse name" options={suggestions.destinationWarehouseName} />
            <StockMoneyField control={form.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
            <StockMoneyField control={form.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
            <StockFormField control={form.control} name="freightWeightKg" label={tc.weightKg} type="number" placeholder="0" min="0" step="0.01" />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <div className="flex justify-between items-center mb-4 gap-4 px-1">
            <div className="space-y-1">
              <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                <span>{tc.inventoryHub}</span>
                <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                <span className="text-brand-primary">{tc.assets}</span>
              </nav>
              <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{t('items')}</h3>
            </div>

          </div>
          <div className="space-y-4">
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex mb-4 items-center gap-2 rounded-full bg-brand-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand-primary transition-all hover:bg-brand-primary/20 hover:scale-105 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('addItem')}
            </button>
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
                t={t}
                tc={tc}
                language={language}
                totalItems={itemsFieldArray.fields.length}
                onRemoveItem={(i) => itemsFieldArray.remove(i)}
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
                  <Textarea {...field} value={field.value ?? ''} className={FORM_INPUT_CLASS} rows={3} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-2xl bg-brand-primary px-4 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-brand-primary/20 transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
