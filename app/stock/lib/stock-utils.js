export function createArrivalItemRow() {
  return {
    itemId: '',
    itemName: '',
    brandName: '',
    divisionName: '',
    finish: '',
    grade: '',
    sizeLabel: '',
    sizeWidthMm: '',
    sizeLengthMm: '',
    sizeUnit: 'mm',
    hsnCode: '',
    thicknessMm: '',
    qtySqm: '',
    costPerSqm: '',
    piecesPerBox: '',
    reorderLevel: '',
    description: '',
    orderedBoxes: '',
    wholeQty: '',
    brokenQty: '',
    notes: '',
  };
}

export function createDispatchItemRow() {
  return {
    itemCategory: 'tile',
    itemId: '',
    loadedWholeQty: '',
    sellUnit: 'box',
    ratePerUnit: '',
    notes: '',
    returnWholeQty: '',
    returnBrokenQty: '',
    qtyBags: '',
    returnQtyBags: '',
  };
}

export function createDispatchBagItemRow() {
  return {
    itemCategory: 'bag',
    itemId: '',
    loadedWholeQty: '',
    notes: '',
    returnWholeQty: '',
    returnBrokenQty: '',
    qtyBags: '',
    ratePerUnit: '',
    returnQtyBags: '',
  };
}

export function createBagArrivalItemRow() {
  return {
    itemCategory: 'bag',
    itemId: '',
    itemName: '',
    brandName: '',
    typeName: '',
    qtyBags: '',
    weightPerUnitKg: '',
    ratePerBag: '',
    hsnCode: '',
    description: '',
    notes: '',
  };
}

export function createBagDispatchItemRow() {
  return {
    itemCategory: 'bag',
    itemId: '',
    qtyBags: '',
    ratePerUnit: '',
    notes: '',
    returnQtyBags: '',
  };
}

export function createInitialBagArrivalDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  return {
    supplierName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    invoiceDate: dateStr,
    originCity: '',
    destinationWarehouseName: '',
    paymentStatus: 'unpaid',
    paidAmount: '',
    paymentDate: '',
    paymentReference: '',
    paymentMode: '',
    transporterName: '',
    transportCost: '',
    laborCost: '',
    handlingCostPercent: '0',
    fuelCostPercent: '0',
    gstPercent: '18.0',
    freightWeightKg: '',
    notes: '',
    items: [createBagArrivalItemRow()],
  };
}

export function createInitialBagDispatchDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);

  return {
    customerName: '',
    customerPhoneNumber: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    dispatchDate: `${dateStr}T${timeStr}`,
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createBagDispatchItemRow()],
  };
}

export function createInitialArrivalDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  return {
    shipmentNumber: '',
    supplierName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    invoiceDate: dateStr,
    originCity: '',
    destinationWarehouseName: '',
    paymentStatus: 'unpaid',
    paidAmount: '',
    paymentDate: '',
    paymentReference: '',
    paymentMode: '',
    transporterName: '',
    transportCost: '',
    laborCost: '',
    handlingCostPercent: '1.0',
    fuelCostPercent: '5.0',
    gstPercent: '18.0',
    freightWeightKg: '',
    notes: '',
    items: [createArrivalItemRow()],
  };
}

export function createInitialDispatchDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);
  const fullDateTime = `${dateStr}T${timeStr}`;

  return {
    customerName: '',
    customerPhoneNumber: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    dispatchDate: fullDateTime,
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createDispatchItemRow()],
  };
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function trimText(value) {
  return String(value ?? '').trim();
}

export function parseSizeLabelSqm(sizeLabel) {
  const clean = trimText(sizeLabel).toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm)?$/);
  if (!match) return null;

  const widthMm = Number(match[1]);
  const lengthMm = Number(match[2]);
  if (!Number.isFinite(widthMm) || !Number.isFinite(lengthMm) || widthMm <= 0 || lengthMm <= 0) return null;

  return (widthMm / 1000) * (lengthMm / 1000);
}

export function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function normalizeGeneratedByRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'manager') return 'manager';
  if (normalized === 'salesperson' || normalized === 'sales_person' || normalized === 'sales') return 'salesperson';
  if (normalized === 'stock_maintainer') return 'stock_maintainer';
  return 'unknown';
}

export function getGeneratedByRoleBadgeClass(role) {
  switch (normalizeGeneratedByRole(role)) {
    case 'admin': return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'manager': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'salesperson': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'stock_maintainer': return 'border-slate-200 bg-slate-50 text-slate-700';
    default: return 'border-border bg-muted text-muted-foreground';
  }
}

export function getGeneratedByRoleLabel(role) {
  const normalized = normalizeGeneratedByRole(role);
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'salesperson') return 'Salesperson';
  if (normalized === 'stock_maintainer') return 'Maintainer';
  return 'Legacy';
}

export function getStatusVariant(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved') || normalized.includes('active') || normalized.includes('complete')) return 'approved';
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('warning')) return 'pending';
  if (normalized.includes('rejected') || normalized.includes('failed') || normalized.includes('critical')) return 'rejected';
  return 'neutral';
}

export function normalizeSearchValue(value) {
  return trimText(value).toLowerCase();
}

export function matchesQuery(value, query) {
  if (!query) return true;
  return normalizeSearchValue(value).includes(query);
}

export function normalizeItemKey(value) {
  return normalizeSearchValue(value).replace(/\s+/g, ' ');
}

export function findMatchingActiveItem(activeItems, value) {
  const normalizedValue = normalizeItemKey(value);
  if (!normalizedValue) return null;
  return (activeItems || []).find((item) => (
    normalizeItemKey(item.name) === normalizedValue || normalizeItemKey(item.sku) === normalizedValue
  )) || null;
}

export async function fetchDashboardData() {
  const response = await fetch('/api/stock/dashboard');
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || json.message || 'Fetch failed');
  return json;
}

export function getSortedRows(rows, sortState, accessors) {
  const sortedRows = [...rows];
  sortedRows.sort((left, right) => {
    const leftValue = accessors[sortState.key]?.(left);
    const rightValue = accessors[sortState.key]?.(right);
    if (leftValue === rightValue) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
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

export const FORM_LABEL_CLASS = 'block text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40 mb-1.5';
export const FORM_INPUT_CLASS = 'w-full rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-brand-primary/50 focus:ring-4 focus:ring-brand-primary/10 backdrop-blur-sm';
export const FORM_CARD_CLASS = 'glass-panel rounded-2xl p-4 sm:p-5 border border-white/5 shadow-xl transition-all duration-300';

export const CLASSES = {
  contentWrap: 'mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-6',
  topCard: 'glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-10',
  interactiveCard: 'glass-panel rounded-2xl sm:rounded-3xl transition-all duration-300 hover:shadow-lg',
  card: 'glass-panel rounded-3xl sm:rounded-[2rem] p-5 sm:p-6 lg:p-8 transition-all duration-500 hover:shadow-xl group/card',
  cardCompact: 'glass-panel rounded-2xl sm:rounded-3xl p-3 sm:p-4 lg:p-6 transition-all duration-300 hover:shadow-md group/card',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 group-hover/card:text-brand-primary transition-colors',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3',
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6',
  statGrid: 'grid grid-cols-2 gap-3 lg:grid-cols-4',
  statCard: 'min-w-0 glass-panel rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5',
  statLabel: 'text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400',
  statValue: 'mt-1.5 text-2xl font-black text-slate-900 sm:text-3xl dark:text-white leading-none tracking-tighter',
  iconButton: 'h-8 w-8 rounded-lg hover:bg-slate-100 transition-colors active:scale-95 dark:hover:bg-slate-800',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2',
};

export const INVOICE_CLASSES = {
  surface: 'glass-panel rounded-2xl sm:rounded-3xl border border-white/5 shadow-2xl overflow-hidden',
  commandCard: 'glass-panel rounded-2xl border border-white/10 bg-white/5 p-5 m-4 shadow-xl backdrop-blur-md',
  supplierTitle: 'text-2xl font-black text-slate-900 dark:text-white tracking-tighter',
  supplierMeta: 'mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 opacity-70',
  logisticsGrid: 'grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 shadow-inner',
  logisticsCell: 'border-b border-r border-white/5 bg-white/5 p-4 last:border-r-0 dark:bg-slate-900/40',
  logisticsLabel: 'flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary opacity-80',
  logisticsValue: 'mt-2 text-sm font-black tracking-tight text-slate-900 dark:text-slate-100',
  subBar: 'flex flex-wrap gap-6 rounded-xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-lg',
  tableWrap: 'overflow-hidden rounded-2xl border border-white/10 shadow-xl',
  tableHead: 'bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.25em]',
  tableHeadCell: 'px-5 py-4',
  tableRow: 'border-b border-white/5 hover:bg-slate-500/5 transition-colors duration-300',
  tableCell: 'px-5 py-4 text-sm font-medium text-slate-700 dark:text-slate-200',
  monoCell: 'font-mono text-sm font-bold text-slate-800 dark:text-slate-100',
  mobileGrid: 'space-y-4',
  mobileCard: 'glass-panel rounded-2xl border border-white/10 p-5 shadow-lg relative overflow-hidden group',
  mobileCardHeader: 'absolute top-0 right-0 rounded-bl-xl bg-slate-900 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white shadow-xl',
  mobileKey: 'text-[9px] font-black uppercase tracking-[0.15em] text-slate-500/60',
  mobileValue: 'mt-1 text-[11px] font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight',
};

export const shipmentCache = new Map();
export const documentCache = new Map();

export async function fetchShipmentDetails(kind, id) {
  const cacheKey = `${kind}-${id}`;
  if (shipmentCache.has(cacheKey)) {
    return shipmentCache.get(cacheKey);
  }
  const endpoint = kind === 'arrival'
    ? `/api/stock/inbound-shipments/${id}?includeDocs=true`
    : `/api/stock/outbound-shipments/${id}?includeDocs=true`;
  const response = await fetch(endpoint);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || json.detail || 'Failed to load details');
  
  shipmentCache.set(cacheKey, { shipment: json.shipment, items: json.items, documents: json.documents });
  if (json.documents) documentCache.set(cacheKey, { documents: json.documents });

  return json;
}

export async function fetchShipmentDocuments(kind, id) {
  const cacheKey = `${kind}-${id}`;
  if (documentCache.has(cacheKey)) {
    return documentCache.get(cacheKey);
  }
  const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
  const response = await fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${id}&limit=20`, { cache: 'no-store' });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || json.detail || 'Failed to load documents');
  documentCache.set(cacheKey, json);
  return json;
}

export function invalidateShipmentCache(kind, id) {
  if (id) {
    const cacheKey = `${kind}-${id}`;
    shipmentCache.delete(cacheKey);
    documentCache.delete(cacheKey);
  } else {
    shipmentCache.clear();
    documentCache.clear();
  }
}

export const EXPORT_PERIOD_PRESETS = [
  { id: 'all', label: 'All time', months: null },
  { id: '1m', label: 'Last 1 month', months: 1 },
  { id: '3m', label: 'Last 3 months', months: 3 },
  { id: '6m', label: 'Last 6 months', months: 6 },
  { id: '1y', label: 'Last 1 year', months: 12 },
];

export function filterRowsByPeriod(rows, dateFields, preset) {
  const config = EXPORT_PERIOD_PRESETS.find((p) => p.id === preset);
  if (!config || config.months == null || !Array.isArray(rows)) return rows || [];
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - config.months);
  const fields = Array.isArray(dateFields) ? dateFields : [dateFields];
  return rows.filter((row) => {
    for (const f of fields) {
      const v = row?.[f];
      if (!v) continue;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d >= cutoff;
    }
    return false;
  });
}

export function exportToCSV(filename, rows, columns) {
  if (!rows || rows.length === 0) return;

  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers = columns.map((col) => escapeCsv(col.label)).join(',');
  const csvRows = rows.map((row) => {
    return columns.map((col) => {
      const val = typeof col.value === 'function' ? col.value(row) : row[col.id];
      return escapeCsv(val);
    }).join(',');
  });

  const csvContent = [headers, ...csvRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
