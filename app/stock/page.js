'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthUser } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Boxes, CircleAlert, PackageCheck, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import { arrivalFormSchema, dispatchFormSchema } from '@/lib/forms/stock-forms';
import { useStockFormStore } from '@/lib/stores/stock-form-store';
import {
  createArrivalItemRow,
  createDispatchItemRow,
  createInitialArrivalDraft,
  createInitialDispatchDraft,
  fetchDashboardData,
  findMatchingActiveItem,
  getSortedRows,
  matchesQuery,
  normalizeSearchValue,
  toNumber,
  trimText,
  parseSizeLabelSqm,
  round3,
  formatDateTime,
  CLASSES,
} from './lib/stock-utils';
import { StockStatsGrid } from './components/stock-stats-grid';
import { StockItemsTable } from './components/stock-items-table';
import { PurchasesPanel } from './components/purchases-panel';
import { DispatchesPanel } from './components/dispatches-panel';
import { ShipmentPreviewSheet } from './components/shipment-preview-sheet';

export default function StockDashboard() {
  const { language } = useLanguage();
  const t = useCallback(
    (key) => getTranslation(`stock.dashboard.${key}`, language),
    [language]
  );
  
  const tc = useMemo(() => ({
    inventoryHub: t('inventoryHub'),
    stockLedger: t('stockLedger'),
    dispatches: t('dispatches'),
    purchases: t('purchases'),
    filter: t('filter'),
    sort: t('sort'),
    search: t('search'),
    submitting: t('submitting'),
    date: t('date'),
    invoiceDate: t('invoiceDate'),
    transporter: t('transporter'),
    amountInInr: t('amountInInr'),
    invoicePhoto: t('invoicePhoto'),
    invoicePhotoHint: t('invoicePhotoHint'),
    transporterBillPhoto: t('transporterBillPhoto'),
    transporterBillHint: t('transporterBillHint'),
    originCity: t('originCity'),
    destinationWarehouse: t('destinationWarehouse'),
    purchaseBasics: t('purchaseBasics'),
    purchaseBasicsDesc: t('purchaseBasicsDesc'),
    transportInvoice: t('transportInvoice'),
    itemLabel: t('itemLabel'),
    autofilledCatalog: t('autofilledCatalog'),
    newTileEntry: t('newTileEntry'),
    typeTileName: t('typeTileName'),
    wholeBox: t('wholeBox'),
    brokenTiles: t('brokenTiles'),
    orderedSqm: t('orderedSqm'),
    wholeSqm: t('wholeSqm'),
    brokenSqm: t('brokenSqm'),
    catalogIntelligence: t('catalogIntelligence'),
    technicalEntry: t('technicalEntry'),
    brand: t('brand'),
    division: t('division'),
    finish: t('finish'),
    quality: t('quality'),
    width: t('width'),
    length: t('length'),
    mm: t('mm'),
    thickness: t('thickness'),
    description: t('description'),
    ordered: t('ordered'),
    piecesPerBox: t('piecesPerBox'),
    hsn: t('hsn'),
    handlingCost: t('handlingCost'),
    fuelCost: t('fuelCost'),
    gst: t('gst'),
    weightKg: t('weightKg'),
    inventoryHub: t('inventoryHub'),
    assets: t('assets'),
    submitPurchase: t('submitPurchase'),
    submitDispatch: t('submitDispatch'),
    replaceFile: t('replaceFile'),
    chooseFile: t('chooseFile'),
    attachHint: t('attachHint'),
    formSection: t('formSection'),
    controlLabel: t('controlLabel'),
    dispatchBasics: t('dispatchBasics'),
    dispatchBasicsDesc: t('dispatchBasicsDesc'),
    transportAndVehicle: t('transportAndVehicle'),
    shipments: t('shipments'),
    retWhole: t('retWhole'),
    retBrok: t('retBrok'),
    customerPhone: t('customerPhone'),
    salesInvoicePhoto: t('salesInvoicePhoto'),
    salesInvoiceHint: t('salesInvoiceHint'),
    gatepassPhoto: t('gatepassPhoto'),
    gatepassHint: t('gatepassHint'),
    status: t('status'),
    approval: t('approval'),
    driver: t('driver'),
    paymentStatus: t('paymentStatus'),
    totalWhole: t('totalWhole'),
    totalBroken: t('totalBroken'),
    noPreview: t('noPreview'),
    visualVerificationHub: t('visualVerificationHub'),
    intelligenceCase: t('intelligenceCase'),
    linkedDocuments: t('linkedDocuments'),
    itemDetails: t('itemDetails'),
    sku: t('sku'),
    logNewPurchase: t('logNewPurchase'),
    logNewDispatch: t('logNewDispatch'),
    purchaseSheetDesc: t('purchaseSheetDesc'),
    insufficientNewPurchase: t('insufficientNewPurchase')
  }), [t]);

  const { user, isLoading: userLoading } = useAuthUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [suggestions, setSuggestions] = useState({});
  const [arrivalSubmitting, setArrivalSubmitting] = useState(false);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [arrivalNotice, setArrivalNotice] = useState(null);
  const [dispatchNotice, setDispatchNotice] = useState(null);
  const [arrivalSearch, setArrivalSearch] = useState('');
  const [dispatchSearch, setDispatchSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [arrivalSort, setArrivalSort] = useState({ key: 'datetime', direction: 'desc' });
  const [dispatchSort, setDispatchSort] = useState({ key: 'datetime', direction: 'desc' });
  const [stockSort, setStockSort] = useState({ key: 'sku', direction: 'asc' });
  const [activeTableView, setActiveTableView] = useState('dispatches');
  const [processedDeepLink, setProcessedDeepLink] = useState('');
  const [highlightedShipmentKey, setHighlightedShipmentKey] = useState(null);
  const [arrivalExpandedId, setArrivalExpandedId] = useState(null);
  const [dispatchExpandedId, setDispatchExpandedId] = useState(null);
  const [stockPage, setStockPage] = useState(1);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [editingArrivalId, setEditingArrivalId] = useState(null);
  const [editingDispatchId, setEditingDispatchId] = useState(null);
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    loading: false,
    kind: null,
    title: '',
    description: '',
    record: null,
    items: [],
    documents: [],
    error: null,
  });

  const arrivalSheetOpen = useStockFormStore((state) => state.arrivalSheetOpen);
  const dispatchSheetOpen = useStockFormStore((state) => state.dispatchSheetOpen);
  const setArrivalSheetOpen = useStockFormStore((state) => state.setArrivalSheetOpen);
  const setDispatchSheetOpen = useStockFormStore((state) => state.setDispatchSheetOpen);
  const arrivalAttachments = useStockFormStore((state) => state.arrivalAttachments);
  const dispatchAttachments = useStockFormStore((state) => state.dispatchAttachments);
  const setArrivalAttachment = useStockFormStore((state) => state.setArrivalAttachment);
  const setDispatchAttachment = useStockFormStore((state) => state.setDispatchAttachment);
  const resetArrivalAttachments = useStockFormStore((state) => state.resetArrivalAttachments);
  const resetDispatchAttachments = useStockFormStore((state) => state.resetDispatchAttachments);

  const arrivalForm = useForm({
    resolver: zodResolver(arrivalFormSchema),
    defaultValues: createInitialArrivalDraft(),
  });
  const dispatchForm = useForm({
    resolver: zodResolver(dispatchFormSchema),
    defaultValues: createInitialDispatchDraft(),
  });
  const arrivalItemsFieldArray = useFieldArray({ control: arrivalForm.control, name: 'items' });
  const dispatchItemsFieldArray = useFieldArray({ control: dispatchForm.control, name: 'items' });
  const arrivalItems = useWatch({ control: arrivalForm.control, name: 'items' }) || [];

  const canCreateArrival = accessRole !== 'salesperson';

  const refreshDashboard = useCallback(async () => {
    const json = await fetchDashboardData();
    setData(json);
    return json;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setError(null);
      try {
        const json = await fetchDashboardData();
        if (mounted) setData(json);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (userLoading) return () => { mounted = false; };
      if (!user) {
        setLoading(false);
        setError(t('unauthorized'));
        return () => { mounted = false; };
      }

    loadData();

    async function loadSuggestions() {
      try {
        const response = await fetch('/api/stock/form-suggestions', { cache: 'no-store' });
        if (!response.ok) return;
        const json = await response.json();
        if (mounted && json?.suggestions) setSuggestions(json.suggestions);
      } catch { }
    }
    loadSuggestions();

    return () => { mounted = false; };
  }, [user?.id, userLoading]);

  useEffect(() => {
    let mounted = true;

    async function loadAccessRole() {
      if (!user) return;
      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const json = await response.json();
        if (!mounted) return;
        if (response.ok) setAccessRole(String(json.role || 'stock_maintainer'));
      } catch { }
    }

    loadAccessRole();
    return () => { mounted = false; };
  }, [user]);

  async function uploadShipmentDocument({ entityType, entityId, documentType, file, documentNumber, notes }) {
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', String(entityId));
    formData.append('documentType', documentType);
    if (documentNumber) formData.append('documentNumber', documentNumber);
    if (notes) formData.append('notes', notes);

    const response = await fetch('/api/stock/documents', { method: 'POST', body: formData });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || json.detail || `Failed to upload ${documentType}`);
    return json.document;
  }

  const closePreview = useCallback(() => {
    setPreviewState((current) => ({ ...current, open: false }));
  }, []);

  const openShipmentPreview = useCallback(async (kind, row) => {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;
    setPreviewItemsPage(1);

      setPreviewState({
        open: true,
        loading: true,
        kind,
        title: `${kind === 'arrival' ? (language === 'hi' ? 'खरीद' : 'Purchase') : (language === 'hi' ? 'डिस्पैच' : 'Dispatch')} ${row.shipment_number}`,
        description: '',
      record: row,
      items: [],
      documents: [],
      error: null,
    });

    try {
      const [shipmentResponse, documentsResponse] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${row.id}&limit=20`, { cache: 'no-store' }),
      ]);

      const shipmentJson = await shipmentResponse.json();
      const documentsJson = await documentsResponse.json();

      if (!shipmentResponse.ok) throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      if (!documentsResponse.ok) throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? (language === 'hi' ? 'खरीद' : 'Purchase') : (language === 'hi' ? 'डिस्पैच' : 'Dispatch')} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? t('inboundPreviewDesc') : t('outboundPreviewDesc'),
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (fetchError) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? (language === 'hi' ? 'खरीद' : 'Purchase') : (language === 'hi' ? 'डिस्पैच' : 'Dispatch')} ${row.shipment_number}`,
        description: t('unableToLoadDetails'),
        record: row,
        items: [],
        documents: [],
        error: fetchError.message,
      });
    }
  }, []);

  const openStockItemPreview = useCallback((item) => {
    setPreviewItemsPage(1);
    setPreviewState({
      open: true,
      loading: false,
      kind: 'stock',
      title: `${item.sku} • ${item.name}`,
      description: t('currentStockDesc'),
      record: item,
      items: [],
      documents: [],
      error: null,
    });
  }, []);

  const autoPopulateArrivalItem = useCallback((index, matchedItem) => {
    const item = arrivalForm.getValues(`items.${index}`);
    arrivalForm.setValue(`items.${index}`, {
      ...item,
      itemId: String(matchedItem.id),
      itemName: matchedItem.name || item.itemName,
      brandName: matchedItem.brand_name || item.brandName,
      divisionName: matchedItem.division_name || matchedItem.department || item.divisionName,
      finish: matchedItem.finish || item.finish,
      grade: matchedItem.grade || item.grade,
      sizeLabel: matchedItem.size_label || item.sizeLabel,
      sizeWidthMm: matchedItem.width_mm != null ? String(matchedItem.width_mm) : item.sizeWidthMm,
      sizeLengthMm: matchedItem.length_mm != null ? String(matchedItem.length_mm) : item.sizeLengthMm,
      sizeUnit: matchedItem.size_unit || item.sizeUnit || 'mm',
      thicknessMm: matchedItem.thickness_mm != null ? String(matchedItem.thickness_mm) : item.thicknessMm,
      piecesPerBox: matchedItem.pieces_per_box != null ? String(matchedItem.pieces_per_box) : item.piecesPerBox,
      reorderLevel: matchedItem.reorder_level != null ? String(matchedItem.reorder_level) : item.reorderLevel,
      description: matchedItem.description || item.description,
      hsnCode: matchedItem.hsn_code || item.hsnCode,
      costPerSqm: matchedItem.cost_per_sqm != null ? String(matchedItem.cost_per_sqm) : item.costPerSqm,
    }, { shouldDirty: true, shouldValidate: true });
  }, [arrivalForm]);

  const handleArrivalItemNameChange = useCallback((index, value) => {
    arrivalForm.setValue(`items.${index}.itemName`, value, { shouldDirty: true, shouldValidate: true });
    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }
    arrivalForm.setValue(`items.${index}.itemId`, '', { shouldDirty: true, shouldValidate: true });
  }, [arrivalForm, data?.activeItems, autoPopulateArrivalItem]);

  const addArrivalItemRow = useCallback(() => { arrivalItemsFieldArray.append(createArrivalItemRow()); }, [arrivalItemsFieldArray]);
  const addDispatchItemRow = useCallback(() => { dispatchItemsFieldArray.append(createDispatchItemRow()); }, [dispatchItemsFieldArray]);

  const handleArrivalSubmit = useCallback(async (values) => {
    setArrivalNotice(null);
    setArrivalSubmitting(true);

    if (!canCreateArrival) {
      setArrivalNotice({ type: 'warning', message: t('insufficientNewPurchase') });
      setArrivalSubmitting(false);
      return;
    }

    try {
      const items = values.items
        .map((item) => {
          const piecesPerBox = toNumber(item.piecesPerBox);
          const wholeQty = toNumber(item.wholeQty);
          const brokenQty = toNumber(item.brokenQty);
          const orderedBoxes = item.orderedBoxes === '' ? null : toNumber(item.orderedBoxes);
          const widthMm = item.sizeWidthMm === '' ? null : toNumber(item.sizeWidthMm);
          const lengthMm = item.sizeLengthMm === '' ? null : toNumber(item.sizeLengthMm);
          const composedSizeLabel = widthMm && lengthMm ? `${widthMm}x${lengthMm}` : trimText(item.sizeLabel);
          const sizeSqm = parseSizeLabelSqm(composedSizeLabel);
          const sqmPerBox = sizeSqm && piecesPerBox > 0 ? sizeSqm * piecesPerBox : null;
          const inferredQtySqm = sqmPerBox != null ? round3((wholeQty + brokenQty) * sqmPerBox) : null;
          const qtySqm = item.qtySqm === '' ? inferredQtySqm : toNumber(item.qtySqm);
          const costPerSqm = item.costPerSqm === '' ? null : toNumber(item.costPerSqm);
          const unitPrice = costPerSqm != null && qtySqm != null ? Number((costPerSqm * qtySqm).toFixed(2)) : 0;

          return {
            itemId: trimText(item.itemId),
            itemName: trimText(item.itemName),
            brandName: trimText(item.brandName),
            divisionName: trimText(item.divisionName),
            finish: trimText(item.finish),
            grade: trimText(item.grade),
            sizeLabel: composedSizeLabel,
            sizeUnit: trimText(item.sizeUnit) || 'mm',
            widthMm,
            lengthMm,
            hsnCode: trimText(item.hsnCode),
            thicknessMm: item.thicknessMm === '' ? null : toNumber(item.thicknessMm),
            piecesPerBox,
            reorderLevel: toNumber(item.reorderLevel),
            description: trimText(item.description),
            orderedBoxes,
            wholeQty,
            brokenQty,
            qtySqm,
            costPerSqm,
            unitPrice,
            notes: trimText(item.notes),
          };
        })
        .filter((item) => item.itemId || item.itemName || item.wholeQty > 0 || item.brokenQty > 0 || item.notes);

      if (items.length === 0) throw new Error(t('addOneItem'));
      if (items.some((item) => !item.itemId && (!item.itemName || !item.brandName || !item.sizeLabel))) throw new Error(t('existingTileError'));
      if (items.some((item) => item.wholeQty === 0 && item.brokenQty === 0)) throw new Error(t('qtyError'));

      const endpoint = editingArrivalId
        ? `/api/stock/inbound-shipments/${editingArrivalId}`
        : '/api/stock/inbound-shipments';

      const response = await fetch(endpoint, {
        method: editingArrivalId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingArrivalId ? 'update' : undefined,
          purchaseNumber: trimText(values.shipmentNumber) || undefined,
          purchaseDate: values.invoiceDate || undefined,
          shipmentNumber: trimText(values.shipmentNumber) || undefined,
          supplierName: trimText(values.supplierName) || undefined,
          truckLicensePlate: trimText(values.truckLicensePlate) || undefined,
          truckNumber: trimText(values.truckLicensePlate) || undefined,
          driverName: trimText(values.driverName) || undefined,
          invoiceNumber: trimText(values.invoiceNumber) || undefined,
          invoiceDate: values.invoiceDate || undefined,
          originCity: trimText(values.originCity) || undefined,
          destinationWarehouseName: trimText(values.destinationWarehouseName) || undefined,
          paymentStatus: trimText(values.paymentStatus) || 'unpaid',
          paidAmount: values.paidAmount === '' ? undefined : toNumber(values.paidAmount),
          paymentDate: values.paymentDate || undefined,
          paymentReference: trimText(values.paymentReference) || undefined,
          paymentMode: trimText(values.paymentMode) || undefined,
          transporterName: trimText(values.transporterName) || undefined,
          deliveryCost: toNumber(values.transportCost),
          unloadingLabourCost: toNumber(values.laborCost),
          handlingCostPercent: values.handlingCostPercent === '' ? undefined : toNumber(values.handlingCostPercent),
          fuelCostPercent: values.fuelCostPercent === '' ? undefined : toNumber(values.fuelCostPercent),
          gstPercent: values.gstPercent === '' ? undefined : toNumber(values.gstPercent),
          freightWeightKg: values.freightWeightKg === '' ? undefined : toNumber(values.freightWeightKg),
          notes: trimText(values.notes) || undefined,
          items: items.map((item) => ({
            itemId: item.itemId ? Number(item.itemId) : undefined,
            itemName: item.itemName || undefined,
            brandName: item.brandName || undefined,
            divisionName: item.divisionName || undefined,
            department: item.divisionName || item.brandName || undefined,
            finish: item.finish || undefined,
            grade: item.grade || undefined,
            sizeLabel: item.sizeLabel || undefined,
            sizeUnit: item.sizeUnit || undefined,
            widthMm: item.widthMm ?? undefined,
            lengthMm: item.lengthMm ?? undefined,
            hsnCode: item.hsnCode || undefined,
            thicknessMm: item.thicknessMm ?? undefined,
            piecesPerBox: item.piecesPerBox || undefined,
            reorderLevel: item.reorderLevel || undefined,
            description: item.description || undefined,
            orderedBoxes: item.orderedBoxes || undefined,
            qtySqm: item.qtySqm ?? undefined,
            costPerSqm: item.costPerSqm ?? undefined,
            unitPrice: item.unitPrice || undefined,
            wholeQty: item.wholeQty,
            brokenQty: item.brokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || json.detail || 'Failed to submit purchase');

      arrivalForm.reset(createInitialArrivalDraft());
      resetArrivalAttachments();
      setArrivalSheetOpen(false);
      const arrivalSuccessMsg = editingArrivalId
        ? `${language === 'hi' ? 'खरीद' : 'Purchase'} ${json.shipment?.shipment_number || ''} ${language === 'hi' ? 'अपडेट किया गया।' : 'updated.'}`
        : `${language === 'hi' ? 'खरीद' : 'Purchase'} ${json.shipment?.shipment_number || ''} ${t('sentForReview')}`;
      setArrivalNotice({ type: 'success', message: arrivalSuccessMsg });
      setEditingArrivalId(null);

      try {
        const linkedInvoice = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'purchase_invoice',
          file: arrivalAttachments.purchaseInvoice,
          documentNumber: trimText(values.invoiceNumber) || undefined,
          notes: trimText(values.notes) || undefined,
        });
        if (linkedInvoice) setArrivalNotice({ type: 'success', message: `${language === 'hi' ? 'खरीद' : 'Purchase'} ${json.shipment?.shipment_number || ''} ${t('sentForReview')} ${language === 'hi' ? 'और इनवॉइस जोड़ा गया।' : 'and invoice attached.'}` });

        const linkedBill = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'transporter_bill',
          file: arrivalAttachments.transporterBill,
          documentNumber: trimText(values.invoiceNumber) || undefined,
          notes: trimText(values.notes) || undefined,
        });
        if (linkedBill) setArrivalNotice({ type: 'success', message: `${language === 'hi' ? 'खरीद' : 'Purchase'} ${json.shipment?.shipment_number || ''} ${t('sentForReview')} ${language === 'hi' ? 'और दस्तावेज़ जोड़े गए।' : 'and documents attached.'}` });
      } catch (uploadError) {
        setArrivalNotice({ type: 'warning', message: `${t('docUploadFailed')} ${uploadError.message}` });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setArrivalNotice({ type: 'warning', message: `${t('refreshFailed')} ${refreshError.message}` });
      }
    } catch (submitError) {
      setArrivalNotice({ type: 'error', message: submitError.message });
    } finally {
      setArrivalSubmitting(false);
    }
  }, [canCreateArrival, arrivalForm, arrivalAttachments, resetArrivalAttachments, setArrivalSheetOpen, refreshDashboard]);

  const handleNewArrival = useCallback(() => {
    setEditingArrivalId(null);
    arrivalForm.reset(createInitialArrivalDraft());
    setArrivalNotice(null);
    setArrivalSheetOpen(true);
  }, [arrivalForm, setArrivalSheetOpen]);

  const handleEditArrival = useCallback(async (row) => {
    setArrivalNotice({ type: 'info', message: t('loadingPurchaseDetails') });
    setArrivalSheetOpen(true);
    setEditingArrivalId(row.id);

    try {
      const response = await fetch(`/api/stock/inbound-shipments/${row.id}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load purchase details');

      const s = json.shipment;
      const items = json.items || [];

      arrivalForm.reset({
        shipmentNumber: s.shipment_number || '',
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
        items: items.length > 0 ? items.map(item => ({
          itemId: String(item.item_id),
          itemName: item.item_name || '',
          brandName: item.brand_name || '',
          divisionName: item.division_name || '',
          finish: item.finish || '',
          grade: item.grade || '',
          sizeLabel: item.size_label || '',
          sizeWidthMm: '',
          sizeLengthMm: '',
          sizeUnit: item.size_unit || 'mm',
          hsnCode: item.hsn_code || '',
          thicknessMm: item.thickness_mm != null ? String(item.thickness_mm) : '',
          piecesPerBox: item.pieces_per_box != null ? String(item.pieces_per_box) : '',
          reorderLevel: '',
          description: item.description || '',
          orderedBoxes: item.ordered_qty != null ? String(item.ordered_qty) : '',
          wholeQty: String(item.received_whole_qty ?? 0),
          brokenQty: String(item.received_broken_qty ?? 0),
          costPerSqm: item.cost_per_sqm != null ? String(item.cost_per_sqm) : '',
          qtySqm: item.qty_sqm != null ? String(item.qty_sqm) : '',
          notes: item.notes || '',
        })) : [createArrivalItemRow()],
      });
      setArrivalNotice(null);
    } catch (err) {
      setArrivalNotice({ type: 'error', message: err.message });
    }
  }, [arrivalForm, setArrivalSheetOpen]);

  const handleNewDispatch = useCallback(() => {
    setEditingDispatchId(null);
    dispatchForm.reset(createInitialDispatchDraft());
    setDispatchNotice(null);
    setDispatchSheetOpen(true);
  }, [dispatchForm, setDispatchSheetOpen]);

  const handleEditDispatch = useCallback(async (row) => {
    setDispatchNotice({ type: 'info', message: t('loadingDispatchDetails') });
    setDispatchSheetOpen(true);
    setEditingDispatchId(row.id);

    try {
      const response = await fetch(`/api/stock/outbound-shipments/${row.id}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load dispatch details');

      const shipment = json.shipment;
      const items = json.items || [];

      dispatchForm.reset({
        shipmentNumber: shipment.shipment_number || '',
        customerName: shipment.customer_name || '',
        customerPhoneNumber: shipment.customer_phone_number || '',
        truckLicensePlate: shipment.truck_license_plate_snapshot || shipment.truck_number_snapshot || '',
        driverName: shipment.driver_name_snapshot || '',
        invoiceNumber: shipment.invoice_number || '',
        salespersonName: shipment.salesperson_name || '',
        dispatchDate: (shipment.dispatch_date || shipment.created_at) ? (() => {
          const d = new Date(shipment.dispatch_date || shipment.created_at);
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })() : '',
        transportCost: shipment.transport_cost ?? '',
        laborCost: shipment.loading_labour_cost ?? '',
        notes: shipment.notes || '',
        items: items.map(item => ({
          itemId: String(item.item_id),
          loadedWholeQty: String(item.loaded_whole_qty ?? 0),
          notes: item.notes || '',
          returnWholeQty: item.returned_whole_qty != null ? String(item.returned_whole_qty) : '',
          returnBrokenQty: item.returned_broken_qty != null ? String(item.returned_broken_qty) : '',
        })),
      });
      setDispatchNotice(null);
    } catch (err) {
      setDispatchNotice({ type: 'error', message: err.message });
    }
  }, [dispatchForm, setDispatchSheetOpen]);

  const handleDispatchSubmit = useCallback(async (values) => {
    setDispatchNotice(null);
    setDispatchSubmitting(true);

    try {
      const customerName = trimText(values.customerName);
      if (!customerName) throw new Error('Customer name is required.');

      const items = values.items
        .map((item) => ({
          itemId: trimText(item.itemId),
          loadedWholeQty: toNumber(item.loadedWholeQty),
          returnWholeQty: item.returnWholeQty === '' ? null : toNumber(item.returnWholeQty),
          returnBrokenQty: item.returnBrokenQty === '' ? null : toNumber(item.returnBrokenQty),
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.loadedWholeQty > 0 || (item.returnWholeQty != null && item.returnWholeQty > 0) || (item.returnBrokenQty != null && item.returnBrokenQty > 0) || item.notes);

      if (items.length === 0) throw new Error(t('addOneItem'));
      if (items.some((item) => !item.itemId)) throw new Error(t('selectItem'));

      const payload = {
        shipmentNumber: trimText(values.shipmentNumber) || undefined,
        customerName,
        customerPhoneNumber: trimText(values.customerPhoneNumber) || undefined,
        truckLicensePlate: trimText(values.truckLicensePlate) || undefined,
        truckNumber: trimText(values.truckLicensePlate) || undefined,
        driverName: trimText(values.driverName) || undefined,
        invoiceNumber: trimText(values.invoiceNumber) || undefined,
        salespersonName: trimText(values.salespersonName) || undefined,
        dispatchDate: values.dispatchDate || undefined,
        transportCost: toNumber(values.transportCost),
        loadingLabourCost: toNumber(values.laborCost),
        notes: trimText(values.notes) || undefined,
        items: items.map((item) => ({
          itemId: Number(item.itemId),
          loadedWholeQty: item.loadedWholeQty,
          returnWholeQty: item.returnWholeQty,
          returnBrokenQty: item.returnBrokenQty,
          notes: item.notes || undefined,
        })),
      };

      const endpoint = editingDispatchId
        ? `/api/stock/outbound-shipments/${editingDispatchId}`
        : '/api/stock/outbound-shipments';

      const response = await fetch(endpoint, {
        method: editingDispatchId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDispatchId ? { ...payload, action: 'update' } : payload),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || json.detail || 'Failed to submit dispatch');

      dispatchForm.reset(createInitialDispatchDraft());
      resetDispatchAttachments();
      setDispatchSheetOpen(false);
      const successMsg = editingDispatchId ? `${language === 'hi' ? 'डिस्पैच' : 'Dispatch'} ${json.shipment?.shipment_number || ''} ${language === 'hi' ? 'अपडेट किया गया।' : 'updated.'}` : `${language === 'hi' ? 'डिस्पैच' : 'Dispatch'} ${json.shipment?.shipment_number || ''} ${t('sentForReview')}`;
      setDispatchNotice({ type: 'success', message: successMsg });
      setEditingDispatchId(null);

      try {
        await uploadShipmentDocument({ entityType: 'outbound_shipment', entityId: json.shipment?.id, documentType: 'sales_invoice', file: dispatchAttachments.salesInvoice, documentNumber: trimText(values.invoiceNumber) || undefined, notes: trimText(values.notes) || undefined });
        await uploadShipmentDocument({ entityType: 'outbound_shipment', entityId: json.shipment?.id, documentType: 'gatepass', file: dispatchAttachments.gatepass, documentNumber: trimText(values.shipmentNumber) || undefined, notes: trimText(values.notes) || undefined });
      } catch (uploadError) {
        setDispatchNotice({ type: 'warning', message: `${t('docUploadFailed')} ${uploadError.message}` });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setDispatchNotice({ type: 'warning', message: `${t('refreshFailed')} ${refreshError.message}` });
      }
    } catch (submitError) {
      setDispatchNotice({ type: 'error', message: submitError.message });
    } finally {
      setDispatchSubmitting(false);
    }
  }, [dispatchForm, dispatchAttachments, resetDispatchAttachments, setDispatchSheetOpen, refreshDashboard, editingDispatchId]);

  const handleArrivalInvalid = useCallback(() => {
    setArrivalNotice({ type: 'error', message: t('fixPurchaseFields') });
  }, [t]);

  const handleDispatchInvalid = useCallback(() => {
    setDispatchNotice({ type: 'error', message: t('fixDispatchFields') });
  }, [t]);

  const tableViewTabs = [
    { id: 'dispatches', label: t('dispatches') },
    { id: 'purchases', label: t('purchases') },
    { id: 'items', label: t('currentStock') },
  ];

  const purchaseSourceRows = data?.recentPurchases || data?.recentArrivals || [];

  const arrivalRows = useMemo(() => getSortedRows(
    purchaseSourceRows.filter((shipment) => {
      const query = normalizeSearchValue(arrivalSearch);
      if (!query) return true;
      return [shipment.shipment_number, shipment.status, shipment.generated_by, shipment.approved_by, formatDateTime(shipment.arrival_date), shipment.truck_license_plate, shipment.driver_name, shipment.product_names, shipment.product_skus, shipment.total_whole_qty, shipment.total_broken_qty].some((value) => matchesQuery(value, query));
    }),
    arrivalSort,
    {
      datetime: (s) => new Date(s.arrival_date || s.created_at || 0).getTime(),
      shipment: (s) => s.shipment_number || '',
      products: (s) => s.product_names || '',
      quantities: (s) => Number(s.total_whole_qty || 0) + Number(s.total_broken_qty || 0),
      status: (s) => s.status || '',
    }
  ), [purchaseSourceRows, arrivalSearch, arrivalSort]);

  const dispatchRows = useMemo(() => getSortedRows(
    (data?.recentDispatches || []).filter((shipment) => {
      const query = normalizeSearchValue(dispatchSearch);
      if (!query) return true;
      return [shipment.shipment_number, shipment.status, shipment.generated_by, shipment.approved_by, formatDateTime(shipment.dispatch_date), shipment.truck_license_plate, shipment.driver_name, shipment.product_names, shipment.product_skus, shipment.total_whole_qty, shipment.total_broken_qty].some((value) => matchesQuery(value, query));
    }),
    dispatchSort,
    {
      datetime: (s) => new Date(s.dispatch_date || s.created_at || 0).getTime(),
      shipment: (s) => s.shipment_number || '',
      products: (s) => s.product_names || '',
      quantities: (s) => Number(s.total_whole_qty || 0) + Number(s.total_broken_qty || 0),
      status: (s) => s.status || '',
    }
  ), [data?.recentDispatches, dispatchSearch, dispatchSort]);

  const stockRows = useMemo(() => getSortedRows(
    (data?.activeItems || []).filter((item) => {
      const query = normalizeSearchValue(stockSearch);
      if (!query) return true;
      return [item.sku, item.name, item.size_label, item.current_whole_qty, item.current_broken_qty, item.reorder_level].some((value) => matchesQuery(value, query));
    }),
    stockSort,
    {
      sku: (item) => item.sku || '',
      name: (item) => item.name || '',
      size: (item) => item.size_label || '',
      whole: (item) => Number(item.current_whole_qty || 0),
      broken: (item) => Number(item.current_broken_qty || 0),
      reorder: (item) => Number(item.reorder_level || 0),
    }
  ), [data?.activeItems, stockSearch, stockSort]);

  const stockPagination = useMemo(() => paginateRows(stockRows, stockPage, DEFAULT_PAGE_SIZE), [stockRows, stockPage]);
  const arrivalPagination = useMemo(() => paginateRows(arrivalRows, arrivalPage, DEFAULT_PAGE_SIZE), [arrivalRows, arrivalPage]);
  const dispatchPagination = useMemo(() => paginateRows(dispatchRows, dispatchPage, DEFAULT_PAGE_SIZE), [dispatchRows, dispatchPage]);
  const previewItemPagination = useMemo(() => paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE), [previewState.items, previewItemsPage]);

  useEffect(() => { setStockPage((p) => Math.min(p, stockPagination.pageCount)); }, [stockPagination.pageCount]);
  useEffect(() => { setArrivalPage((p) => Math.min(p, arrivalPagination.pageCount)); }, [arrivalPagination.pageCount]);
  useEffect(() => { setDispatchPage((p) => Math.min(p, dispatchPagination.pageCount)); }, [dispatchPagination.pageCount]);
  useEffect(() => { setPreviewItemsPage((p) => Math.min(p, previewItemPagination.pageCount)); }, [previewItemPagination.pageCount]);

  useEffect(() => {
    if (!data) return;
    const view = searchParams.get('view');
    const entityType = searchParams.get('entityType');
    const entityIdRaw = searchParams.get('entityId');
    const entityId = Number(entityIdRaw);

    if (view === 'items' || view === 'arrivals' || view === 'purchases' || view === 'dispatches') {
      setActiveTableView(view === 'arrivals' ? 'purchases' : view);
    }

    if (!entityType || !entityId || Number.isNaN(entityId)) return;

    const deepLinkKey = `${entityType}:${entityId}`;
    if (processedDeepLink === deepLinkKey) return;

    if (entityType === 'inbound_shipment') {
      const target = (data.recentPurchases || data.recentArrivals || []).find((item) => Number(item.id) === entityId);
      setActiveTableView('purchases');
      setHighlightedShipmentKey(`arrival-${entityId}`);
      openShipmentPreview('arrival', target || { id: entityId, shipment_number: `INB-${entityId}` });
      setProcessedDeepLink(deepLinkKey);
      return;
    }

    if (entityType === 'outbound_shipment') {
      const target = (data.recentDispatches || []).find((item) => Number(item.id) === entityId);
      setActiveTableView('dispatches');
      setHighlightedShipmentKey(`dispatch-${entityId}`);
      openShipmentPreview('dispatch', target || { id: entityId, shipment_number: `OUT-${entityId}` });
      setProcessedDeepLink(deepLinkKey);
    }
  }, [data, processedDeepLink, searchParams]);

  useEffect(() => {
    const requestedNewForm = searchParams.get('new');
    if (!requestedNewForm) return;

    if (requestedNewForm === 'purchase') {
      setActiveTableView('purchases');
      setDispatchSheetOpen(false);
      setArrivalSheetOpen(true);
    } else if (requestedNewForm === 'dispatch') {
      setActiveTableView('dispatches');
      setEditingDispatchId(null);
      setArrivalSheetOpen(false);
      setDispatchSheetOpen(true);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/stock?${nextQuery}` : '/stock');
  }, [router, searchParams]);

  useEffect(() => {
    if (!highlightedShipmentKey) return;
    const timeoutId = setTimeout(() => setHighlightedShipmentKey(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [highlightedShipmentKey]);

  const { totalWholeStock, totalBrokenStock, totalStockUnits, pendingArrivals, pendingDispatches, riskItems } = useMemo(() => {
    const whole = (data?.activeItems || []).reduce((sum, item) => sum + Number(item.current_whole_qty || 0), 0);
    const broken = (data?.activeItems || []).reduce((sum, item) => sum + Number(item.current_broken_qty || 0), 0);
    const total = whole + broken;
    const pending = (data?.recentPurchases || data?.recentArrivals || []).filter((item) => String(item.status || '').toLowerCase().includes('pending')).length;
    const dispatchPending = (data?.recentDispatches || []).filter((item) => String(item.status || '').toLowerCase().includes('pending')).length;
    const risk = (data?.activeItems || []).filter((item) => Number(item.reorder_level || 0) > 0 && (Number(item.current_whole_qty || 0) + Number(item.current_broken_qty || 0)) <= Number(item.reorder_level || 0)).length;
    return { totalWholeStock: whole, totalBrokenStock: broken, totalStockUnits: total, pendingArrivals: pending, pendingDispatches: dispatchPending, riskItems: risk };
  }, [data?.activeItems, data?.recentPurchases, data?.recentArrivals, data?.recentDispatches]);

  const stockStats = useMemo(() => [
    { label: t('totalStock'), value: totalStockUnits, trend: totalStockUnits ? Math.round((totalWholeStock / totalStockUnits) * 100) : 0, trendLabel: t('wholeRatio'), icon: Boxes, accent: 'from-[#E07A00]/20 to-[#E07A00]/5', isNeutral: true },
    { label: t('pendingPurchases'), value: pendingArrivals, trend: pendingArrivals === 0 ? 100 : -Math.min(pendingArrivals * 10, 100), trendLabel: t('queueHealth'), icon: PackageCheck, accent: 'from-[#1A1A54]/25 to-[#1A1A54]/10', isNeutral: true },
    { label: t('pendingDispatches'), value: pendingDispatches, trend: pendingDispatches === 0 ? 100 : -Math.min(pendingDispatches * 10, 100), trendLabel: t('dispatchReadiness'), icon: BarChart3, accent: 'from-[#F59E0B]/25 to-[#F59E0B]/10', isNeutral: true },
    { label: t('reorderRisks'), value: riskItems, trend: riskItems === 0 ? 100 : -Math.min(riskItems * 12, 100), trendLabel: t('safetyScore'), icon: CircleAlert, accent: 'from-[#1A1A54]/20 to-[#E07A00]/15', isAlert: riskItems > 0 },
  ], [totalStockUnits, totalWholeStock, pendingArrivals, pendingDispatches, riskItems, t]);

  const stockPaginationWithPage = useMemo(() => ({ ...stockPagination, setPage: setStockPage }), [stockPagination]);

  if (loading) {
    return (
      <div className="space-y-12 p-4 sm:p-6 lg:p-12 animate-pulse">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-16 sm:h-20 w-full sm:w-3/4 max-w-lg bg-slate-200 dark:bg-slate-800 rounded-2xl sm:rounded-[2.5rem]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`op-stat-skeleton-${index}`} className="h-40 rounded-3xl sm:rounded-[2rem] bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
        <div className="h-96 rounded-3xl sm:rounded-[2.5rem] bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-12 space-y-10 lg:space-y-16 animate-fade-in font-sans selection:bg-brand-primary/20 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
        <div className="space-y-4 max-w-4xl">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
            <span className="text-slate-400">{t('inventory')}</span>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white uppercase tracking-[0.3em]">{t('operationalNode')}</span>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              {language === 'hi' ? t('stockControl') : <><span className="text-brand-primary">Stock</span><br className="sm:hidden" /> Control</>}
            </h1>
            <div className="flex items-center self-start sm:self-center gap-3 px-5 py-2 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-black uppercase tracking-widest border border-orange-500/20 shadow-sm whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
              {t('realTimeFlow')}
            </div>
          </div>
          <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            {t('stockSubtitle')}
          </p>
        </div>
      </header>


      <div className="rounded-[1.75rem] border border-slate-200/60 bg-slate-100/30 p-1.5 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/30">
        <div className="flex items-center gap-1">
          {tableViewTabs.map((tab) => {
            const isActive = activeTableView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTableView(tab.id)}
                className={`flex-1 px-3 sm:px-6 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-2xl transition-all duration-500 ${isActive
                  ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-xl scale-[1.02] orange-glow'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTableView === 'items' && (
        <div className="space-y-6">
          <StockStatsGrid stats={stockStats} language={language} t={t} />
          <StockItemsTable
            pagination={stockPaginationWithPage}
            sort={stockSort}
            setSort={setStockSort}
            search={stockSearch}
            setSearch={setStockSearch}
            openPreview={openStockItemPreview}
            t={t}
            tc={tc}
          />
        </div>
      )}

      {activeTableView === 'purchases' && (
        <PurchasesPanel
          arrivalForm={arrivalForm}
          arrivalItemsFieldArray={arrivalItemsFieldArray}
          arrivalWatchedItems={arrivalItems}
          arrivalSheetOpen={arrivalSheetOpen}
          setArrivalSheetOpen={setArrivalSheetOpen}
          arrivalAttachments={arrivalAttachments}
          setArrivalAttachment={setArrivalAttachment}
          arrivalNotice={arrivalNotice}
          arrivalSubmitting={arrivalSubmitting}
          arrivalSearch={arrivalSearch}
          setArrivalSearch={setArrivalSearch}
          arrivalSort={arrivalSort}
          setArrivalSort={setArrivalSort}
          arrivalPagination={arrivalPagination}
          setArrivalPage={setArrivalPage}
          arrivalExpandedId={arrivalExpandedId}
          setArrivalExpandedId={setArrivalExpandedId}
          highlightedShipmentKey={highlightedShipmentKey}
          canCreateArrival={canCreateArrival}
          handleArrivalSubmit={handleArrivalSubmit}
          handleArrivalInvalid={handleArrivalInvalid}
          openShipmentPreview={openShipmentPreview}
          onAddArrivalItem={addArrivalItemRow}
          onArrivalItemNameChange={handleArrivalItemNameChange}
          suggestions={suggestions}
          activeItems={data?.activeItems}
          t={t}
          tc={tc}
          language={language}
          userRole={accessRole}
          onNewArrival={handleNewArrival}
          onEdit={handleEditArrival}
        />
      )}

      {activeTableView === 'dispatches' && (
        <DispatchesPanel
          dispatchForm={dispatchForm}
          dispatchItemsFieldArray={dispatchItemsFieldArray}
          dispatchSheetOpen={dispatchSheetOpen}
          setDispatchSheetOpen={setDispatchSheetOpen}
          dispatchAttachments={dispatchAttachments}
          setDispatchAttachment={setDispatchAttachment}
          dispatchNotice={dispatchNotice}
          dispatchSubmitting={dispatchSubmitting}
          dispatchSearch={dispatchSearch}
          setDispatchSearch={setDispatchSearch}
          dispatchSort={dispatchSort}
          setDispatchSort={setDispatchSort}
          dispatchPagination={dispatchPagination}
          setDispatchPage={setDispatchPage}
          dispatchExpandedId={dispatchExpandedId}
          setDispatchExpandedId={setDispatchExpandedId}
          highlightedShipmentKey={highlightedShipmentKey}
          handleDispatchSubmit={handleDispatchSubmit}
          handleDispatchInvalid={handleDispatchInvalid}
          openShipmentPreview={openShipmentPreview}
          onAddDispatchItem={addDispatchItemRow}
          activeItems={data?.activeItems}
          t={t}
          tc={tc}
          language={language}
          userRole={accessRole}
          onNewDispatch={handleNewDispatch}
          onEdit={handleEditDispatch}
        />
      )}

      <ShipmentPreviewSheet
        previewState={previewState}
        closePreview={closePreview}
        previewItemPagination={previewItemPagination}
        setPreviewItemsPage={setPreviewItemsPage}
        t={t}
        tc={tc}
      />
    </div>
  );
}
