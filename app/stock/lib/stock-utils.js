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
    discountAmount: '',
    notes: '',
  };
}

export function createDispatchItemRow() {
  return {
    itemCategory: 'tile',
    itemId: '',
    itemLabel: '',
    loadedWholeQty: '',
    loadedBrokenQty: '',
    fromBroken: false,
    sellUnit: 'box',
    ratePerUnit: '',
    notes: '',
    returnWholeQty: '',
    returnBrokenQty: '',
    qtyBags: '',
    returnQtyBags: '',
    qtySqft: '',
    returnQtySqft: '',
  };
}

// Volume of one shipment line, in the unit that line is actually stocked in.
// Stone keeps its quantity in received_qty_sqft / qty_sqft, so reading the
// integer whole-qty columns reports 0 for a real delivery.
export function formatLineVolume(item) {
  const uom = item?.unit_of_measure;
  if (uom === 'sqft') {
    const sqft = Number(item.received_qty_sqft ?? item.qty_sqft ?? 0);
    return `${sqft.toLocaleString('en-IN', { maximumFractionDigits: 3 })} sqft`;
  }
  const qty = Number(item?.loaded_whole_qty ?? item?.received_whole_qty ?? 0);
  return uom === 'bag' ? `${qty} bags` : `${qty} U`;
}

// Net volume across a shipment, grouped by unit. Never sums sqft with box
// counts — a mixed total would be a meaningless number.
export function formatShipmentVolume(items) {
  const totals = new Map();
  for (const item of items || []) {
    const uom = item?.unit_of_measure;
    const key = uom === 'sqft' ? 'sqft' : uom === 'bag' ? 'Bags' : 'Whole Units';
    const value = uom === 'sqft'
      ? Number(item.received_qty_sqft ?? item.qty_sqft ?? 0)
      : Number(item.loaded_whole_qty ?? item.received_whole_qty ?? 0);
    totals.set(key, (totals.get(key) || 0) + value);
  }
  const parts = [...totals]
    .filter(([, value]) => value > 0)
    .map(([unit, value]) => `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`);
  return parts.length ? parts.join(' · ') : '0 Whole Units';
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
    discountAmount: '',
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
    transporterUnknown: false,
    transportCost: '',
    laborCost: '',
    handlingCostPercent: '0',
    fuelCostPercent: '0',
    gstPercent: '18.0',
    freightWeightKg: '',
    discountAmount: '',
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
    salespersonUserId: '',
    dispatchDate: `${dateStr}T${timeStr}`,
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createBagDispatchItemRow()],
  };
}

export function createStoneArrivalItemRow() {
  return {
    itemCategory: 'stone',
    itemId: '',
    itemName: '',
    brandName: '',
    typeName: '',
    sizeLabel: '',
    qtySqft: '',
    ratePerSqft: '',
    thicknessMm: '',
    hsnCode: '',
    description: '',
    discountAmount: '',
    notes: '',
  };
}


export function createInitialStoneArrivalDraft() {
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
    transporterUnknown: false,
    transportCost: '',
    laborCost: '',
    handlingCostPercent: '0',
    fuelCostPercent: '0',
    // Stone is taxed at 5%, tiles at 18%.
    gstPercent: '5.0',
    freightWeightKg: '',
    discountAmount: '',
    notes: '',
    items: [createStoneArrivalItemRow()],
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
    transporterUnknown: false,
    transportCost: '',
    laborCost: '',
    handlingCostPercent: '1.0',
    fuelCostPercent: '5.0',
    gstPercent: '18.0',
    freightWeightKg: '',
    discountAmount: '',
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
    salespersonUserId: '',
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

export function parseSizeLabelDimensions(sizeLabel) {
  const clean = trimText(sizeLabel).toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(mm)?$/i);
  if (!match) return null;
  const w = Number(match[1]);
  const l = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) return null;
  return { widthMm: w, lengthMm: l };
}

export function parseSizeLabelSqm(sizeLabel) {
  const clean = trimText(sizeLabel).toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(mm)?$/i);
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

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
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

// ====== SHOWROOM MOVEMENTS ======
// Shared by the item preview sheet's Showroom section and the Showroom tab so
// both render the same labels and the same unit-aware quantity.
// Keys must match SHOWROOM_MOVES in lib/stock-showroom.js.
export const SHOWROOM_ACTIONS = {
  to_cassette: { label: 'Sent to showroom, on a cassette', short: 'To cassette', tone: 'text-violet-500' },
  to_installed: { label: 'Sent to showroom, installed as flooring', short: 'To installed', tone: 'text-amber-500' },
  to_warehouse: { label: 'Back to warehouse', short: 'To warehouse', tone: 'text-emerald-500' },
  reclassify_installed: { label: 'Re-marked as installed', short: 'Now installed', tone: 'text-amber-500' },
  reclassify_cassette: { label: 'Re-marked as on a cassette', short: 'Now on cassette', tone: 'text-violet-500' },
};

// Both showroom moves are movement_type 'transfer_out', so the state cannot be
// recovered from it — the route writes the move key into source_type instead.
export function showroomActionOf(movement) {
  const key = String(movement?.source_type || '').replace(/^showroom_/, '');
  return SHOWROOM_ACTIONS[key] ? key : null;
}

// Stone quantity rides on quantity_sqft; everything else on quantity. NUMERIC
// arrives from pg as a string, so coerce before formatting.
export function formatShowroomQty(movement) {
  if (movement?.unit_of_measure === 'sqft') {
    return `${Number(movement.quantity_sqft || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} sqft`;
  }
  const unit = movement?.unit_of_measure === 'bag' ? 'bags' : 'box';
  return `${Number(movement?.quantity || 0)} ${unit}`;
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

export function findActiveItemByNameAndGrade(activeItems, name, grade) {
  const normalizedName = normalizeItemKey(name);
  const normalizedGrade = normalizeItemKey(grade);
  if (!normalizedName || !normalizedGrade) return null;
  return (activeItems || []).find((item) => (
    normalizeItemKey(item.name) === normalizedName && normalizeItemKey(item.grade) === normalizedGrade
  )) || null;
}

export async function fetchDashboardData() {
  const response = await fetch('/api/stock/dashboard');
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || json.message || 'Fetch failed');
  return json;
}

export async function fetchArrivals({ page = 1, pageSize = 25, search = '', sortKey = 'datetime', sortDir = 'desc' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortKey,
    sortDir,
  });
  if (search) params.set('search', search);
  const response = await fetch(`/api/stock/arrivals?${params}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || json.message || 'Fetch failed');
  return json;
}

export async function fetchDispatches({ page = 1, pageSize = 25, search = '', sortKey = 'datetime', sortDir = 'desc' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortKey,
    sortDir,
  });
  if (search) params.set('search', search);
  const response = await fetch(`/api/stock/dispatches?${params}`);
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
export const FORM_INPUT_CLASS = 'w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-brand-primary/50 focus:ring-4 focus:ring-brand-primary/10';
export const FORM_CARD_CLASS = 'glass-panel rounded-2xl p-4 sm:p-5 transition-[box-shadow,border-color] duration-200';

// Panel header action pills. Tighter padding/tracking below sm so three of them
// still fit a 360px viewport; the row that holds them must be flex-wrap.
const PILL_BASE = 'flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-full px-3 py-2 sm:px-4 text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
export const PILL_BUTTON_CLASS = `${PILL_BASE} border border-slate-200/60 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800`;
export const PILL_PRIMARY_BUTTON_CLASS = `${PILL_BASE} bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90`;
export const PILL_ROW_CLASS = 'mb-6 flex flex-wrap items-center justify-end gap-2 sm:gap-3';

export const CLASSES = {
  contentWrap: 'mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-6',
  topCard: 'glass-panel rounded-2xl p-4 sm:p-6 lg:p-8',
  interactiveCard: 'glass-panel rounded-2xl transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover',
  card: 'glass-panel rounded-2xl p-4 sm:p-6 lg:p-8 transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover group/card',
  cardCompact: 'glass-panel rounded-2xl p-3 sm:p-4 lg:p-6 transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover group/card',
  title: 'text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 dark:text-slate-400 group-hover/card:text-brand-primary transition-colors',
  grid: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6',
  statGrid: 'grid grid-cols-2 gap-3 lg:grid-cols-4',
  statCard: 'min-w-0 glass-panel rounded-2xl p-4 sm:p-5 transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover',
  statLabel: 'text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400',
  statValue: 'mt-1.5 text-2xl font-black text-slate-900 sm:text-3xl dark:text-slate-100 leading-none tracking-tighter',
  iconButton: 'h-8 w-8 rounded-lg hover:bg-slate-100 transition-colors active:scale-95 dark:hover:bg-slate-800 focus-ring',
  mobileScroll: 'flex overflow-x-auto no-scrollbar gap-2 pb-2 snap-x snap-mandatory overscroll-x-contain',
};

export const INVOICE_CLASSES = {
  surface: 'glass-panel rounded-2xl overflow-hidden',
  commandCard: 'glass-panel rounded-2xl p-5 m-4',
  supplierTitle: 'text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tighter',
  supplierMeta: 'mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 opacity-70',
  logisticsGrid: 'grid grid-cols-2 overflow-hidden rounded-2xl border border-border/60',
  logisticsCell: 'border-b border-r border-border/60 bg-card p-4 last:border-r-0',
  logisticsLabel: 'flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary opacity-80',
  logisticsValue: 'mt-2 text-sm font-black tracking-tight text-slate-900 dark:text-slate-100',
  subBar: 'flex flex-wrap gap-6 rounded-xl bg-muted px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300',
  tableWrap: 'overflow-hidden rounded-2xl border border-border/60 max-h-[60vh] overflow-y-auto no-scrollbar',
  tableHead: 'bg-muted/90 text-slate-700 dark:text-slate-100 text-[9px] font-black uppercase tracking-[0.25em] sticky top-0 z-20 backdrop-blur-sm',
  tableHeadCell: 'px-5 py-4',
  tableRow: 'border-b border-border hover:bg-muted/50 transition-colors duration-150',
  tableCell: 'px-5 py-4 text-sm font-medium text-slate-700 dark:text-slate-200',
  monoCell: 'font-mono text-sm font-bold text-slate-800 dark:text-slate-100',
  mobileGrid: 'space-y-4',
  mobileCard: 'glass-panel rounded-2xl p-5 relative overflow-hidden group',
  mobileCardHeader: 'absolute top-0 right-0 rounded-bl-xl bg-muted px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-100',
  mobileKey: 'text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 dark:text-slate-400',
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
