'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, PackageCheck, Plus, Search, CalendarDays, ArrowDown, ArrowUp, Package, Boxes, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { bagArrivalFormSchema, stoneArrivalFormSchema } from '@/lib/forms/stock-forms';
import { ArrivalFormContent, BagArrivalFormContent, StoneArrivalFormContent } from './arrival-form';
import { groupRowsByDay, formatTime } from '../lib/group-by-day.mjs';
import { createStoneArrivalItemRow, createInitialStoneArrivalDraft, createBagArrivalItemRow, createInitialBagArrivalDraft, formatDateTime, getGeneratedByRoleLabel, getStatusVariant, CLASSES, FORM_INPUT_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS, toNumber, trimText, fetchShipmentDetails, invalidateShipmentCache, exportToCSV, EXPORT_PERIOD_PRESETS, filterRowsByPeriod, fetchAllPages, fetchArrivals } from '../lib/stock-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function PurchasesPanel({
  tabs,
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
  onArrivalItemGradeChange,
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
  pageSize,
  setPageSize,
  onRefreshData,
  onToast,
  arrivalFetching,
}) {
  const canEdit = ['admin', 'manager'].includes(userRole);
  const [purchaseType, setPurchaseType] = useState('tile');
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [confirmPaidId, setConfirmPaidId] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function handleMarkAsPaid(id) {
    setMarkingPaidId(id);
    setConfirmPaidId(null);
    try {
      const res = await fetch(`/api/stock/inbound-shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', paymentStatus: 'paid' }),
      });
      if (!res.ok) throw new Error('Failed to mark as paid');
      invalidateShipmentCache('arrival', id);
      if (onRefreshData) await onRefreshData();
    } finally {
      setMarkingPaidId(null);
    }
  }
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
          transporterUnknown: !(s.transporter_name || s.truck_license_plate || s.driver_name),
          // Freight lives on the truck trip; the shipment's own columns are 0.
          tripId: s.trip_id ? String(s.trip_id) : '',
          transportCost: s.trip_delivery_cost ?? s.delivery_cost ?? '',
          laborCost: s.trip_unloading_labour_cost ?? s.unloading_labour_cost ?? '',
          handlingCostPercent: s.handling_cost_percent != null ? String(s.handling_cost_percent) : '1.0',
          fuelCostPercent: s.fuel_cost_percent != null ? String(s.fuel_cost_percent) : '5.0',
          gstPercent: s.gst_percent != null ? String(s.gst_percent) : '18.0',
          freightWeightKg: s.freight_weight_kg != null ? String(s.freight_weight_kg) : '',
          discountAmount: s.discount_amount != null && Number(s.discount_amount) !== 0 ? String(s.discount_amount) : '',
          notes: s.notes || '',
          items: items.length > 0 ? items.map((item) => ({
            id: item.id != null ? Number(item.id) : undefined,
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
            discountAmount: item.discount_amount != null && Number(item.discount_amount) !== 0 ? String(item.discount_amount) : '',
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

  // ---- Stone purchases (traded by total sqft) ----
  const [stoneNotice, setStoneNotice] = useState(null);
  const [stoneSubmitting, setStoneSubmitting] = useState(false);
  const [stoneAttachments, setStoneAttachments] = useState({});
  const setStoneAttachment = useCallback((key, file) => setStoneAttachments((prev) => ({ ...prev, [key]: file })), []);

  const stoneArrivalForm = useForm({
    resolver: zodResolver(stoneArrivalFormSchema),
    defaultValues: createInitialStoneArrivalDraft(),
  });
  const stoneArrivalItemsFieldArray = useFieldArray({ control: stoneArrivalForm.control, name: 'items' });

  const handleStoneArrivalItemNameChange = useCallback((index, value) => {
    stoneArrivalForm.setValue(`items.${index}.itemName`, value, { shouldDirty: true, shouldValidate: true });
    const stoneItems = (activeItems || []).filter((i) => i.unit_of_measure === 'sqft');
    const matched = stoneItems.find((i) => (i.name || '').toLowerCase() === String(value || '').toLowerCase());
    if (matched) {
      const current = stoneArrivalForm.getValues(`items.${index}`);
      stoneArrivalForm.setValue(`items.${index}`, {
        ...current,
        itemId: String(matched.id),
        brandName: matched.brand_name || current.brandName,
        typeName: matched.type_name || current.typeName,
        ratePerSqft: matched.rate_per_sqft != null ? String(matched.rate_per_sqft) : current.ratePerSqft,
        // Slab size differs every delivery — prefill the last one as a hint only.
        sizeLabel: matched.last_slab_size_label || current.sizeLabel,
        hsnCode: matched.hsn_code || current.hsnCode,
        description: matched.description || current.description,
      }, { shouldDirty: true, shouldValidate: true });
    } else {
      stoneArrivalForm.setValue(`items.${index}.itemId`, '', { shouldDirty: true });
    }
  }, [stoneArrivalForm, activeItems]);

  const handleStoneArrivalSubmit = useCallback(async (values) => {
    setStoneNotice(null);
    setStoneSubmitting(true);
    try {
      const items = values.items.map((item) => ({
        ...item,
        itemCategory: 'stone',
        qtySqft: toNumber(item.qtySqft),
        ratePerSqft: toNumber(item.ratePerSqft),
        thicknessMm: item.thicknessMm === '' ? null : toNumber(item.thicknessMm),
        itemName: trimText(item.itemName),
        brandName: trimText(item.brandName),
        typeName: trimText(item.typeName),
        sizeLabel: trimText(item.sizeLabel),
        hsnCode: trimText(item.hsnCode),
        description: trimText(item.description),
        discountAmount: item.discountAmount === '' ? 0 : toNumber(item.discountAmount),
        notes: trimText(item.notes),
      }));

      const payload = {
        ...values,
        items,
        // Without this the arrival date is the moment the form was submitted,
        // which can be days after the lorry came - and a trip is matched on
        // plate and date, so the other invoices off that truck never find it.
        purchaseDate: values.invoiceDate || undefined,
        transportCost: values.transportCost === '' ? 0 : toNumber(values.transportCost),
        laborCost: values.laborCost === '' ? 0 : toNumber(values.laborCost),
        handlingCostPercent: values.handlingCostPercent === '' ? 0 : toNumber(values.handlingCostPercent),
        fuelCostPercent: values.fuelCostPercent === '' ? 0 : toNumber(values.fuelCostPercent),
        // Stone is taxed at 5%.
        gstPercent: values.gstPercent === '' ? 5 : toNumber(values.gstPercent),
        freightWeightKg: values.freightWeightKg === '' ? null : toNumber(values.freightWeightKg),
        discountAmount: values.discountAmount === '' ? 0 : toNumber(values.discountAmount),
      };

      const response = await fetch('/api/stock/inbound-shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to submit stone purchase');
      if (json.shipment?.id) invalidateShipmentCache('arrival', json.shipment.id);
      if (onRefreshData) await onRefreshData();
      const msg = `Stone purchase ${json.shipment?.shipment_number} submitted.`;
      setStoneNotice({ type: 'success', message: msg });
      if (onToast) onToast({ type: 'success', message: msg });

      setStoneAttachments({});
      stoneArrivalForm.reset(createInitialStoneArrivalDraft());
      setArrivalSheetOpen(false);
    } catch (err) {
      setStoneNotice({ type: 'error', message: err.message });
      if (onToast) onToast({ type: 'error', message: err.message });
    } finally {
      setStoneSubmitting(false);
    }
  }, [stoneArrivalForm, setArrivalSheetOpen, onRefreshData, onToast]);

  const handleStoneArrivalInvalid = useCallback(() => {
    setStoneNotice({ type: 'error', message: 'Please fix the highlighted errors.' });
  }, []);

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
        discountAmount: item.discountAmount === '' ? 0 : toNumber(item.discountAmount),
        notes: trimText(item.notes),
      }));

      const payload = {
        ...values,
        items,
        // Without this the arrival date is the moment the form was submitted,
        // which can be days after the lorry came - and a trip is matched on
        // plate and date, so the other invoices off that truck never find it.
        purchaseDate: values.invoiceDate || undefined,
        transportCost: values.transportCost === '' ? 0 : toNumber(values.transportCost),
        laborCost: values.laborCost === '' ? 0 : toNumber(values.laborCost),
        handlingCostPercent: values.handlingCostPercent === '' ? 0 : toNumber(values.handlingCostPercent),
        fuelCostPercent: values.fuelCostPercent === '' ? 0 : toNumber(values.fuelCostPercent),
        gstPercent: values.gstPercent === '' ? 18 : toNumber(values.gstPercent),
        freightWeightKg: values.freightWeightKg === '' ? null : toNumber(values.freightWeightKg),
        discountAmount: values.discountAmount === '' ? 0 : toNumber(values.discountAmount),
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
        invalidateShipmentCache('arrival', editingBagArrivalId);
        if (json.shipment?.id) invalidateShipmentCache('arrival', json.shipment.id);
        if (onRefreshData) await onRefreshData();
        setBagNotice({ type: 'success', message: `Bag purchase updated.` });
        if (onToast) onToast({ type: 'success', message: `Bag purchase updated.` });
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
        const bagSuccessMsg = `Bag purchase ${json.shipment?.shipment_number} submitted.`;
        setBagNotice({ type: 'success', message: bagSuccessMsg });
        if (onToast) onToast({ type: 'success', message: bagSuccessMsg });
      }

      setBagAttachments({});
      bagArrivalForm.reset(createInitialBagArrivalDraft());
      if (setEditingBagArrivalId) setEditingBagArrivalId(null);
      setArrivalSheetOpen(false);
    } catch (err) {
      setBagNotice({ type: 'error', message: err.message });
      if (onToast) onToast({ type: 'error', message: err.message });
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
  // Newest first on the first press from any other sort, then it flips.
  const toggleDateSort = useCallback(() => {
    setArrivalSort((current) => ({
      key: 'datetime',
      direction: current.key === 'datetime' && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, [setArrivalSort]);

  // Sorted by date, rows are bunched per day so the date prints once; any other
  // sort keeps a date on every row, where a heading per row would only add noise.
  const arrivalGrouped = arrivalSort.key === 'datetime';
  const arrivalDateOf = (a) => a.arrival_date || a.created_at;
  const arrivalGroups = arrivalGrouped
    ? groupRowsByDay(arrivalPagination.rows, arrivalDateOf, { today: tc.today, yesterday: tc.yesterday, locale: tc.dateLocale })
    : arrivalPagination.rows.map((a) => ({ key: a.id, label: formatDateTime(arrivalDateOf(a)), rows: [a] }));
  const arrivalWhen = (a) => (arrivalGrouped ? formatTime(arrivalDateOf(a), tc.dateLocale) : formatDateTime(arrivalDateOf(a)));

  return (
    <div className="stock-tab-panel" key="stock-panel-purchases">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        {tabs}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={PILL_BUTTON_CLASS}
            title="Export Purchases to CSV"
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {EXPORT_PERIOD_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={async () => {
                const dateStr = new Date().toISOString().split('T')[0];
                const columns = [
                  { id: 'date', label: 'Date', value: (row) => formatDateTime(row.arrival_date || row.created_at) },
                  { id: 'shipment', label: 'Shipment No', value: (row) => row.shipment_number || '' },
                  { id: 'invoice', label: 'Invoice No', value: (row) => row.invoice_number || '' },
                  { id: 'origin', label: 'Origin', value: (row) => row.origin_city || '' },
                  { id: 'destination', label: 'Destination', value: (row) => row.destination_warehouse_name || '' },
                  { id: 'paymentStatus', label: 'Payment Status', value: (row) => row.payment_status || 'Unpaid' },
                  { id: 'paidAmount', label: 'Paid Amount', value: (row) => row.paid_amount != null ? row.paid_amount : '' },
                  { id: 'products', label: 'Products', value: (row) => row.product_names || row.product_skus || '' },
                  { id: 'totalBags', label: 'Total Bags', value: (row) => row.total_bag_qty || '0' },
                  { id: 'totalSqft', label: 'Total Sqft', value: (row) => row.total_sqft_qty ? Number(row.total_sqft_qty).toFixed(3) : '0' },
                  { id: 'wholeTiles', label: 'Whole Tiles', value: (row) => row.total_whole_qty || '0' },
                  { id: 'brokenTiles', label: 'Broken Tiles', value: (row) => row.total_broken_qty || '0' },
                  { id: 'totalSqm', label: 'Total SQM', value: (row) => row.total_qty_sqm ? Number(row.total_qty_sqm).toFixed(3) : '0' },
                  { id: 'grandTotal', label: 'Grand Total', value: (row) => row.grand_total || '0' },
                  { id: 'freightWeight', label: 'Freight Weight (kg)', value: (row) => row.freight_weight_kg || '0' },
                  { id: 'status', label: 'Status', value: (row) => row.status || '' },
                  { id: 'generatedBy', label: 'Generated By', value: (row) => row.generated_by || '' },
                ];
                setExporting(true);
                try {
                  const allRows = await fetchAllPages(
                    ({ page, pageSize: size }) => fetchArrivals({
                      page,
                      pageSize: size,
                      search: arrivalSearch,
                      sortKey: arrivalSort.key,
                      sortDir: arrivalSort.direction,
                    }),
                    'arrivals'
                  );
                  const rows = filterRowsByPeriod(allRows, ['arrival_date', 'created_at'], preset.id);
                  const suffix = preset.id === 'all' ? '' : `_${preset.id}`;
                  exportToCSV(`Purchases_Export${suffix}_${dateStr}.csv`, rows, columns);
                } finally {
                  setExporting(false);
                }
              }}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={onNewArrival || (() => setArrivalSheetOpen(true))}
        className={PILL_PRIMARY_BUTTON_CLASS}
        disabled={!canCreateArrival}
        title={!canCreateArrival ? tc.insufficientNewPurchase : undefined}
      >
        <Plus className="h-4 w-4" />
        {tc.logNewPurchase}
      </button>
        </div>
        <Sheet open={arrivalSheetOpen} onOpenChange={(open) => { setArrivalSheetOpen(open); if (!open) { if (setEditingBagArrivalId) setEditingBagArrivalId(null); bagArrivalForm.reset(createInitialBagArrivalDraft()); stoneArrivalForm.reset(createInitialStoneArrivalDraft()); setPurchaseType('tile'); setBagNotice(null); setStoneNotice(null); } }}>

          <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[80vw] lg:w-[70vw] xl:w-[62vw] 2xl:w-[55vw] md:max-w-[1100px]">
            <SheetHeader className="border-b border-border pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <SheetTitle className="text-base">{tc.logNewPurchase}</SheetTitle>
                  <SheetDescription className="text-xs">{tc.purchaseSheetDesc}</SheetDescription>
                </div>
              </div>
              {/* Three equal-width segments. Each used to carry 40px of side
                  padding, so on a phone the row ran past the sheet edge. */}
              <div role="tablist" aria-label="Purchase type" className="flex items-center gap-1 rounded-lg bg-muted p-1">
                {[
                  { type: 'tile', label: 'Tiles', Icon: Boxes, activeClass: 'bg-brand-primary', blank: null },
                  { type: 'bag', label: 'Bags', Icon: Package, activeClass: 'bg-amber-500', blank: () => bagArrivalForm.reset(createInitialBagArrivalDraft()) },
                  { type: 'stone', label: 'Stone', Icon: Layers, activeClass: 'bg-sky-500', blank: () => stoneArrivalForm.reset(createInitialStoneArrivalDraft()) },
                ].map(({ type, label, Icon, activeClass, blank }) => {
                  const active = purchaseType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        // Tapping the tab already open used to wipe what was typed.
                        if (active) return;
                        setPurchaseType(type);
                        blank?.();
                      }}
                      className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors sm:px-6 ${active ? `${activeClass} text-white shadow` : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
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
                onGradeChange={onArrivalItemGradeChange}
                onAddItem={onAddArrivalItem}
                t={t}
                tc={tc}
                language={language}
              />
            ) : purchaseType === 'stone' ? (
              <StoneArrivalFormContent
                form={stoneArrivalForm}
                itemsFieldArray={stoneArrivalItemsFieldArray}
                attachments={stoneAttachments}
                setAttachment={setStoneAttachment}
                onSubmit={handleStoneArrivalSubmit}
                onInvalid={handleStoneArrivalInvalid}
                submitting={stoneSubmitting}
                notice={stoneNotice}
                suggestions={suggestions}
                activeItems={activeItems}
                onItemNameChange={handleStoneArrivalItemNameChange}
                onAddItem={() => stoneArrivalItemsFieldArray.append(createStoneArrivalItemRow())}
                t={t}
                tc={tc}
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
      <section id="purchases" className="flex h-full flex-col overflow-hidden scroll-mt-6 glass-panel rounded-xl">
        {!canCreateArrival ? (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {tc.insufficientNewPurchase}
          </div>
        ) : null}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
          <div className="relative group min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={arrivalSearch}
              onChange={(event) => setArrivalSearch(event.target.value)}
              placeholder={tc.searchPurchases}
              className={`${FORM_INPUT_CLASS} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={toggleDateSort}
            aria-label={arrivalSort.key === 'datetime' && arrivalSort.direction === 'asc' ? tc.oldestFirst : tc.newestFirst}
            title={arrivalSort.key === 'datetime' && arrivalSort.direction === 'asc' ? tc.oldestFirst : tc.newestFirst}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium transition-colors hover:bg-muted ${arrivalGrouped ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">{arrivalSort.key === 'datetime' && arrivalSort.direction === 'asc' ? tc.oldestFirst : tc.newestFirst}</span>
            {arrivalGrouped ? (arrivalSort.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : null}
          </button>
        </div>
        <div className={`px-3 pb-1 md:hidden transition-opacity duration-200 ${arrivalFetching ? 'opacity-50' : ''}`}>
          {arrivalFetching && arrivalPagination.rows.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {arrivalGroups.map((group) => (
            <div key={group.key} className="-mx-3 border-t border-border first:border-t-0">
              {arrivalGrouped && (
                <h3 className="border-b border-border bg-muted px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{group.label}</h3>
              )}
              <div className="divide-y divide-border px-3">
              {group.rows.map((a) => {
                const expanded = arrivalExpandedId === a.id;
                return (
                  <article key={`arrival-mobile-${a.id}`} className="px-1 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openShipmentPreview('arrival', a)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Open purchase ${a.shipment_number}`}
                      >
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{a.supplier_name || a.shipment_number}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono text-brand-primary">{a.shipment_number}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{arrivalWhen(a)}</span>
                        </p>
                      </button>
                      <Badge variant={getStatusVariant(a.status)}>{a.status}</Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {Number(a.total_sqft_qty || 0) > 0 && (
                        <span className="font-semibold text-slate-900 dark:text-slate-100" title={`${Number(a.total_sqft_qty)} Sqft`}>
                          {Number(a.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[11px] text-slate-500">Sqft</span>
                        </span>
                      )}
                      {Number(a.total_bag_qty || 0) > 0 && (
                        <span className="font-semibold text-slate-900 dark:text-slate-100" title={`${Number(a.total_bag_qty)} Bags`}>
                          {Number(a.total_bag_qty)} <span className="text-[11px] text-slate-500">Bags</span>
                        </span>
                      )}
                      {((Number(a.total_whole_qty || 0) > 0 || Number(a.total_broken_qty || 0) > 0) || (Number(a.total_bag_qty || 0) === 0 && Number(a.total_sqft_qty || 0) === 0)) && (
                        <span title={`${Number(a.total_whole_qty || 0)} Whole and ${Number(a.total_broken_qty || 0)} Broken Tiles`}>
                          {Number(a.total_whole_qty || 0)} <span className="text-[11px] text-slate-500 mr-1">Whole</span>
                          {Number(a.total_broken_qty || 0)} <span className="text-[11px] text-slate-500">Broken</span>
                        </span>
                      )}
                      {Number(a.total_qty_sqm || 0) > 0 && (
                        <span className="text-[11px] font-bold text-slate-400" title={`${Number(a.total_qty_sqm).toFixed(2)} Square Meters`}>
                          {Number(a.total_qty_sqm).toFixed(2)} SQM
                        </span>
                      )}
                    </div>
                    {/* Invoice and route share a line; stacked they cost a row each. */}
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{tc.invoice}:</span> {a.invoice_number || '—'}{a.invoice_date ? ` (${formatDateTime(a.invoice_date)})` : ''}
                      <span className="mx-1.5 opacity-40">·</span>
                      {a.origin_city || '—'} → {a.destination_warehouse_name || '—'}
                    </p>
                    {expanded ? (
                      <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <p className="truncate font-medium text-slate-700 dark:text-slate-300">{a.product_names || a.product_skus || '—'}</p>
                        <p><span className="font-semibold">{tc.division}:</span> {a.divisions || tc.general || 'Adhesive'}</p>
                        {a.grand_total ? <p><span className="font-semibold">{tc.grandTotal}:</span> ₹{Number(a.grand_total).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p> : null}
                        {a.freight_weight_kg ? <p><span className="font-semibold">{tc.freight}:</span> {Number(a.freight_weight_kg).toFixed(2)} kg</p> : null}
                        <p><span className="font-semibold">{tc.generatedBy}:</span> {a.generated_by || '—'}</p>
                        {a.approved_by ? <p><span className="font-semibold">{tc.approvedBy}:</span> {a.approved_by}</p> : null}
                      </div>
                    ) : null}
                    {/* Payment state and every action share one wrapping row. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      <span className={`capitalize ${a.payment_status === 'paid' ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {a.payment_status || 'Unpaid'}{a.paid_amount != null ? ` · ₹${Number(a.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''}
                      </span>
                      {canEdit && a.approval_status === 'approved' && a.payment_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setConfirmPaidId(a.id); }}
                          disabled={markingPaidId === a.id}
                          className="rounded-lg border border-emerald-600/30 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
                        >
                          {markingPaidId === a.id ? '…' : 'Mark as Paid'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setArrivalExpandedId((current) => (current === a.id ? null : a.id))}
                        className="ml-auto rounded-lg border border-border px-2 py-1 font-semibold text-muted-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                        aria-label={expanded ? tc.collapse : tc.expand}
                      >
                        {expanded ? tc.collapse : tc.expand}
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="rounded-lg border border-border px-2 py-1 font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            </div>
          ))}
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] flex-1">
          <table className="hidden w-full text-left whitespace-nowrap md:table border-collapse">
            <thead className="sticky top-0 z-20 bg-muted">
              <tr className="border-b border-border">
                {[
                  { id: 'supplier', label: tc.supplier },
                  { id: 'route', label: tc.route },
                  { id: 'payment', label: tc.payment },
                  { id: 'products', label: tc.products },
                  { id: 'quantities', label: tc.quantities, align: 'right' },
                  { id: 'grandTotal', label: tc.grandTotal, align: 'right' },
                  ...(canEdit ? [{ id: 'edit', label: tc.edit, align: 'right' }] : []),
                  { id: 'status', label: t('status') },
                ].map((col) => (
                  <th key={col.id} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => col.id !== 'invoice' && col.id !== 'route' && col.id !== 'payment' && col.id !== 'freight' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? toggleSort(col.id) : undefined}
                      className={`text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 group/th ${col.id !== 'invoice' && col.id !== 'route' && col.id !== 'payment' && col.id !== 'freight' && col.id !== 'edit' && col.id !== 'generatedBy' && col.id !== 'approvedBy' ? 'hover:text-brand-primary' : 'cursor-default transition-all duration-300'}`}
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
            <tbody className="divide-y divide-border">
              {arrivalGroups.map((group) => group.rows.map((a, index) => (
                <Fragment key={a.id}>
                {arrivalGrouped && index === 0 ? (
                  <tr className="bg-muted">
                    <td colSpan={canEdit ? 8 : 7} className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{group.label}</td>
                  </tr>
                ) : null}
                <tr
                  className={`group/row cursor-pointer transition-colors duration-100 hover:bg-muted/60 ${highlightedShipmentKey === `arrival-${a.id}` ? 'bg-primary/10 ring-1 ring-primary/40' : ''}`}
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
                  <td className="px-4 py-2.5">
                    <div className="max-w-[240px] truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={a.supplier_name || ''}>{a.supplier_name || '—'}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title={a.invoice_date ? `${tc.invoice} ${formatDateTime(a.invoice_date)}` : undefined}>
                      <span className="font-mono text-brand-primary group-hover/row:underline underline-offset-2">{a.shipment_number}</span>
                      {a.invoice_number ? <><span aria-hidden="true">·</span><span>{a.invoice_number}</span></> : null}
                      <span aria-hidden="true">·</span><span className="tabular-nums">{arrivalWhen(a)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                    <div className="max-w-[170px] truncate text-sm text-slate-700 dark:text-slate-300" title={`${a.origin_city || '—'} to ${a.destination_warehouse_name || '—'}`}>
                      {a.origin_city || '—'} to {a.destination_warehouse_name || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                    <div className={`capitalize text-xs font-medium ${a.payment_status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>{a.payment_status || 'Unpaid'}</div>
                    {a.paid_amount != null ? <div className="text-xs tabular-nums text-slate-700 dark:text-slate-300">₹{Number(a.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div> : null}
                    {canEdit && a.approval_status === 'approved' && a.payment_status !== 'paid' && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setConfirmPaidId(a.id); }}
                        disabled={markingPaidId === a.id}
                        title="Mark this purchase as fully paid"
                        className="mt-1.5 px-2 py-0.5 rounded-md border border-emerald-600/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {markingPaidId === a.id ? '…' : 'Mark as Paid'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="max-w-[260px] truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={a.product_names || a.product_skus || ''}>{a.product_names || a.product_skus || '—'}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.divisions || tc.general || 'Adhesive'}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {Number(a.total_sqft_qty || 0) > 0 && (
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums" title={`${Number(a.total_sqft_qty)} Sqft`}>
                          {Number(a.total_sqft_qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Sqft</span>
                        </div>
                      )}
                      {Number(a.total_bag_qty || 0) > 0 && (
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums" title={`${Number(a.total_bag_qty)} Bags`}>
                          {Number(a.total_bag_qty)} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Bags</span>
                        </div>
                      )}
                      {((Number(a.total_whole_qty || 0) > 0 || Number(a.total_broken_qty || 0) > 0) || (Number(a.total_bag_qty || 0) === 0 && Number(a.total_sqft_qty || 0) === 0)) && (
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums" title={`${Number(a.total_whole_qty || 0)} Whole and ${Number(a.total_broken_qty || 0)} Broken Tiles`}>
                          {Number(a.total_whole_qty || 0)} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mr-1">Whole</span>
                          <span className="mx-0.5 text-slate-300 dark:text-slate-600">/</span> {Number(a.total_broken_qty || 0)} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Broken</span>
                        </div>
                      )}
                      {Number(a.total_qty_sqm || 0) > 0 && (
                        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5" title={`${Number(a.total_qty_sqm).toFixed(3)} Square Meters`}>
                          {Number(a.total_qty_sqm).toFixed(3)} SQM
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">₹{Number(a.grand_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-muted transition-colors"
                        onClick={e => { e.stopPropagation(); onEdit(a); }}
                      >
                        {tc.edit}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-2.5"><Badge variant={getStatusVariant(a.status)}>{a.status}</Badge></td>
                </tr>
                </Fragment>
              )))}
              {arrivalFetching ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-3 py-10">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-primary" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  </td>
                </tr>
              ) : arrivalPagination.total === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageCheck className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noPurchases}</p>
                      <button
                        type="button"
                        onClick={() => setArrivalSearch('')}
                        className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
        <div className="px-4 py-3 border-t border-border">
          <PaginationControls
            page={arrivalPagination.page}
            pageCount={arrivalPagination.pageCount}
            total={arrivalPagination.total}
            pageSize={pageSize}
            onPageChange={setArrivalPage}
            onPageSizeChange={setPageSize}
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

      <AlertDialog open={!!confirmPaidId} onOpenChange={(open) => { if (!open) setConfirmPaidId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the purchase as fully paid. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmPaidId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleMarkAsPaid(confirmPaidId)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
