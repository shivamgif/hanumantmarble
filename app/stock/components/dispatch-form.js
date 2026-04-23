'use client';

import { memo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Send, Truck, ChevronRight, X, Package } from 'lucide-react';
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
  SuggestComboboxField,
} from './stock-form-fields';
import { FORM_CARD_CLASS, FORM_INPUT_CLASS, FORM_LABEL_CLASS } from '../lib/stock-utils';

const DispatchItemRow = memo(function DispatchItemRow({ index, fieldRow, control, allItems, t, tc, userRole, totalItems, onRemoveItem }) {
  const canEditReturns = ['admin', 'manager'].includes(userRole);
  const { watch, setValue } = useFormContext();
  const itemCategory = watch(`items.${index}.itemCategory`);
  const isBag = itemCategory === 'bag';

  return (
    <div key={fieldRow.id} className="glass-panel rounded-2xl border border-white/5 shadow-xl transition-all duration-500 overflow-hidden group/item">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-slate-900/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isBag ? 'bg-amber-400' : 'bg-brand-primary'}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">{tc?.itemLabel ?? 'Item'} {index + 1}</span>
          {isBag && (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-400">Bag</span>
          )}
        </div>
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
      <div className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={control}
            name={`items.${index}.itemId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{t('sku')} / {t('name')}</FormLabel>
                <FormControl>
                  <Select
                    value={field.value || undefined}
                    onValueChange={(val) => {
                      field.onChange(val);
                      const selected = (allItems || []).find((si) => String(si.id) === String(val));
                      setValue(`items.${index}.itemCategory`, selected?.unit_of_measure === 'bag' ? 'bag' : 'tile');
                    }}
                  >
                    <SelectTrigger className={FORM_INPUT_CLASS}>
                      <SelectValue placeholder={t('selectItem')} />
                    </SelectTrigger>
                    <SelectContent className="glass-panel">
                      {(allItems || []).map((stockItem) => (
                        <SelectItem key={stockItem.id} value={String(stockItem.id)}>
                          {stockItem.sku} - {stockItem.name}
                          {stockItem.unit_of_measure === 'bag' ? ' (Bag)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          {isBag ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StockFormField control={control} name={`items.${index}.qtyBags`} label="Qty (Bags)" type="number" min="0" placeholder="0" />
              <StockFormField control={control} name={`items.${index}.ratePerBag`} label="Rate/Bag (₹)" type="number" min="0" placeholder="0" step="0.01" />
              <StockFormField control={control} name={`items.${index}.returnQtyBags`} label="Return Bags" type="number" min="0" placeholder="0" disabled={!canEditReturns} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StockFormField control={control} name={`items.${index}.loadedWholeQty`} label={t('whole')} type="number" min="0" placeholder="0" />
              <StockFormField control={control} name={`items.${index}.returnWholeQty`} label={tc?.retWhole ?? 'Ret. Whole'} type="number" min="0" placeholder="0" disabled={!canEditReturns} />
              <StockFormField control={control} name={`items.${index}.returnBrokenQty`} label={tc?.retBrok ?? 'Ret. Broken'} type="number" min="0" placeholder="0" disabled={!canEditReturns} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const BagDispatchItemRow = memo(function BagDispatchItemRow({ index, fieldRow, control, bagActiveItems, tc, userRole, totalItems, onRemoveItem }) {
  const canEditReturns = ['admin', 'manager'].includes(userRole);

  return (
    <div key={fieldRow.id} className="glass-panel rounded-2xl border border-white/5 shadow-xl transition-all duration-500 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-slate-900/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">{tc?.itemLabel ?? 'Item'} {index + 1}</span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-400">Bag</span>
        </div>
        {totalItems > 1 && (
          <button type="button" onClick={() => onRemoveItem(index)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={control}
            name={`items.${index}.itemId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>Product</FormLabel>
                <FormControl>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className={FORM_INPUT_CLASS}>
                      <SelectValue placeholder="Select bag product" />
                    </SelectTrigger>
                    <SelectContent className="glass-panel">
                      {(bagActiveItems || []).map((stockItem) => (
                        <SelectItem key={stockItem.id} value={String(stockItem.id)}>
                          {stockItem.sku} - {stockItem.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StockFormField control={control} name={`items.${index}.qtyBags`} label="Qty (Bags)" type="number" min="0" placeholder="0" />
            <StockFormField control={control} name={`items.${index}.ratePerBag`} label="Rate/Bag (₹)" type="number" min="0" placeholder="0" step="0.01" />
            <StockFormField control={control} name={`items.${index}.returnQtyBags`} label="Return Bags" type="number" min="0" placeholder="0" disabled={!canEditReturns} />
          </div>
        </div>
      </div>
    </div>
  );
});

export function BagDispatchFormContent({
  form,
  itemsFieldArray,
  attachments,
  setAttachment,
  onSubmit,
  onInvalid,
  submitting,
  notice,
  bagActiveItems,
  onAddItem,
  t,
  tc,
  userRole,
}) {
  return (
    <Form {...form}>
      <form className="mt-6 space-y-6" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <InlineNotice notice={notice} />
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Outbound Strategy" icon={Send} title="Bag Dispatch Basics" description="Invoice and customer details for bag goods dispatch" tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
            <StockFormField control={form.control} name="shipmentNumber" label={t?.('dispatchNo') ?? 'Dispatch No.'} placeholder="DSP-202X..." autoFocus />
            <StockFormField control={form.control} name="customerName" label={t?.('customer') ?? 'Customer'} placeholder="Customer Name..." />
            <StockFormField control={form.control} name="customerPhoneNumber" label={tc?.customerPhone ?? 'Customer Phone'} placeholder="+91 9876543210" type="tel" />
            <StockFormField control={form.control} name="invoiceNumber" label={t?.('invoiceNo') ?? 'Invoice No.'} placeholder="INV-..." />
            <StockDateField control={form.control} name="dispatchDate" label={tc?.date ?? 'Date'} placeholder="Date" />
            <StockFormField control={form.control} name="salespersonName" label={t?.('salesperson') ?? 'Salesperson'} placeholder="Salesperson..." />
            <AttachmentField label={tc?.salesInvoicePhoto ?? 'Sales Invoice'} file={attachments?.salesInvoice} onChange={(file) => setAttachment('salesInvoice', file)} hint={tc?.salesInvoiceHint} tc={tc} />
            <AttachmentField label={tc?.gatepassPhoto ?? 'Gate Pass'} file={attachments?.gatepass} onChange={(file) => setAttachment('gatepass', file)} accept="image/*" hint={tc?.gatepassHint} tc={tc} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Mobility Details" icon={Truck} title={tc?.transportAndVehicle ?? 'Transport & Vehicle'} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
            <StockFormField control={form.control} name="truckLicensePlate" label={t?.('truck') ?? 'Truck'} placeholder="RJ 14 XY 0000" />
            <StockFormField control={form.control} name="driverName" label={t?.('driver') ?? 'Driver'} placeholder="Driver Name..." />
            <StockMoneyField control={form.control} name="transportCost" label={t?.('transportCost') ?? 'Transport Cost'} hint={tc?.amountInInr} />
            <StockMoneyField control={form.control} name="laborCost" label={t?.('laborCost') ?? 'Labour Cost'} hint={tc?.amountInInr} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <div className="flex justify-between items-center mb-4 gap-4 px-1">
            <div className="space-y-1">
              <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                <span>Inventory Hub</span>
                <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                <span className="text-amber-400">Bag Goods</span>
              </nav>
              <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{t?.('items') ?? 'Items'}</h3>
            </div>
          </div>
          <div className="space-y-4">
            {itemsFieldArray.fields.map((fieldRow, index) => (
              <BagDispatchItemRow
                key={fieldRow.id}
                index={index}
                fieldRow={fieldRow}
                control={form.control}
                bagActiveItems={bagActiveItems}
                tc={tc}
                userRole={userRole}
                totalItems={itemsFieldArray.fields.length}
                onRemoveItem={(i) => itemsFieldArray.remove(i)}
              />
            ))}
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex mb-4 items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-400 transition-all hover:bg-amber-500/20 hover:scale-105 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Bag Item
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
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-2xl bg-amber-500 px-4 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-amber-500/20 transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-3">
            <Package className="h-5 w-5" />
            {submitting ? (tc?.submitting ?? 'Submitting...') : 'Submit Bag Dispatch'}
          </span>
        </button>
      </form>
    </Form>
  );
}

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

  return (
    <Form {...form}>
      <form className="mt-6 space-y-6" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <InlineNotice notice={notice} />
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle
            category="Outbound Strategy"
            icon={Send}
            title={tc.dispatchBasics}
            description={tc.dispatchBasicsDesc}
            tc={tc}
          />
          <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
            <StockFormField control={form.control} name="shipmentNumber" label={t('dispatchNo')} placeholder="DSP-202X..." autoFocus />
            <StockFormField control={form.control} name="customerName" label={t('customer')} placeholder="Customer Name..." />
            <StockFormField control={form.control} name="customerPhoneNumber" label={tc.customerPhone} placeholder="+91 9876543210" type="tel" />
            <StockFormField control={form.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." />
            <StockDateField control={form.control} name="dispatchDate" label={tc.date} placeholder={tc.date} />
            <SuggestComboboxField control={form.control} name="salespersonName" label={t('salesperson')} placeholder="Salesperson..." options={suggestions?.salespersonName} />
            <AttachmentField label={tc.salesInvoicePhoto} file={attachments.salesInvoice} onChange={(file) => setAttachment('salesInvoice', file)} hint={tc.salesInvoiceHint} tc={tc} />
            <AttachmentField label={tc.gatepassPhoto} file={attachments.gatepass} onChange={(file) => setAttachment('gatepass', file)} accept="image/*" hint={tc.gatepassHint} tc={tc} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle category="Mobility Details" icon={Truck} title={tc.transportAndVehicle} tc={tc} />
          <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
            <StockFormField control={form.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" />
            <StockFormField control={form.control} name="driverName" label={t('driver')} placeholder="Driver Name..." />
            <StockMoneyField control={form.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
            <StockMoneyField control={form.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <div className="">
            <div className="flex justify-between items-center mb-4 gap-4 px-1">
              <div className="space-y-1">
                <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                  <span>{tc.inventoryHub}</span>
                  <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                  <span className="text-brand-primary">{tc.shipments}</span>
                </nav>
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{t('items')}</h3>
              </div>

            </div>
            
            <div className="space-y-4">
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
          </div>
        </div>
        <button
              type="button"
              onClick={onAddItem}
              className="inline-flex mb-4 items-center gap-2 rounded-full bg-brand-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand-primary transition-all hover:bg-brand-primary/20 hover:scale-105 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('addItem')}
            </button>
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
          <span className="inline-flex items-center justify-center gap-3">
            <Send className="h-5 w-5" />
            {submitting ? tc.submitting : t('submitDispatch')}
          </span>
        </button>
      </form>
    </Form >
  );
}
