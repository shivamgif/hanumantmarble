'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import PaginationControls from '@/components/ui/pagination-controls';

function createArrivalItemRow() {
  return {
    itemId: '',
    sku: '',
    itemName: '',
    brandName: '',
    typeName: '',
    sizeLabel: '',
    sizeUnit: 'mm',
    tilesPerBox: '',
    piecesPerBox: '',
    reorderLevel: '',
    description: '',
    wholeQty: '0',
    brokenQty: '0',
    notes: '',
  };
}

function createDispatchItemRow() {
  return {
    itemId: '',
    loadedWholeQty: '0',
    loadedBrokenQty: '0',
    notes: '',
  };
}

function createInitialArrivalDraft() {
  return {
    shipmentNumber: '',
    supplierName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createArrivalItemRow()],
  };
}

function createInitialDispatchDraft() {
  return {
    shipmentNumber: '',
    customerName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createDispatchItemRow()],
  };
}

function createInitialAttachmentState() {
  return {
    purchaseInvoice: null,
    transporterBill: null,
    salesInvoice: null,
    gatepass: null,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimText(value) {
  return String(value ?? '').trim();
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatChartDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/75';
const FORM_INPUT_CLASS = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';
const FORM_CARD_CLASS = 'rounded-2xl border border-border/80 bg-muted/20 p-4';

function renderDocumentPreview(document) {
  if (!document?.file_url) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No preview available.
      </div>
    );
  }

  if (document.mime_type?.startsWith('image/')) {
    return (
      <img
        src={document.file_url}
        alt={document.file_name || 'Document preview'}
        className="max-h-80 w-full rounded-2xl border border-slate-200 object-contain bg-black/5"
      />
    );
  }

  return (
    <iframe
      src={document.file_url}
      title={document.file_name || 'Document preview'}
      className="h-80 w-full rounded-2xl border border-slate-200 bg-white"
    />
  );
}

function normalizeSearchValue(value) {
  return trimText(value).toLowerCase();
}

function matchesQuery(value, query) {
  if (!query) {
    return true;
  }

  return normalizeSearchValue(value).includes(query);
}

function normalizeItemKey(value) {
  return normalizeSearchValue(value).replace(/\s+/g, ' ');
}

function findMatchingActiveItem(activeItems, value) {
  const normalizedValue = normalizeItemKey(value);
  if (!normalizedValue) {
    return null;
  }

  return (activeItems || []).find((item) => (
    normalizeItemKey(item.name) === normalizedValue || normalizeItemKey(item.sku) === normalizedValue
  )) || null;
}

function InlineNotice({ notice }) {
  if (!notice) {
    return null;
  }

  const toneClasses =
    notice.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : notice.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return <div className={`rounded-lg border px-3 py-2 text-sm ${toneClasses}`}>{notice.message}</div>;
}

function AttachmentField({ label, accept = 'image/*,.pdf', onChange, file, hint }) {
  return (
    <label className="block">
      <span className={FORM_LABEL_CLASS}>{label}</span>
      <input
        type="file"
        accept={accept}
        className={FORM_INPUT_CLASS}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="mt-1 text-[11px] text-muted-foreground">
        {hint || 'Attach a photo or PDF.'}
        {file ? ` Selected: ${file.name}` : ''}
      </div>
    </label>
  );
}

async function fetchDashboardData() {
  const response = await fetch('/api/stock/dashboard');
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || json.message || 'Fetch failed');
  }

  return json;
}

export default function StockDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.dashboard.${key}`, language);
  const { user, isLoading: userLoading } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  const [activeTableView, setActiveTableView] = useState('items');
  const [stockPage, setStockPage] = useState(1);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [arrivalDraft, setArrivalDraft] = useState(() => createInitialArrivalDraft());
  const [dispatchDraft, setDispatchDraft] = useState(() => createInitialDispatchDraft());
  const [arrivalAttachments, setArrivalAttachments] = useState(() => createInitialAttachmentState());
  const [dispatchAttachments, setDispatchAttachments] = useState(() => createInitialAttachmentState());
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

  async function refreshDashboard() {
    const json = await fetchDashboardData();
    setData(json);
    return json;
  }

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

    if (userLoading) {
      return () => {
        mounted = false;
      };
    }

    if (!user) {
      setLoading(false);
      setError('Unauthorized');
      return () => {
        mounted = false;
      };
    }

    loadData();

    return () => { mounted = false; };
  }, [user, userLoading]);

  function updateArrivalDraft(field, value) {
    setArrivalDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateDispatchDraft(field, value) {
    setDispatchDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function uploadShipmentDocument({ entityType, entityId, documentType, file, documentNumber, notes }) {
    if (!file) {
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', String(entityId));
    formData.append('documentType', documentType);
    if (documentNumber) {
      formData.append('documentNumber', documentNumber);
    }
    if (notes) {
      formData.append('notes', notes);
    }

    const response = await fetch('/api/stock/documents', {
      method: 'POST',
      body: formData,
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || json.detail || `Failed to upload ${documentType}`);
    }

    return json.document;
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function openShipmentPreview(kind, row) {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;
    setPreviewItemsPage(1);

    setPreviewState({
      open: true,
      loading: true,
      kind,
      title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
      description: 'Loading full shipment details…',
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

      if (!shipmentResponse.ok) {
        throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      }

      if (!documentsResponse.ok) {
        throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');
      }

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? 'Inbound shipment detail preview' : 'Outbound shipment detail preview',
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
        description: 'Unable to load full details',
        record: row,
        items: [],
        documents: [],
        error: error.message,
      });
    }
  }

  async function openStockItemPreview(item) {
    setPreviewItemsPage(1);
    setPreviewState({
      open: true,
      loading: false,
      kind: 'stock',
      title: `${item.sku} • ${item.name}`,
      description: 'Current stock item details',
      record: item,
      items: [],
      documents: [],
      error: null,
    });
  }

  function updateArrivalItem(index, field, value) {
    setArrivalDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
  }

  function autoPopulateArrivalItem(index, matchedItem) {
    setArrivalDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return {
          ...item,
          itemId: String(matchedItem.id),
          itemName: matchedItem.name || item.itemName,
          sku: matchedItem.sku || item.sku,
          brandName: matchedItem.brand_name || item.brandName,
          typeName: matchedItem.type_name || item.typeName,
          sizeLabel: matchedItem.size_label || item.sizeLabel,
          sizeUnit: matchedItem.size_unit || item.sizeUnit || 'mm',
          tilesPerBox: matchedItem.tiles_per_box != null ? String(matchedItem.tiles_per_box) : item.tilesPerBox,
          piecesPerBox: matchedItem.pieces_per_box != null ? String(matchedItem.pieces_per_box) : item.piecesPerBox,
          reorderLevel: matchedItem.reorder_level != null ? String(matchedItem.reorder_level) : item.reorderLevel,
          description: matchedItem.description || item.description,
        };
      }),
    }));
  }

  function handleArrivalItemNameChange(index, value) {
    updateArrivalItem(index, 'itemName', value);

    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }

    updateArrivalItem(index, 'itemId', '');
  }

  function handleArrivalItemSkuChange(index, value) {
    updateArrivalItem(index, 'sku', value);

    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }

    updateArrivalItem(index, 'itemId', '');
  }

  function updateDispatchItem(index, field, value) {
    setDispatchDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
  }

  function addArrivalItemRow() {
    setArrivalDraft((current) => ({
      ...current,
      items: [...current.items, createArrivalItemRow()],
    }));
  }

  function addDispatchItemRow() {
    setDispatchDraft((current) => ({
      ...current,
      items: [...current.items, createDispatchItemRow()],
    }));
  }

  function toggleSort(sortState, setSortState, key) {
    setSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function getSortedRows(rows, sortState, accessors) {
    const sortedRows = [...rows];

    sortedRows.sort((left, right) => {
      const leftValue = accessors[sortState.key]?.(left);
      const rightValue = accessors[sortState.key]?.(right);

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue == null) {
        return 1;
      }

      if (rightValue == null) {
        return -1;
      }

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortState.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }

      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

      return sortState.direction === 'asc' ? comparison : -comparison;
    });

    return sortedRows;
  }

  async function handleArrivalSubmit(event) {
    event.preventDefault();
    setArrivalNotice(null);
    setArrivalSubmitting(true);

    try {
      const items = arrivalDraft.items
        .map((item) => ({
          itemId: trimText(item.itemId),
          sku: trimText(item.sku),
          itemName: trimText(item.itemName),
          brandName: trimText(item.brandName),
          typeName: trimText(item.typeName),
          sizeLabel: trimText(item.sizeLabel),
          sizeUnit: trimText(item.sizeUnit) || 'mm',
          tilesPerBox: toNumber(item.tilesPerBox),
          piecesPerBox: toNumber(item.piecesPerBox),
          reorderLevel: toNumber(item.reorderLevel),
          description: trimText(item.description),
          wholeQty: toNumber(item.wholeQty),
          brokenQty: toNumber(item.brokenQty),
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.itemName || item.wholeQty > 0 || item.brokenQty > 0 || item.notes);

      if (items.length === 0) {
        throw new Error('Add at least one arrival item.');
      }

      if (items.some((item) => !item.itemId && (!item.itemName || !item.brandName || !item.typeName || !item.sizeLabel))) {
        throw new Error('Pick an existing tile from autocomplete or enter tile name, brand, type, and size for a new tile.');
      }

      if (items.some((item) => item.wholeQty === 0 && item.brokenQty === 0)) {
        throw new Error('Enter whole or broken quantity for each arrival row.');
      }

      const response = await fetch('/api/stock/inbound-shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentNumber: trimText(arrivalDraft.shipmentNumber) || undefined,
          supplierName: trimText(arrivalDraft.supplierName) || undefined,
          truckLicensePlate: trimText(arrivalDraft.truckLicensePlate) || undefined,
          truckNumber: trimText(arrivalDraft.truckLicensePlate) || undefined,
          driverName: trimText(arrivalDraft.driverName) || undefined,
          invoiceNumber: trimText(arrivalDraft.invoiceNumber) || undefined,
          deliveryCost: toNumber(arrivalDraft.transportCost),
          unloadingLabourCost: toNumber(arrivalDraft.laborCost),
          notes: trimText(arrivalDraft.notes) || undefined,
          items: items.map((item) => ({
            itemId: item.itemId ? Number(item.itemId) : undefined,
            sku: item.sku || undefined,
            itemName: item.itemName || undefined,
            brandName: item.brandName || undefined,
            typeName: item.typeName || undefined,
            sizeLabel: item.sizeLabel || undefined,
            sizeUnit: item.sizeUnit || undefined,
            tilesPerBox: item.tilesPerBox || undefined,
            piecesPerBox: item.piecesPerBox || undefined,
            reorderLevel: item.reorderLevel || undefined,
            description: item.description || undefined,
            wholeQty: item.wholeQty,
            brokenQty: item.brokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.detail || 'Failed to submit arrival');
      }

      setArrivalDraft(createInitialArrivalDraft());
      setArrivalAttachments(createInitialAttachmentState());
      setArrivalNotice({
        type: 'success',
        message: `Arrival ${json.shipment?.shipment_number || 'submitted'} sent for review.`,
      });
      try {
        const linkedInvoice = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'purchase_invoice',
          file: arrivalAttachments.purchaseInvoice,
          documentNumber: trimText(arrivalDraft.invoiceNumber) || undefined,
          notes: trimText(arrivalDraft.notes) || undefined,
        });
        if (linkedInvoice) {
          setArrivalNotice({ type: 'success', message: `Arrival ${json.shipment?.shipment_number || 'submitted'} sent for review and invoice attached.` });
        }

        const linkedBill = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'transporter_bill',
          file: arrivalAttachments.transporterBill,
          documentNumber: trimText(arrivalDraft.invoiceNumber) || undefined,
          notes: trimText(arrivalDraft.notes) || undefined,
        });
        if (linkedBill) {
          setArrivalNotice({ type: 'success', message: `Arrival ${json.shipment?.shipment_number || 'submitted'} sent for review and documents attached.` });
        }
      } catch (uploadError) {
        setArrivalNotice({
          type: 'warning',
          message: `Arrival saved, but one or more document uploads failed: ${uploadError.message}`,
        });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setArrivalNotice({
          type: 'warning',
          message: `Arrival saved, but dashboard refresh failed: ${refreshError.message}`,
        });
      }
    } catch (submitError) {
      setArrivalNotice({
        type: 'error',
        message: submitError.message,
      });
    } finally {
      setArrivalSubmitting(false);
    }
  }

  async function handleDispatchSubmit(event) {
    event.preventDefault();
    setDispatchNotice(null);
    setDispatchSubmitting(true);

    try {
      const customerName = trimText(dispatchDraft.customerName);
      if (!customerName) {
        throw new Error('Customer name is required.');
      }

      const items = dispatchDraft.items
        .map((item) => ({
          itemId: trimText(item.itemId),
          loadedWholeQty: toNumber(item.loadedWholeQty),
          loadedBrokenQty: toNumber(item.loadedBrokenQty),
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.loadedWholeQty > 0 || item.loadedBrokenQty > 0 || item.notes);

      if (items.length === 0) {
        throw new Error('Add at least one dispatch item.');
      }

      if (items.some((item) => !item.itemId)) {
        throw new Error('Select a stock item for each dispatch row.');
      }

      if (items.some((item) => item.loadedWholeQty === 0 && item.loadedBrokenQty === 0)) {
        throw new Error('Enter whole or broken quantity for each dispatch row.');
      }

      const response = await fetch('/api/stock/outbound-shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentNumber: trimText(dispatchDraft.shipmentNumber) || undefined,
          customerName,
          truckLicensePlate: trimText(dispatchDraft.truckLicensePlate) || undefined,
          truckNumber: trimText(dispatchDraft.truckLicensePlate) || undefined,
          driverName: trimText(dispatchDraft.driverName) || undefined,
          invoiceNumber: trimText(dispatchDraft.invoiceNumber) || undefined,
          salespersonName: trimText(dispatchDraft.salespersonName) || undefined,
          transportCost: toNumber(dispatchDraft.transportCost),
          loadingLabourCost: toNumber(dispatchDraft.laborCost),
          notes: trimText(dispatchDraft.notes) || undefined,
          items: items.map((item) => ({
            itemId: Number(item.itemId),
            loadedWholeQty: item.loadedWholeQty,
            loadedBrokenQty: item.loadedBrokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.detail || 'Failed to submit dispatch');
      }

      setDispatchDraft(createInitialDispatchDraft());
      setDispatchAttachments(createInitialAttachmentState());
      setDispatchNotice({
        type: 'success',
        message: `Dispatch ${json.shipment?.shipment_number || 'submitted'} sent for review.`,
      });

      try {
        await uploadShipmentDocument({
          entityType: 'outbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'sales_invoice',
          file: dispatchAttachments.salesInvoice,
          documentNumber: trimText(dispatchDraft.invoiceNumber) || undefined,
          notes: trimText(dispatchDraft.notes) || undefined,
        });

        await uploadShipmentDocument({
          entityType: 'outbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'gatepass',
          file: dispatchAttachments.gatepass,
          documentNumber: trimText(dispatchDraft.shipmentNumber) || undefined,
          notes: trimText(dispatchDraft.notes) || undefined,
        });
      } catch (uploadError) {
        setDispatchNotice({
          type: 'warning',
          message: `Dispatch saved, but one or more document uploads failed: ${uploadError.message}`,
        });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setDispatchNotice({
          type: 'warning',
          message: `Dispatch saved, but dashboard refresh failed: ${refreshError.message}`,
        });
      }
    } catch (submitError) {
      setDispatchNotice({
        type: 'error',
        message: submitError.message,
      });
    } finally {
      setDispatchSubmitting(false);
    }
  }

  const pendingReviews = Number(data?.summary?.pending_inbound_reviews || 0) + Number(data?.summary?.pending_outbound_reviews || 0);
  const totalIncoming = Number(data?.summary?.total_incoming || 0);
  const totalOutgoing = Number(data?.summary?.total_outgoing || 0);

  const summaryTiles = [
    {
      label: 'Available Whole Stock',
      value: Number(data?.summary?.total_whole_stored || 0),
      href: '#current-stock',
      tone: 'from-blue-500/15 to-cyan-500/5 border-blue-100 text-blue-700',
      hint: 'Ready to dispatch',
    },
    {
      label: 'Damaged / Broken Stock',
      value: Number(data?.summary?.total_broken_stored || 0),
      href: '#current-stock',
      tone: 'from-amber-500/15 to-orange-500/5 border-amber-100 text-amber-700',
      hint: 'Needs action',
    },
    {
      label: 'Pending Reviews',
      value: pendingReviews,
      href: '/stock/approvals',
      tone: 'from-rose-500/15 to-orange-500/5 border-rose-100 text-rose-700',
      hint: 'Arrivals + dispatches',
    },
    {
      label: 'Net Movement',
      value: totalIncoming - totalOutgoing,
      href: '#arrivals',
      tone: 'from-emerald-500/15 to-teal-500/5 border-emerald-100 text-emerald-700',
      hint: 'Incoming - outgoing',
    },
  ];

  const movementByDate = new Map();

  (data?.recentArrivals || []).forEach((shipment) => {
    const dateSource = shipment.arrival_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.inbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  (data?.recentDispatches || []).forEach((shipment) => {
    const dateSource = shipment.dispatch_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.outbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  const movementTrend = Array.from(movementByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);

  const chartWidth = 700;
  const chartHeight = 240;
  const chartPadding = { top: 18, right: 16, bottom: 34, left: 48 };
  const chartInnerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const chartInnerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const maxChartValue = Math.max(
    ...movementTrend.map((point) => Math.max(point.inbound, point.outbound)),
    1
  );

  function pointX(index) {
    if (movementTrend.length <= 1) {
      return chartPadding.left + chartInnerWidth / 2;
    }

    return chartPadding.left + (index / (movementTrend.length - 1)) * chartInnerWidth;
  }

  function pointY(value) {
    return chartPadding.top + chartInnerHeight - (value / maxChartValue) * chartInnerHeight;
  }

  function linePath(key) {
    if (!movementTrend.length) {
      return '';
    }

    return movementTrend
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index)} ${pointY(point[key])}`)
      .join(' ');
  }

  const inboundPath = linePath('inbound');
  const outboundPath = linePath('outbound');

  const tableViewTabs = [
    { id: 'items', label: t('currentStock') },
    { id: 'arrivals', label: t('arrivals') },
    { id: 'dispatches', label: t('dispatches') },
  ];

  const arrivalRows = getSortedRows(
    (data?.recentArrivals || []).filter((shipment) => {
      const query = normalizeSearchValue(arrivalSearch);
      if (!query) {
        return true;
      }

      return [
        shipment.shipment_number,
        shipment.status,
        shipment.generated_by,
        shipment.approved_by,
        formatDateTime(shipment.arrival_date),
        shipment.truck_license_plate,
        shipment.driver_name,
        shipment.product_names,
        shipment.product_skus,
        shipment.total_whole_qty,
        shipment.total_broken_qty,
      ].some((value) => matchesQuery(value, query));
    }),
    arrivalSort,
    {
      datetime: (shipment) => new Date(shipment.arrival_date || shipment.created_at || 0).getTime(),
      shipment: (shipment) => shipment.shipment_number || '',
      products: (shipment) => shipment.product_names || '',
      quantities: (shipment) => Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0),
      status: (shipment) => shipment.status || '',
    }
  );

  const dispatchRows = getSortedRows(
    (data?.recentDispatches || []).filter((shipment) => {
      const query = normalizeSearchValue(dispatchSearch);
      if (!query) {
        return true;
      }

      return [
        shipment.shipment_number,
        shipment.status,
        shipment.generated_by,
        shipment.approved_by,
        formatDateTime(shipment.dispatch_date),
        shipment.truck_license_plate,
        shipment.driver_name,
        shipment.product_names,
        shipment.product_skus,
        shipment.total_whole_qty,
        shipment.total_broken_qty,
      ].some((value) => matchesQuery(value, query));
    }),
    dispatchSort,
    {
      datetime: (shipment) => new Date(shipment.dispatch_date || shipment.created_at || 0).getTime(),
      shipment: (shipment) => shipment.shipment_number || '',
      products: (shipment) => shipment.product_names || '',
      quantities: (shipment) => Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0),
      status: (shipment) => shipment.status || '',
    }
  );

  const stockRows = getSortedRows(
    (data?.activeItems || []).filter((item) => {
      const query = normalizeSearchValue(stockSearch);
      if (!query) {
        return true;
      }

      return [item.sku, item.name, item.size_label, item.current_whole_qty, item.current_broken_qty, item.reorder_level]
        .some((value) => matchesQuery(value, query));
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
  );

  const stockPagination = paginateRows(stockRows, stockPage, DEFAULT_PAGE_SIZE);
  const arrivalPagination = paginateRows(arrivalRows, arrivalPage, DEFAULT_PAGE_SIZE);
  const dispatchPagination = paginateRows(dispatchRows, dispatchPage, DEFAULT_PAGE_SIZE);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setStockPage((current) => Math.min(current, stockPagination.pageCount));
  }, [stockPagination.pageCount]);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setDispatchPage((current) => Math.min(current, dispatchPagination.pageCount));
  }, [dispatchPagination.pageCount]);

  useEffect(() => {
    setPreviewItemsPage((current) => Math.min(current, previewItemPagination.pageCount));
  }, [previewItemPagination.pageCount]);

  if (loading) return <div className="p-8 text-center">{t('loading')}</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-2">
          {summaryTiles.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className={`group rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-950 ${stat.tone}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold leading-none">{stat.value}</p>
              <p className="mt-2 text-xs font-medium opacity-75">{stat.hint}</p>
            </Link>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm xl:col-span-3">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Movement Trend</h2>
              <p className="text-xs text-muted-foreground">Quantity vs Date for recent arrivals and dispatches</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Incoming</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />Outgoing</span>
            </div>
          </div>
          {movementTrend.length ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-56 w-full rounded-xl border border-border bg-muted/20">
              {[0, 0.5, 1].map((tick) => {
                const value = Math.round(maxChartValue * tick);
                const y = pointY(value);

                return (
                  <g key={`grid-${tick}`}>
                    <line
                      x1={chartPadding.left}
                      y1={y}
                      x2={chartWidth - chartPadding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-border"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={chartPadding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              <path d={inboundPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <path d={outboundPath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

              {movementTrend.map((point, index) => (
                <g key={`dots-${point.date}`}>
                  <circle cx={pointX(index)} cy={pointY(point.inbound)} r="3.5" fill="#10b981" />
                  <circle cx={pointX(index)} cy={pointY(point.outbound)} r="3.5" fill="#8b5cf6" />
                  <text
                    x={pointX(index)}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {formatChartDate(point.date)}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              No movement data available yet.
            </div>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-border/80 bg-card/70 p-1 shadow-sm backdrop-blur">
        <div className="grid grid-cols-3 gap-1">
          {tableViewTabs.map((tab) => {
            const isActive = activeTableView === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTableView(tab.id)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm duration-300'
                    : 'text-muted-foreground duration-300 hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {activeTableView === 'items' && (
        <div className="stock-tab-panel" key="stock-panel-items">
        <div id="current-stock" className="overflow-hidden scroll-mt-6 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 p-3">
          <h2 className="text-base font-semibold text-foreground">{t('currentStock')}</h2>
          <span className="text-xs text-muted-foreground">{data?.activeItems?.length || 0} {t('items')}</span>
        </div>
        <div className="border-b border-border bg-card px-3 py-2">
          <input
            type="search"
            value={stockSearch}
            onChange={(event) => setStockSearch(event.target.value)}
            placeholder="Search items by SKU, name, size, or quantities"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 bg-muted/70 font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'sku')} className="font-medium hover:text-foreground">
                    {t('sku')}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'name')} className="font-medium hover:text-foreground">
                    {t('name')}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'size')} className="font-medium hover:text-foreground">
                    {t('size')}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'whole')} className="font-medium hover:text-foreground">
                    {t('whole')}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'broken')} className="font-medium hover:text-foreground">
                    {t('broken')}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'reorder')} className="font-medium hover:text-foreground">
                    {t('reorder')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stockPagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                  onClick={() => openStockItemPreview(item)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openStockItemPreview(item);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="border-r border-border px-3 py-2 font-medium text-foreground">{item.sku}</td>
                  <td className="px-3 py-2 truncate max-w-[200px]" title={item.name}>{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.size_label}</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{item.current_whole_qty}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{item.current_broken_qty}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{item.reorder_level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={stockPagination.page}
          pageCount={stockPagination.pageCount}
          total={stockPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setStockPage}
        />
      </div>
        </div>
      )}
      {activeTableView === 'arrivals' && (
        <div className="stock-tab-panel" key="stock-panel-arrivals">
        <section id="arrivals" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 p-3">
            <h2 className="text-base font-semibold text-foreground">{t('arrivals')}</h2>
              <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => setArrivalNotice(null)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  + {t('newArrival')}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[50vw]">
                <SheetHeader>
                  <SheetTitle>{t('logNewArrival')}</SheetTitle>
                  <SheetDescription>{t('logNewArrivalDesc')}</SheetDescription>
                </SheetHeader>
                <form className="mt-6 space-y-5" onSubmit={handleArrivalSubmit}>
                  <InlineNotice notice={arrivalNotice} />
                  <div className={FORM_CARD_CLASS}>
                    <h3 className="text-sm font-semibold text-foreground">Shipment Basics</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Enter core details for this inbound shipment.</p>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('shipmentNo')}</label>
                      <input
                        value={arrivalDraft.shipmentNumber}
                        onChange={(event) => updateArrivalDraft('shipmentNumber', event.target.value)}
                        type="text"
                        autoFocus
                        className={FORM_INPUT_CLASS}
                        placeholder="SHP-202X..."
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('supplier')}</label>
                      <input
                        value={arrivalDraft.supplierName}
                        onChange={(event) => updateArrivalDraft('supplierName', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="Supplier Name..."
                      />
                    </div>
                  </div>
                  </div>
                  <div className={FORM_CARD_CLASS}>
                    <h3 className="text-sm font-semibold text-foreground">Vehicle And Invoice</h3>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('truck')}</label>
                      <input
                        value={arrivalDraft.truckLicensePlate}
                        onChange={(event) => updateArrivalDraft('truckLicensePlate', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="RJ 14 XY 0000"
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('driver')}</label>
                      <input
                        value={arrivalDraft.driverName}
                        onChange={(event) => updateArrivalDraft('driverName', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="Driver Name..."
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('invoiceNo')}</label>
                      <input
                        value={arrivalDraft.invoiceNumber}
                        onChange={(event) => updateArrivalDraft('invoiceNumber', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="INV-..."
                      />
                    </div>
                    <AttachmentField
                      label="Invoice photo"
                      file={arrivalAttachments.purchaseInvoice}
                      onChange={(file) => setArrivalAttachments((current) => ({ ...current, purchaseInvoice: file }))}
                      hint="Purchase invoice photo or PDF."
                    />
                    <AttachmentField
                      label="Transporter bill photo"
                      file={arrivalAttachments.transporterBill}
                      onChange={(file) => setArrivalAttachments((current) => ({ ...current, transporterBill: file }))}
                      accept="image/*"
                      hint="Truck bill, lorry receipt, or transporter bill photo."
                    />
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('transportCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={arrivalDraft.transportCost}
                          onChange={(event) => updateArrivalDraft('transportCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background py-2.5 pl-12 pr-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                  </div>
                  </div>
                  <div className={FORM_CARD_CLASS}>
                    <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('laborCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={arrivalDraft.laborCost}
                          onChange={(event) => updateArrivalDraft('laborCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background py-2.5 pl-12 pr-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                  </div>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
                    <div className="flex justify-between items-center mb-2 gap-4">
                      <label className="text-sm font-semibold text-foreground">{t('items')}</label>
                      <button
                        type="button"
                        onClick={addArrivalItemRow}
                        className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
                      >
                        {t('addItem')}
                      </button>
                    </div>
                    <datalist id="arrival-item-options">
                      {(data?.activeItems || []).map((stockItem) => (
                        <option key={`arrival-option-${stockItem.id}`} value={stockItem.name}>
                          {stockItem.sku}
                        </option>
                      ))}
                    </datalist>
                    <div className="space-y-3">
                      {arrivalDraft.items.map((item, index) => (
                        <div key={`arrival-item-${index}`} className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
                          <div className="flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
                            <span>Item {index + 1}</span>
                            <span className={`rounded-full border px-2.5 py-1 ${item.itemId ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                              {item.itemId ? 'Autofilled from catalog' : 'New tile entry'}
                            </span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="col-span-2">
                              <input
                                value={item.itemName}
                                onChange={(event) => handleArrivalItemNameChange(index, event.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="Type tile name (autocomplete will auto-fill if found)"
                                list="arrival-item-options"
                              />
                              <div className="mt-1 text-[11px] text-muted-foreground">If this matches an existing tile, details auto-fill. Otherwise fill details below for new tile entry.</div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Whole(Box)</label>
                              <input
                                value={item.wholeQty}
                                onChange={(event) => updateArrivalItem(index, 'wholeQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Broken tiles</label>
                              <input
                                value={item.brokenQty}
                                onChange={(event) => updateArrivalItem(index, 'brokenQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <input
                              value={item.brandName}
                              onChange={(event) => updateArrivalItem(index, 'brandName', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Brand"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.typeName}
                              onChange={(event) => updateArrivalItem(index, 'typeName', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Type"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.sizeLabel}
                              onChange={(event) => updateArrivalItem(index, 'sizeLabel', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Size"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.sku}
                              onChange={(event) => handleArrivalItemSkuChange(index, event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="SKU optional"
                            />
                            <input
                              value={item.tilesPerBox}
                              onChange={(event) => updateArrivalItem(index, 'tilesPerBox', event.target.value)}
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Tiles / box"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.piecesPerBox}
                              onChange={(event) => updateArrivalItem(index, 'piecesPerBox', event.target.value)}
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Pieces / box"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.reorderLevel}
                              onChange={(event) => updateArrivalItem(index, 'reorderLevel', event.target.value)}
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Reorder level"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.sizeUnit}
                              onChange={(event) => updateArrivalItem(index, 'sizeUnit', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Size unit"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.description}
                              onChange={(event) => updateArrivalItem(index, 'description', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 lg:col-span-2"
                              placeholder="Description"
                              disabled={Boolean(item.itemId)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={FORM_CARD_CLASS}>
                    <label className={FORM_LABEL_CLASS}>{t('notes')}</label>
                    <textarea
                      value={arrivalDraft.notes}
                      onChange={(event) => updateArrivalDraft('notes', event.target.value)}
                      className={FORM_INPUT_CLASS}
                      rows="2"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={arrivalSubmitting}
                    className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {arrivalSubmitting ? 'Submitting...' : t('submitArrival')}
                  </button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
          <div className="border-b border-border bg-card px-3 py-2">
            <input
              type="search"
              value={arrivalSearch}
              onChange={(event) => setArrivalSearch(event.target.value)}
              placeholder="Search arrivals by date, product, qty, truck, or status"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-muted/70 font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'datetime')} className="font-medium hover:text-foreground">
                      Datetime
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'shipment')} className="font-medium hover:text-foreground">
                      {t('shipmentNo')}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'products')} className="font-medium hover:text-foreground">
                      Products
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'quantities')} className="font-medium hover:text-foreground">
                      Quantities
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'status')} className="font-medium hover:text-foreground">
                      {t('status')}
                    </button>
                  </th>
                  <th className="px-3 py-2">Generated By</th>
                  <th className="px-3 py-2">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {arrivalPagination.rows.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
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
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(a.arrival_date || a.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-primary">{a.shipment_number}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-[260px] truncate" title={a.product_names || a.product_skus || ''}>
                        {a.product_names || a.product_skus || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(a.total_whole_qty || 0)} whole / {Number(a.total_broken_qty || 0)} broken
                    </td>
                    <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{a.status}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{a.generated_by || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.approved_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={arrivalPagination.page}
            pageCount={arrivalPagination.pageCount}
            total={arrivalPagination.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setArrivalPage}
          />
        </section>
        </div>
        )}

        {activeTableView === 'dispatches' && (
        <div className="stock-tab-panel" key="stock-panel-dispatches">
        <section id="dispatches" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 p-3">
            <h2 className="text-base font-semibold text-foreground">{t('dispatches')}</h2>
              <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDispatchNotice(null)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  + {t('newDispatch')}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[50vw]">
                <SheetHeader>
                  <SheetTitle>{t('logNewDispatch')}</SheetTitle>
                  <SheetDescription>{t('logNewDispatchDesc')}</SheetDescription>
                </SheetHeader>
                <form className="mt-6 space-y-4" onSubmit={handleDispatchSubmit}>
                  <InlineNotice notice={dispatchNotice} />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('dispatchNo')}</label>
                      <input
                        value={dispatchDraft.shipmentNumber}
                        onChange={(event) => updateDispatchDraft('shipmentNumber', event.target.value)}
                        type="text"
                        autoFocus
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="DSP-202X..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('customer')}</label>
                      <input
                        value={dispatchDraft.customerName}
                        onChange={(event) => updateDispatchDraft('customerName', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Customer Name..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('truck')}</label>
                      <input
                        value={dispatchDraft.truckLicensePlate}
                        onChange={(event) => updateDispatchDraft('truckLicensePlate', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="RJ 14 XY 0000"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('driver')}</label>
                      <input
                        value={dispatchDraft.driverName}
                        onChange={(event) => updateDispatchDraft('driverName', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Driver Name..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('invoiceNo')}</label>
                      <input
                        value={dispatchDraft.invoiceNumber}
                        onChange={(event) => updateDispatchDraft('invoiceNumber', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="INV-..."
                      />
                    </div>
                    <AttachmentField
                      label="Sales invoice photo"
                      file={dispatchAttachments.salesInvoice}
                      onChange={(file) => setDispatchAttachments((current) => ({ ...current, salesInvoice: file }))}
                      hint="Sales invoice photo or PDF."
                    />
                    <AttachmentField
                      label="Gatepass photo"
                      file={dispatchAttachments.gatepass}
                      onChange={(file) => setDispatchAttachments((current) => ({ ...current, gatepass: file }))}
                      accept="image/*"
                      hint="Gatepass photo before dispatch leaves the yard."
                    />
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('salesperson')}</label>
                      <input
                        value={dispatchDraft.salespersonName}
                        onChange={(event) => updateDispatchDraft('salespersonName', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Salesperson..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('transportCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={dispatchDraft.transportCost}
                          onChange={(event) => updateDispatchDraft('transportCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background pl-12 pr-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('laborCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={dispatchDraft.laborCost}
                          onChange={(event) => updateDispatchDraft('laborCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background pl-12 pr-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-2 gap-4">
                      <label className="text-sm font-semibold text-foreground">{t('items')}</label>
                      <button
                        type="button"
                        onClick={addDispatchItemRow}
                        className="text-primary text-xs font-semibold hover:underline"
                      >
                        {t('addItem')}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 items-center mb-2">
                      <div className="col-span-2 text-xs font-semibold text-muted-foreground">{t('sku')} / {t('name')}</div>
                      <div className="text-xs font-semibold text-muted-foreground">{t('whole')}</div>
                      <div className="text-xs font-semibold text-muted-foreground">{t('broken')}</div>
                    </div>
                    <div className="space-y-3">
                      {dispatchDraft.items.map((item, index) => (
                        <div key={`dispatch-item-${index}`} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
                            <span>Item {index + 1}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 items-center">
                            <div className="col-span-2">
                              <select
                                value={item.itemId}
                                onChange={(event) => updateDispatchItem(index, 'itemId', event.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              >
                                <option value="">{t('selectItem')}</option>
                                {data?.activeItems?.map((stockItem) => (
                                  <option key={stockItem.id} value={stockItem.id}>
                                    {stockItem.sku} - {stockItem.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <input
                                value={item.loadedWholeQty}
                                onChange={(event) => updateDispatchItem(index, 'loadedWholeQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <input
                                value={item.loadedBrokenQty}
                                onChange={(event) => updateDispatchItem(index, 'loadedBrokenQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground/80">{t('notes')}</label>
                    <textarea
                      value={dispatchDraft.notes}
                      onChange={(event) => updateDispatchDraft('notes', event.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      rows="2"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={dispatchSubmitting}
                    className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {dispatchSubmitting ? 'Submitting...' : t('submitDispatch')}
                  </button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
          <div className="border-b border-border bg-card px-3 py-2">
            <input
              type="search"
              value={dispatchSearch}
              onChange={(event) => setDispatchSearch(event.target.value)}
              placeholder="Search dispatches by date, product, qty, truck, or status"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-muted/70 font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'datetime')} className="font-medium hover:text-foreground">
                      Datetime
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'shipment')} className="font-medium hover:text-foreground">
                      {t('dispatchNo')}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'products')} className="font-medium hover:text-foreground">
                      Products
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'quantities')} className="font-medium hover:text-foreground">
                      Quantities
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'status')} className="font-medium hover:text-foreground">
                      {t('status')}
                    </button>
                  </th>
                  <th className="px-3 py-2">Generated By</th>
                  <th className="px-3 py-2">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dispatchPagination.rows.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                    onClick={() => openShipmentPreview('dispatch', d)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openShipmentPreview('dispatch', d);
                      }
                    }}
                    title="Click to preview"
                  >
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(d.dispatch_date || d.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-primary">{d.shipment_number}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-[260px] truncate" title={d.product_names || d.product_skus || ''}>
                        {d.product_names || d.product_skus || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(d.total_whole_qty || 0)} whole / {Number(d.total_broken_qty || 0)} broken
                    </td>
                    <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{d.status}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{d.generated_by || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.approved_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={dispatchPagination.page}
            pageCount={dispatchPagination.pageCount}
            total={dispatchPagination.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setDispatchPage}
          />
        </section>
        </div>
        )}

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        summary={
          previewState.loading ? (
            <div className="text-sm text-slate-500">Loading preview…</div>
          ) : previewState.error ? (
            <div className="text-sm text-red-600">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'stock'
            ? [
                {
                  title: 'Item Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'SKU', value: previewState.record?.sku },
                        { label: 'Name', value: previewState.record?.name },
                        { label: 'Size', value: previewState.record?.size_label },
                        { label: 'Whole Qty', value: previewState.record?.current_whole_qty },
                        { label: 'Broken Qty', value: previewState.record?.current_broken_qty },
                        { label: 'Reorder Level', value: previewState.record?.reorder_level },
                        { label: 'Tiles / Box', value: previewState.record?.tiles_per_box },
                      ]}
                    />
                  ),
                },
              ]
            : [
                {
                  title: 'Shipment Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Shipment No.', value: previewState.record?.shipment_number },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Approval', value: previewState.record?.approval_status },
                        { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Truck', value: previewState.record?.truck_license_plate || previewState.record?.truck_number },
                        { label: 'Driver', value: previewState.record?.driver_name },
                        { label: 'Invoice No.', value: previewState.record?.invoice_number },
                        { label: 'Gatepass No.', value: previewState.record?.gatepass_number },
                        { label: 'Customer / Supplier', value: previewState.record?.customer_name || previewState.record?.supplier_name },
                        { label: 'Total Whole', value: previewState.record?.total_whole_qty },
                        { label: 'Total Broken', value: previewState.record?.total_broken_qty },
                        { label: 'Notes', value: previewState.record?.notes },
                      ]}
                    />
                  ),
                },
                previewState.items?.length
                  ? {
                      title: 'Line Items',
                      children: (
                        <>
                          <div className="overflow-hidden rounded-2xl border border-border bg-card">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-muted/70 text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">SKU</th>
                                  <th className="px-3 py-2">Name</th>
                                  <th className="px-3 py-2 text-right">Whole</th>
                                  <th className="px-3 py-2 text-right">Broken</th>
                                  <th className="px-3 py-2">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {previewItemPagination.rows.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 font-medium text-foreground">{item.sku}</td>
                                    <td className="px-3 py-2 text-foreground/80">{item.item_name}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_whole_qty ?? item.received_whole_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_broken_qty ?? item.received_broken_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.notes || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PaginationControls
                            page={previewItemPagination.page}
                            pageCount={previewItemPagination.pageCount}
                            total={previewItemPagination.total}
                            pageSize={DEFAULT_PAGE_SIZE}
                            onPageChange={setPreviewItemsPage}
                          />
                        </>
                      ),
                    }
                  : null,
                previewState.documents?.length
                  ? {
                      title: 'Linked Documents',
                      children: (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {previewState.documents.map((document) => (
                            <section
                              key={document.id}
                              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                            >
                                <div className="border-b border-border bg-muted/40 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                                  <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                              </div>
                              <div className="p-4">
                                {renderDocumentPreview(document)}
                              </div>
                            </section>
                          ))}
                        </div>
                      ),
                    }
                  : null,
              ]
        }
      />

      
    </div>
  );
}
