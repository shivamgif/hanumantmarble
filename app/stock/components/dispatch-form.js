'use client';

import { memo, useMemo } from 'react';
import { Boxes, CreditCard, Plus, Send, Truck } from 'lucide-react';
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
} from './stock-form-fields';
import { FORM_CARD_CLASS, FORM_INPUT_CLASS, FORM_LABEL_CLASS } from '../lib/stock-utils';

const DispatchItemRow = memo(function DispatchItemRow({ index, fieldRow, control, activeItems, itemOptions, t, language, userRole }) {
  const itemInputClass = 'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';
  const canEditReturns = ['admin', 'manager'].includes(userRole);

  return (
    <div key={fieldRow.id} className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-semibold text-foreground">{language === 'hi' ? 'आइटम' : 'Item'} {index + 1}</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <FormField
            control={control}
            name={`items.${index}.itemId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{t('sku')} / {t('name')}</FormLabel>
                <FormControl>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className={`mt-1 ${itemInputClass}`}>
                      <SelectValue placeholder={t('selectItem')} />
                    </SelectTrigger>
                    <SelectContent className={FORM_INPUT_CLASS}>
                      {(activeItems || []).map((stockItem) => (
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
          <FormField
            control={control}
            name={`items.${index}.loadedWholeQty`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>{t('whole')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className={`mt-1 ${itemInputClass}`} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          {/* Return fields, only visible to admin/manager (UI logic to be added) */}
          <FormField
            control={control}
            name={`items.${index}.returnWholeQty`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>Return Whole</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className={`mt-1 ${itemInputClass}`} disabled={!canEditReturns} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`items.${index}.returnBrokenQty`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={FORM_LABEL_CLASS}>Return Broken</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className={`mt-1 ${itemInputClass}`} disabled={!canEditReturns} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
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
  onAddItem,
  t,
  tc,
  language,
  userRole,
}) {
  const itemOptions = useMemo(() => (activeItems || []).map((stockItem) => ({ id: stockItem.id, sku: stockItem.sku, name: stockItem.name })), [activeItems]);

  return (
    <Form {...form}>
      <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <InlineNotice notice={notice} />
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle
            icon={Send}
            title={language === 'hi' ? 'डिस्पैच की मूल जानकारी' : 'Dispatch Basics'}
            description={language === 'hi' ? 'इस डिस्पैच के लिए मुख्य विवरण भरें।' : 'Fill in the core details for this dispatch.'}
          />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <StockFormField control={form.control} name="shipmentNumber" label={t('dispatchNo')} placeholder="DSP-202X..." className={FORM_INPUT_CLASS} autoFocus />
            <StockFormField control={form.control} name="customerName" label={t('customer')} placeholder="Customer Name..." className={FORM_INPUT_CLASS} />
            <StockFormField control={form.control} name="customerPhoneNumber" label="Customer Phone" placeholder="+91 9876543210" type="tel" className={FORM_INPUT_CLASS} />
            <StockFormField control={form.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." className={FORM_INPUT_CLASS} />
            <StockDateField control={form.control} name="dispatchDate" label={tc.date} placeholder={tc.date} />
            <StockFormField control={form.control} name="salespersonName" label={t('salesperson')} placeholder="Salesperson..." className={FORM_INPUT_CLASS} />
            <AttachmentField label={tc.salesInvoicePhoto} file={attachments.salesInvoice} onChange={(file) => setAttachment('salesInvoice', file)} hint={tc.salesInvoiceHint} />
            <AttachmentField label={tc.gatepassPhoto} file={attachments.gatepass} onChange={(file) => setAttachment('gatepass', file)} accept="image/*" hint={tc.gatepassHint} />
         
          </div>
        </div>
        <div className={FORM_CARD_CLASS}>
          <FormSectionTitle icon={Truck} title={language === 'hi' ? 'डिस्पैच और वाहन' : 'Transport & Vehicle'} />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <StockFormField control={form.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" className={FORM_INPUT_CLASS} />
            <StockFormField control={form.control} name="driverName" label={t('driver')} placeholder="Driver Name..." className={FORM_INPUT_CLASS} />
           </div>
           <div className="mt-3 grid gap-4 md:grid-cols-2">
              <StockMoneyField control={form.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
              <StockMoneyField control={form.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
            </div>
        </div>
        <div className="rounded-2xl bg-muted/20 p-0">
          <div className="flex justify-between items-center mb-2 gap-4 px-4 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-primary" />
              <span>{t('items')}</span>
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
          <div className="mt-3 space-y-3 pb-4">
            {itemsFieldArray.fields.map((fieldRow, index) => (
              <DispatchItemRow
                key={fieldRow.id}
                index={index}
                fieldRow={fieldRow}
                control={form.control}
                activeItems={activeItems}
                itemOptions={itemOptions}
                t={t}
                language={language}
                userRole={userRole}
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
                  <Textarea {...field} value={field.value ?? ''} className={`${FORM_INPUT_CLASS} mt-1`} rows={2} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Send className="h-4 w-4" />
            {submitting ? tc.submitting : t('submitDispatch')}
          </span>
        </button>
      </form>
    </Form>
  );
}
