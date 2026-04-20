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
    wholeQty: '0',
    brokenQty: '0',
    notes: '',
  };
}

export function createDispatchItemRow() {
  return {
    itemId: '',
    loadedWholeQty: '0',
    // loadedBrokenQty removed
    notes: '',
    returnWholeQty: '',
    returnBrokenQty: '',
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
    shipmentNumber: '',
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

export const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70';
export const FORM_INPUT_CLASS = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15';
export const FORM_CARD_CLASS = 'rounded-xl border border-border/70 bg-muted/15 p-4';

export const CLASSES = {
  contentWrap: 'mx-auto w-full max-w-[1600px] space-y-5',
  topCard: 'rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700/70 dark:bg-slate-900',
  interactiveCard: 'rounded-xl border border-slate-200/70 bg-white dark:border-slate-700/70 dark:bg-slate-900',
  statGrid: 'grid grid-cols-2 gap-3 lg:grid-cols-4',
  statCard: 'min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 will-change-transform transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300/80 sm:p-5 dark:border-slate-700/70 dark:bg-slate-900 dark:hover:border-slate-600',
  statLabel: 'text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
  statValue: 'mt-1.5 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white',
  iconButton: 'h-8 w-8 rounded-lg hover:bg-slate-100 transition-colors active:scale-95 dark:hover:bg-slate-800',
};

export const INVOICE_CLASSES = {
  surface: 'rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950',
  commandCard: 'rounded-2xl border border-slate-200/80 bg-white p-4 m-4 shadow-sm dark:border-slate-800 dark:bg-slate-950',
  supplierTitle: 'text-xl font-bold text-slate-900 dark:text-white',
  supplierMeta: 'mt-1 text-xs text-slate-500 dark:text-slate-400',
  logisticsGrid: 'grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800',
  logisticsCell: 'border-b border-r border-slate-200 bg-slate-50/50 p-3 last:border-r-0 dark:border-slate-800 dark:bg-slate-900/50',
  logisticsLabel: 'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400',
  logisticsValue: 'mt-1 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100',
  subBar: 'flex flex-wrap gap-6 rounded-lg bg-slate-100 px-4 py-2 text-[10px] font-mono text-slate-500 dark:bg-slate-800/50 dark:text-slate-300',
  tableWrap: 'overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800',
  tableHead: 'bg-slate-900 text-white text-[10px] uppercase tracking-widest',
  tableHeadCell: 'px-4 py-3 font-semibold',
  tableRow: 'border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40',
  tableCell: 'px-4 py-3 text-sm text-slate-700 dark:text-slate-200',
  monoCell: 'font-mono text-sm text-slate-800 dark:text-slate-100',
  mobileGrid: '',
  mobileCard: 'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950',
  mobileCardHeader: 'rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white',
  mobileKey: 'text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400',
  mobileValue: 'font-mono text-xs text-slate-900 dark:text-slate-100',
};
