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
    tripId: '',
    tripChoice: '',
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
  return {
    customerName: '',
    customerPhoneNumber: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    salespersonUserId: '',
    // Left blank on purpose: this is the invoice date, not the entry date. A
    // prefilled "today" got saved unread and landed sales in the wrong month.
    dispatchDate: '',
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
    tripId: '',
    tripChoice: '',
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
    tripId: '',
    tripChoice: '',
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
  return {
    customerName: '',
    customerId: '',
    customerPhoneNumber: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    salespersonUserId: '',
    // Blank on purpose — see createInitialBagDispatchDraft.
    dispatchDate: '',
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
    case 'admin': return 'border-border bg-muted text-rose-700';
    case 'manager': return 'border-border bg-muted text-blue-700';
    case 'salesperson': return 'border-border bg-muted text-emerald-700';
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
  to_cassette: { label: 'Sent to showroom, on a cassette', short: 'To cassette', tone: 'text-violet-700 dark:text-violet-400' },
  to_installed: { label: 'Sent to showroom, installed as flooring', short: 'To installed', tone: 'text-amber-700 dark:text-amber-400' },
  to_warehouse: { label: 'Back to warehouse', short: 'To warehouse', tone: 'text-emerald-700 dark:text-emerald-400' },
  reclassify_installed: { label: 'Re-marked as installed', short: 'Now installed', tone: 'text-amber-700 dark:text-amber-400' },
  reclassify_cassette: { label: 'Re-marked as on a cassette', short: 'Now on cassette', tone: 'text-violet-700 dark:text-violet-400' },
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

// Last good response per URL, for the life of the tab: a page shows it at once
// on a revisit (onCached), then swaps in the fresh fetch. Switching company or
// signing out is a full page load, so it never crosses tenants or users.
// ponytail: plain Map capped at 50 URLs, oldest out; enough for page/search combos.
const lastJson = new Map();

export async function getJson(url, onCached) {
  if (onCached && lastJson.has(url)) onCached(lastJson.get(url));
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || json.message || 'Fetch failed');
  lastJson.delete(url);
  lastJson.set(url, json);
  if (lastJson.size > 50) lastJson.delete(lastJson.keys().next().value);
  return json;
}

export async function fetchDashboardData(onCached) {
  return getJson('/api/stock/dashboard', onCached);
}

export async function fetchArrivals({ page = 1, pageSize = 25, search = '', sortKey = 'datetime', sortDir = 'desc' } = {}, onCached) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortKey,
    sortDir,
  });
  if (search) params.set('search', search);
  return getJson(`/api/stock/arrivals?${params}`, onCached);
}

export async function fetchDispatches({ page = 1, pageSize = 25, search = '', sortKey = 'datetime', sortDir = 'desc' } = {}, onCached) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortKey,
    sortDir,
  });
  if (search) params.set('search', search);
  return getJson(`/api/stock/dispatches?${params}`, onCached);
}

// Arrivals/dispatches are server-paginated, so the visible page is all the
// client holds. Exports need every row, so walk the pages until total is met.
// ponytail: 200 is the server's pageSize cap; a dedicated export endpoint if
// the page count ever grows enough for the round trips to hurt.
export async function fetchAllPages(fetchPage, key) {
  const pageSize = 200;
  const all = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchPage({ page, pageSize });
    const rows = result?.[key] || [];
    all.push(...rows);
    const total = Number(result?.total);
    if (rows.length < pageSize || (Number.isFinite(total) && all.length >= total)) return all;
  }
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

export const FORM_LABEL_CLASS = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2';
export const FORM_INPUT_CLASS = 'w-full rounded-lg border border-input bg-card px-4 py-[7px] text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-brand-primary/15 dark:focus:border-slate-500';
export const FORM_CARD_CLASS = 'glass-panel rounded-lg p-4 sm:p-6';

// One control height across the app: inputs, selects, pills and tab strips
// are all 36px, so a toolbar mixing them lines up.
// Panel header action pills. Smaller text, padding and gap below sm so three of
// them still fit one line on a 360px viewport; the row holding them is flex-wrap.
const PILL_BASE = 'flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2 py-1 sm:px-4 text-[13px] font-medium [&>svg]:h-4 [&>svg]:w-4 transition hover:-translate-y-px hover:shadow-card-hover active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';
export const PILL_BUTTON_CLASS = `${PILL_BASE} border border-border bg-card text-slate-700 hover:bg-muted dark:text-slate-200`;
// Form submit buttons: one 36px row, the same height as the inputs above them.
export const SUBMIT_BUTTON_BASE = 'flex h-9 w-full items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:h-4 [&_svg]:w-4';
export const SUBMIT_BUTTON_CLASS = `${SUBMIT_BUTTON_BASE} bg-primary text-primary-foreground hover:brightness-110`;
export const SUBMIT_SECONDARY_CLASS = `${SUBMIT_BUTTON_BASE} border border-border bg-card text-foreground hover:bg-muted`;
export const PILL_PRIMARY_BUTTON_CLASS = `${PILL_BASE} bg-primary font-semibold text-primary-foreground hover:bg-primary/90`;

// Page tab strips (dashboard, invoices, accounts, analytics, admin, attendance,
// settings). Every tab is a 36px row, icon left of its label. Below sm the
// strip is a grid so labels keep room: four tabs go 2x2 and five or more go
// three across (a 360px phone gives six tabs in one row ~52px each, and
// "Timesheets" needs ~63). From sm up it's a single row.
export const tabTrackClass = (count) => `grid w-full min-w-0 gap-1 rounded-lg bg-muted p-1 scrollbar-none sm:flex sm:w-fit sm:items-center sm:overflow-x-auto ${count > 4 ? 'grid-cols-3' : count === 4 ? 'grid-cols-2' : 'auto-cols-[minmax(0,1fr)] grid-flow-col'}`;

export const tabButtonClass = (isActive) => `relative flex h-9 min-w-0 flex-row items-center justify-center gap-2 rounded-lg px-2 text-[11px] leading-tight transition duration-200 sm:h-8 sm:flex-none sm:px-4 sm:text-[13px] ${isActive
  ? 'glass-chip font-semibold text-slate-900 dark:text-slate-50 [&>svg]:text-brand-primary'
  : 'font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`;

export const CLASSES = {
  contentWrap: 'mx-auto w-full max-w-[1600px] p-4 sm:p-6 space-y-4 sm:space-y-6 animate-rise',
  topCard: 'glass-panel rounded-lg p-4 sm:p-6',
  interactiveCard: 'glass-panel rounded-lg transition-[box-shadow,border-color] duration-200 hover:border-slate-300 dark:hover:border-slate-600',
  card: 'glass-panel rounded-lg p-4 sm:p-6 group/card',
  cardCompact: 'glass-panel rounded-lg p-4 sm:p-4 group/card',
  title: 'text-sm font-semibold text-slate-900 dark:text-slate-100',
  grid: 'grid grid-cols-1 gap-4 lg:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  heroGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5',
  statGrid: 'grid grid-cols-2 gap-4 lg:grid-cols-4',
  statCard: 'min-w-0 glass-panel rounded-lg p-4 sm:p-6',
  statLabel: 'text-xs font-medium text-slate-500 dark:text-slate-400',
  statValue: 'mt-2 text-2xl font-semibold text-slate-900 sm:text-[1.75rem] dark:text-slate-100 leading-none tracking-tight tabular-nums',
  mobileScroll: 'flex overflow-x-auto scrollbar-none gap-2 pb-2 snap-x snap-mandatory overscroll-x-contain',
};

// Every inline error box in the app.
export const ERROR_BOX_CLASS = 'rounded-lg border border-border bg-muted px-4 py-2 text-sm text-rose-700   dark:text-rose-300';

export const INVOICE_CLASSES = {
  surface: 'glass-panel rounded-lg overflow-hidden',
  commandCard: 'glass-panel rounded-lg p-6 m-4',
  supplierTitle: 'text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50',
  supplierMeta: 'mt-1 text-xs text-slate-500 dark:text-slate-400',
  logisticsGrid: 'grid grid-cols-2 overflow-hidden rounded-lg border border-border',
  logisticsCell: 'border-b border-r border-border bg-card px-4 py-4 last:border-r-0',
  logisticsLabel: 'flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 [&>svg]:text-brand-primary',
  logisticsValue: 'mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100',
  subBar: 'flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-muted px-4 py-2 text-[13px] font-medium text-slate-700 dark:text-slate-300',
  tableWrap: 'overflow-hidden rounded-lg border border-border max-h-[60vh] overflow-y-auto scrollbar-none',
  tableHead: 'bg-muted text-slate-500 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-20',
  tableHeadCell: 'px-4 py-2',
  tableRow: 'border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors duration-150',
  tableCell: 'px-4 py-4 text-sm text-slate-700 dark:text-slate-200',
  monoCell: ' text-[13px] font-medium text-slate-800 dark:text-slate-100',
  mobileGrid: 'space-y-4',
  mobileCard: 'glass-panel rounded-lg p-4 relative overflow-hidden group',
  mobileCardHeader: 'absolute top-0 right-0 rounded-bl-lg bg-muted px-2 py-1  text-[11px] font-medium text-slate-600 dark:text-slate-300',
  mobileKey: 'text-xs text-slate-500 dark:text-slate-400',
  mobileValue: 'mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 leading-tight',
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
