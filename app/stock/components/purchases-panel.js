'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, PackageCheck, Plus, Search, Package, Boxes } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { bagArrivalFormSchema } from '@/lib/forms/stock-forms';
import { ArrivalFormContent, BagArrivalFormContent } from './arrival-form';
import { createBagArrivalItemRow, createInitialBagArrivalDraft, formatDateTime, getGeneratedByRoleLabel, getStatusVariant, CLASSES, FORM_INPUT_CLASS, toNumber, trimText, fetchShipmentDetails, invalidateShipmentCache } from '../lib/stock-utils';

export function PurchasesPanel({
  arrivalForm,
  arrivalItemsFieldArray,
  arrivalWatchedItems,
  arrivalSheetOpen,
  setArrivalSheetOpen,
  arrivalAttachments,
  setArrivalAttachment,
  arrivalNotice,
  arrivalSubmitting,
  arrivalSearch,
  setArrivalSearch,
  arrivalSort,
  setArrivalSort,
  arrivalPagination,
  setArrivalPage,
  arrivalExpandedId,
  setArrivalExpandedId,
  highlightedShipmentKey,
  canCreateArrival,
  handleArrivalSubmit,
  handleArrivalInvalid,
  openShipmentPreview,
  onAddArrivalItem,
  onArrivalItemNameChange,
  suggestions,
  activeItems,
  t,
  tc,
  language,
  userRole,
  onNewArrival,
  onEdit,
  editingBagArrivalId,
  setEditingBagArrivalId,
}) {
  const canEdit = ['admin', 'manager'].includes(userRole);
  const [purchaseType, setPurchaseType] = useState('tile');
  const [bagNotice, setBagNotice] = useState(null);
  const [bagSubmitting, setBagSubmitting] = useState(false);
  const [bagAttachments, setBagAttachments] = useState({});
  const setBagAttachment = useCallback((key, file) => setBagAttachments((prev) => ({ ...prev, [key]: file })), []);

  const bagArrivalForm = useForm({
    resolver: zodResolver(bagArrivalFormSchema),
    defaultValues: createInitialBagArrivalDraft(),
  });
  const bagArrivalItemsFieldArray = useFieldArray({ control: bagArrivalForm.control, name: 'items' });

  useEffect(() => {
    if (!editingBagArrivalId) return;
    setPurchaseType('bag');
    setArrivalSheetOpen(true);
    setBagNotice({ type: 'info', message: 'Loading purchase details…' });
    fetchShipmentDetails('arrival', editingBagArrivalId)
      .then((json) => {
        const s = json.shipment;
        const items = json.items || [];
        bagArrivalForm.reset({
          supplierName: s.supplier_name || '',
          truckLicensePlate: s.truck_license_plate || s.truck_license_plate_snapshot || '',
          driverName: s.driver_name || s.driver_name_snapshot || '',
          invoiceNumber: s.invoice_number || '',
          invoiceDate: s.invoice_date ? s.invoice_date.split('T')[0] : '',
          originCity: s.origin_city || '',
          destinationWarehouseName: s.destination_warehouse_name || '',
          paymentStatus: s.payment_status || 'unpaid',
          paidAmount: s.paid_amount ?? '',
          paymentDate: s.payment_date ? s.payment_date.split('T')[0] : '',
          paymentReference: s.payment_reference || '',
          paymentMode: s.payment_mode || '',
          transporterName: s.transporter_name || '',
          transportCost: s.delivery_cost ?? '',
          laborCost: s.unloading_labour_cost ?? '',
          handlingCostPercent: s.handling_cost_percent != null ? String(s.handling_cost_percent) : '1.0',
          fuelCostPercent: s.fuel_cost_percent != null ? String(s.fuel_cost_percent) : '5.0',
          gstPercent: s.gst_percent != null ? String(s.gst_percent) : '18.0',
          freightWeightKg: s.freight_weight_kg != null ? String(s.freight_weight_kg) : '',
          notes: s.notes || '',
          items: items.length > 0 ? items.map((item) => ({
            itemCategory: 'bag',
            itemId: String(item.item_id),
            itemName: item.item_name || '',
            brandName: item.brand_name || '',
            typeName: item.type_name || '',
            qtyBags: item.ordered_qty != null ? String(item.ordered_qty) : '',
            weightPerUnitKg: item.weight_per_unit_kg != null ? String(item.weight_per_unit_kg) : '',
            ratePerBag: item.cost_per_bag != null ? String(item.cost_per_bag) : '',
            hsnCode: item.hsn_code || '',
            description: item.description || '',
            notes: item.notes || '',
          })) : [createBagArrivalItemRow()],
        });
        setBagNotice(null);
      })
      .catch((err) => setBagNotice({ type: 'error', message: err.message }));
  }, [editingBagArrivalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBagArrivalItemNameChange = useCallback((index, value) => {
    bagArrivalForm.setValue(`items.${index}.itemName`, value, { shouldDirty: true, shouldValidate: true });
    const bagItems = (activeItems || []).filter((i) => i.unit_of_measure === 'bag');
    const matched = bagItems.find((i) => i.name?.trim().toLowerCase() === value?.trim().toLowerCase());
    if (matched) {
      const current = bagArrivalForm.getValues(`items.${index}`);
      bagArrivalForm.setValue(`items.${index}`, {
        ...current,
        itemId: String(matched.id),
        itemName: matched.name,
        brandName: matched.brand_name || current.brandName,
        typeName: matched.type_name || current.typeName,
        weightPerUnitKg: matched.weight_per_unit_kg != null ? String(matched.weight_per_unit_kg) : current.weightPerUnitKg,
        ratePerBag: matched.rate_per_bag != null ? String(matched.rate_per_bag) : current.ratePerBag,
        hsnCode: matched.hsn_code || current.hsnCode,
        description: matched.description || current.description,
      }, { shouldDirty: true, shouldValidate: true });
    } else {
      bagArrivalForm.setValue(`items.${index}.itemId`, '', { shouldDirty: true });
    }
  }, [bagArrivalForm, activeItems]);

  const handleBagArrivalSubmit = useCallback(async (values) => {
    setBagNotice(null);
    setBagSubmitting(true);
    try {
      const items = values.items.map((item) => ({
        ...item,
        itemCategory: 'bag',
        qtyBags: toNumber(item.qtyBags),
        weightPerUnitKg: item.weightPerUnitKg === '' ? null : toNumber(item.weightPerUnitKg),
        ratePerBag: toNumber(item.ratePerBag),
        itemName: trimText(item.itemName),
        brandName: trimText(item.brandName),
        typeName: trimText(item.typeName),
        hsnCode: trimText(item.hsnCode),
        description: trimText(item.description),
        notes: trimText(item.notes),
      }));

      const payload = {
        ...values,
        items,
        transportCost: values.transportCost === '' ? 0 : toNumber(values.transportCost),
        laborCost: values.laborCost === '' ? 0 : toNumber(values.laborCost),
        handlingCostPercent: values.handlingCostPercent === '' ? 0 : toNumber(values.handlingCostPercent),
        fuelCostPercent: values.fuelCostPercent === '' ? 0 : toNumber(values.fuelCostPercent),
        gstPercent: values.gstPercent === '' ? 18 : toNumber(values.gstPercent),
        freightWeightKg: values.freightWeightKg === '' ? null : toNumber(values.freightWeightKg),
      };

      let response, json;
      if (editingBagArrivalId) {
        response = await fetch(`/api/stock/inbound-shipments/${editingBagArrivalId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, action: 'update' }),
        });
        json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to update bag purchase');
        setBagNotice({ type: 'success', message: `Bag purchase updated.` });
      } else {
        const formData = new FormData();
        if (bagAttachments.purchaseInvoice) formData.append('purchaseInvoice', bagAttachments.purchaseInvoice);
        if (bagAttachments.transporterBill) formData.append('transporterBill', bagAttachments.transporterBill);
        response = await fetch('/api/stock/inbound-shipments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to submit bag purchase');
        invalidateShipmentCache('arrival', editingBagArrivalId);
        if (json.shipment?.id) invalidateShipmentCache('arrival', json.shipment.id);
        setBagNotice({ type: 'success', message: `Bag purchase ${json.shipment?.shipment_number} submitted.` });
      }

      setBagAttachments({});
      bagArrivalForm.reset(createInitialBagArrivalDraft());
      if (setEditingBagArrivalId) setEditingBagArrivalId(null);
      setTimeout(() => setArrivalSheetOpen(false), 1200);
    } catch (err) {
      setBagNotice({ type: 'error', message: err.message });
    } finally {
      setBagSubmitting(false);
    }
  }, [bagArrivalForm, bagAttachments, editingBagArrivalId, setArrivalSheetOpen, setEditingBagArrivalId]);

  const handleBagArrivalInvalid = useCallback(() => {
    setBagNotice({ type: 'error', message: 'Please fix the highlighted errors.' });
  }, []);

  const toggleSort = useCallback((key) => {
    setArrivalSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setArrivalSort]);

  return (
    <div className="stock-tab-panel" key="stock-panel-purchases">
      <button
        type="button"
        onClick={onNewArrival || (() => setArrivalSheetOpen(true))}
        className="flex mb-6 justify-end items-center gap-2 rounded-full bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canCreateArrival}
        title={!canCreateArrival ? tc.insufficientNewPurchase : undefined}
      >
        <Plus className="h-4 w-4" />
        {tc.logNewPurchase}
      </button>

      <section id="purchases" className="flex h-full flex-col overflow-hidden scroll-mt-6 glass-panel rounded-2xl sm:rounded-3xl border border-slate-200/60 dark:border-white/5 shadow-2xl transition-all duration-500">
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-200/60 bg-slate-50/40 dark:bg-slate-900/40 px-6 py-5">
          <div className="space-y-1.5">
            <nav className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.4em] text-slate-400">
              <span>{tc.inventoryHub}</span>
              <ChevronRight className="h-2.5 w-2.5 opacity-50" />
              <span className="text-brand-primary">{tc.purchases}</span>
            </nav>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{tc.purchases}</h3>
              <span className="rounded-full bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest tabular-nums text-brand-primary shadow-sm">
                {arrivalPagination.total} {t('items')}
              </span>
            </div>
          </div>
          <Sheet open={arrivalSheetOpen} onOpenChange={(open) => { setArrivalSheetOpen(open); if (!open) { if (setEditingBagArrivalId) setEditingBagArrivalId(null); bagArrivalForm.reset(createInitialBagArrivalDraft()); setPurchaseType('tile'); setBagNotice(null); } }}>

            <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
              <SheetHeader className="border-b border-border pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <SheetTitle className="text-base">{tc.logNewPurchase}</SheetTitle>
                    <SheetDescription className="text-xs">{tc.purchaseSheetDesc}</SheetDescription>
                  </div>
                </div>
                <div className="flex items-center justify-evenly gap-1 rounded-full bg-slate-100 dark:bg-slate-800 p-1">
                    <button
                      type="button"
                      onClick={() => setPurchaseType('tile')}
                      className={`inline-flex items-center gap-1.5 px-10 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${purchaseType === 'tile' ? 'bg-brand-primary text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      <Boxes className="h-3 w-3" />
                      Tiles
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPurchaseType('bag'); bagArrivalForm.reset(createInitialBagArrivalDraft()); }}
                      className={`inline-flex items-center gap-1.5 px-10 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${purchaseType === 'bag' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      <Package className="h-3 w-3" />
                      Bags
                    </button>
                  </div>
              </SheetHeader>
              {purchaseType === 'tile' ? (
                <ArrivalFormContent
                  form={arrivalForm}
                  itemsFieldArray={arrivalItemsFieldArray}
                  watchedItems={arrivalWatchedItems}
                  attachments={arrivalAttachments}
                  setAttachment={setArrivalAttachment}
                  onSubmit={handleArrivalSubmit}
                  onInvalid={handleArrivalInvalid}
                  submitting={arrivalSubmitting}
                  notice={arrivalNotice}
                  suggestions={suggestions}
                  activeItems={activeItems}
                  onItemNameChange={onArrivalItemNameChange}
                  onAddItem={onAddArrivalItem}
                  t={t}
                  tc={tc}
                  language={language}
                />
              ) : (
                <BagArrivalFormContent
                  form={bagArrivalForm}
                  itemsFieldArray={bagArrivalItemsFieldArray}
                  attachments={bagAttachments}
                  setAttachment={setBagAttachment}
                  onSubmit={handleBagArrivalSubmit}
                  onInvalid={handleBagArrivalInvalid}
                  submitting={bagSubmitting}
                  notice={bagNotice}
                  suggestions={suggestions}
                  activeItems={activeItems}
                  onItemNameChange={handleBagArrivalItemNameChange}
                  onAddItem={() => bagArrivalItemsFieldArray.append(createBagArrivalItemRow())}
                  t={t}
                  tc={tc}
                />
              )}
            </SheetContent>
          </Sheet>
        </div>
        {!canCreateArrival ? (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {tc.insufficientNewPurchase}
          </div>
        ) : null}
        <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/50 px-3 py-2.5 backdrop-blur-md dark:bg-slate-900/50">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-brand-primary" />
            <input
              type="search"
              value={arrivalSearch}
              onChange={(event) => setArrivalSearch(event.target.value)}
              placeholder={tc.searchPurchases}
              className={`${FORM_INPUT_CLASS} pl-11`}
            />
          </div>
        </div>
        <div className="space-y-4 p-3 md:hidden">
          {arrivalPagination.rows.map((a) => {
            const expanded = arrivalExpandedId === a.id;
            return (
              <article key={`arrival-mobile-${a.id}`} className="glass-panel rounded-2xl border border-white/5 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openShipmentPreview('arrival', a)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open purchase ${a.shipment_number}`}
                  >
                    <p className="break-all font-mono text-xs font-semibold text-primary">{a.shipment_number}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(a.arrival_date || a.created_at)}</p>
                  </button>
                  <Badge variant={getStatusVariant(a.status)}>{a.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {Number(a.total_bag_qty || 0) > 0 && (
                    <span className="text-amber-500 font-black" title={`${Number(a.total_bag_qty)} Bags`}>
                      {Number(a.total_bag_qty)} <span className="text-[10px] uppercase text-amber-400/70">Bags</span>
                    </span>
                  )}
                  {((Number(a.total_whole_qty || 0) > 0 || Number(a.total_broken_qty || 0) > 0) || Number(a.total_bag_qty || 0) === 0) && (
                    <span title={`${Number(a.total_whole_qty || 0)} Whole and ${Number(a.total_broken_qty || 0)} Broken Tiles`}>
                      {Number(a.total_whole_qty || 0)} <span className="text-[10px] uppercase text-slate-400 mr-1">Whole</span>
                      {Number(a.total_broken_qty || 0)} <span className="text-[10px] uppercase text-slate-400">Broken</span>
                    </span>
                  )}
                  {Number(a.total_qty_sqm || 0) > 0 && (
                    <span className="text-[10px] font-bold text-slate-400" title={`${Number(a.total_qty_sqm).toFixed(2)} Square Meters`}>
                      {Number(a.total_qty_sqm).toFixed(2)} SQM
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{tc.invoice}:</span> {a.invoice_number || '—'}{a.invoice_date ? ` (${formatDateTime(a.invoice_date)})` : ''}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{tc.route}:</span> {a.origin_city || '—'} → {a.destination_warehouse_name || '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{tc.payment}:</span> <span className={`capitalize ${a.payment_status === 'paid' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>{a.payment_status || 'Unpaid'}</span>{a.paid_amount != null ? ` · ₹${Number(a.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''}
                </p>
                {expanded ? (
                  <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-white/5 pt-2">
                    <p className="truncate font-medium text-slate-700 dark:text-slate-300">{a.product_names || a.product_skus || '—'}</p>
                    <p><span className="font-semibold">{tc.division}:</span> {a.divisions || tc.general || 'General'}</p>
                    {a.grand_total ? <p><span className="font-semibold">{tc.grandTotal}:</span> ₹{Number(a.grand_total).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p> : null}
                    {a.freight_weight_kg ? <p><span className="font-semibold">{tc.freight}:</span> {Number(a.freight_weight_kg).toFixed(2)} kg</p> : null}
                    <p><span className="font-semibold">{tc.generatedBy}:</span> {a.generated_by || '—'}</p>
                    {a.approved_by ? <p><span className="font-semibold">{tc.approvedBy}:</span> {a.approved_by}</p> : null}
                  </div>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setArrivalExpandedId((current) => (current === a.id ? null : a.id))}
                    className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                    aria-label={expanded ? tc.collapse : tc.expand}
                  >
                    {expanded ? tc.collapse : tc.expand}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onClick={e => { e.stopPropagation(); onEdit(a); }}
                    >
                      {tc.edit}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="overflow-x-auto [scrollbar-width:thin] flex-1">
          <table className="hidden w-full text-left whitespace-nowrap md:table border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl">
              <tr className="border-b border-slate-200/60 dark:border-white/5">
                {[
                  { id: 'datetime', label: tc.datetime },
                  { id: 'shipment', label: t('shipmentNo') },
                  { id: 'invoice', label: tc.invoice },
                  { id: 'route', label: tc.route },
                  { id: 'payment', label: tc.payment },
                  { id: 'products', label: tc.products },
                  { id: 'quantities', label: tc.quantities, align: 'right' },
                  { id: 'grandTotal', label: tc.grandTotal, align: 'right' },
                  { id: 'freight', label: `${tc.freight} (kg)`, align: 'right' },
                  ...(canEdit ? [{ id: 'edit', label: tc.edit, align: 'right' }] : []),
                  { id: 'status', label: t('status') },
                  { id: 'generatedBy', label: tc.generatedBy },
                  { id: 'approvedBy', label: tc.approvedBy },
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => col.id !== 'invoice' && col.id !== 'route' && col.id !== 'payment' && col.id !== 'freight' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? toggleSort(col.id) : undefined}
                      className={`text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-2 group/th ${col.id !== 'invoice' && col.id !== 'route' && col.id !== 'payment' && col.id !== 'freight' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? 'hover:text-brand-primary' : 'cursor-default transition-all duration-300'}`}
                    >
                      {col.label}
                      {col.id !== 'invoice' && col.id !== 'route' && col.id !== 'payment' && col.id !== 'freight' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' && (
                        <span className={`h-1 w-1 rounded-full bg-brand-primary opacity-0 transition-opacity ${arrivalSort.key === col.id ? 'opacity-100' : 'group-hover/th:opacity-40'}`} />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {arrivalPagination.rows.map((a) => (
                <tr
                  key={a.id}
                  className={`group/row cursor-pointer transition-all duration-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 ${highlightedShipmentKey === `arrival-${a.id}` ? 'bg-primary/10 ring-1 ring-primary/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'}`}
                  onClick={() => openShipmentPreview('arrival', a)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openShipmentPreview('arrival', a);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-4 py-3 text-[11px] text-muted-foreground tabular-nums">{formatDateTime(a.arrival_date || a.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] font-black tracking-tight text-brand-primary bg-brand-primary/5 px-2 py-1 rounded-md border border-brand-primary/20 transition-colors group-hover/row:bg-brand-primary/10">
                      {a.shipment_number}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    <div className="font-black text-slate-700 dark:text-slate-300">{a.invoice_number || '—'}</div>
                    <div className="text-[9px] font-bold opacity-60 uppercase">{a.invoice_date ? formatDateTime(a.invoice_date) : '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    <div className="max-w-[170px] truncate font-bold text-slate-700 dark:text-slate-300" title={`${a.origin_city || '—'} to ${a.destination_warehouse_name || '—'}`}>
                      {a.origin_city || '—'} to {a.destination_warehouse_name || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    <div className={`uppercase text-[9px] font-black tracking-widest ${a.payment_status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>{a.payment_status || 'Unpaid'}</div>
                    {a.paid_amount != null ? <div className="text-[10px] font-black tabular-nums text-slate-900 dark:text-white">₹{Number(a.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-xs font-black text-slate-900 dark:text-white" title={a.product_names || a.product_skus || ''}>{a.product_names || a.product_skus || '—'}</div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">{a.divisions || tc.general || 'General'}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {Number(a.total_bag_qty || 0) > 0 && (
                        <div className="text-xs font-black text-amber-500 tabular-nums" title={`${Number(a.total_bag_qty)} Bags`}>
                          {Number(a.total_bag_qty)} <span className="text-[9px] font-bold text-amber-400/70 uppercase">Bags</span>
                        </div>
                      )}
                      {((Number(a.total_whole_qty || 0) > 0 || Number(a.total_broken_qty || 0) > 0) || Number(a.total_bag_qty || 0) === 0) && (
                        <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums" title={`${Number(a.total_whole_qty || 0)} Whole and ${Number(a.total_broken_qty || 0)} Broken Tiles`}>
                          {Number(a.total_whole_qty || 0)} <span className="text-[9px] font-bold text-slate-400 mr-1 uppercase">Whole</span>
                          <span className="opacity-50 mx-0.5">/</span> {Number(a.total_broken_qty || 0)} <span className="text-[9px] font-bold text-slate-400 uppercase">Broken</span>
                        </div>
                      )}
                      {Number(a.total_qty_sqm || 0) > 0 && (
                        <div className="text-[9px] font-bold text-muted-foreground tabular-nums mt-0.5" title={`${Number(a.total_qty_sqm).toFixed(3)} Square Meters`}>
                          {Number(a.total_qty_sqm).toFixed(3)} SQM
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">₹{Number(a.grand_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground tabular-nums">{Number(a.freight_weight_kg || 0).toFixed(2)}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                        onClick={e => { e.stopPropagation(); onEdit(a); }}
                      >
                        {tc.edit}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3"><Badge variant={getStatusVariant(a.status)}>{a.status}</Badge></td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{a.generated_by || '—'}</span>
                      <Badge variant="neutral" className="text-[9px] font-black uppercase tracking-tighter px-1">{getGeneratedByRoleLabel(a.generated_by_role)}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-bold text-muted-foreground">{a.approved_by || '—'}</td>
                </tr>
              ))}
              {arrivalPagination.total === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 13 : 12} className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageCheck className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noPurchases}</p>
                      <button
                        type="button"
                        onClick={() => setArrivalSearch('')}
                        className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {tc.clearFilters}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50/40 dark:bg-slate-900/40 border-t border-slate-200/60 dark:border-white/5">
          <PaginationControls
            page={arrivalPagination.page}
            pageCount={arrivalPagination.pageCount}
            total={arrivalPagination.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setArrivalPage}
            labels={{
              showing: tc.paginationShowing,
              of: tc.paginationOf,
              previous: tc.paginationPrevious,
              next: tc.paginationNext,
              page: tc.paginationPage,
            }}
          />
        </div>
      </section>
    </div>
  );
}
