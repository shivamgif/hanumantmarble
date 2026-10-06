// GST invoice arithmetic and numbering. Pure — no db/session imports — so the
// invoice form, the API and lib/gst-invoice.test.mjs all compute the same totals.
//
// Rates are EXCLUSIVE of GST, the same as stock_outbound_shipment_items.rate_per_unit,
// so an invoice's taxable total equals the dispatch's total_selling_price_excl.
import { istToday } from './attendance.mjs';

export const DEFAULT_GST_RATE = 18;

// The seeded business's GSTIN (scripts/migrate-sales-invoices.mjs). Approval
// refuses to number an invoice under it — a real GSTIN must be entered first.
export const PLACEHOLDER_GSTIN = '08AAAAA0000A1Z5';

export const GST_STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Format check plus: the first two digits are the registration state. */
export function isValidGstin(gstin, stateCode) {
  const value = String(gstin || '').trim().toUpperCase();
  if (!GSTIN_PATTERN.test(value)) return false;
  return stateCode == null || value.slice(0, 2) === String(stateCode);
}

/**
 * Billable quantity on one invoice line, in the same unit the rate is quoted in.
 * Mirrors netUnitsExpr (lib/stock-analytics-sql.mjs): stone bills square feet,
 * bags bill bags, tile bills whole boxes/pieces.
 */
export function lineQty(row) {
  if (row.itemCategory === 'stone') return Number(row.qtySqft) || 0;
  if (row.itemCategory === 'bag') return Number(row.qtyBags) || 0;
  return Number(row.loadedWholeQty) || 0;
}

export function lineUnit(row) {
  if (row.itemCategory === 'stone') return 'sqft';
  if (row.itemCategory === 'bag') return 'bag';
  return row.sellUnit || 'box';
}

/**
 * Per-line and invoice totals. Same state → CGST + SGST at half the rate each;
 * different states → IGST at the full rate. Tax is rounded per line, so the
 * printed lines always add up to the printed totals.
 */
export function computeInvoiceTotals(items, sellerStateCode, buyerStateCode) {
  const interState = String(sellerStateCode) !== String(buyerStateCode);
  const lines = (items || []).map((row) => {
    const qty = lineQty(row);
    const rate = Number(row.ratePerUnit) || 0;
    const gstRate = Number(row.gstRate ?? DEFAULT_GST_RATE) || 0;
    const taxable = round2(qty * rate);
    const igst = interState ? round2((taxable * gstRate) / 100) : 0;
    const cgst = interState ? 0 : round2((taxable * gstRate) / 200);
    return { qty, unit: lineUnit(row), rate, gstRate, taxable, cgst, sgst: cgst, igst, total: round2(taxable + igst + 2 * cgst) };
  });
  const sum = (key) => round2(lines.reduce((acc, line) => acc + line[key], 0));
  return {
    interState,
    lines,
    taxableTotal: sum('taxable'),
    cgst: sum('cgst'),
    sgst: sum('sgst'),
    igst: sum('igst'),
    grandTotal: sum('total'),
  };
}

/** Indian financial year of an IST date, e.g. 2026-04-01 → '26-27', 2026-03-31 → '25-26'. */
export function fiscalYearOf(isoDate = istToday()) {
  const [year, month] = String(isoDate).split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

/** 'HM', '26-27', 7 → 'HM/26-27/0007'. GST caps invoice numbers at 16 characters. */
export function formatInvoiceNumber(prefix, fiscalYear, seq) {
  return `${prefix}/${fiscalYear}/${String(seq).padStart(4, '0')}`;
}

export const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{1,4}$/;

/** stock_businesses row → the camelCase shape the UI and invoice print use. */
export function serializeBusiness(row) {
  return {
    id: Number(row.id),
    legalName: row.legal_name,
    tradeName: row.trade_name ?? null,
    gstin: row.gstin,
    stateCode: row.state_code,
    stateName: GST_STATES[row.state_code] || null,
    address: row.address ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    bankName: row.bank_name ?? null,
    bankAccount: row.bank_account ?? null,
    bankIfsc: row.bank_ifsc ?? null,
    invoicePrefix: row.invoice_prefix,
    isActive: row.is_active !== false,
    city: row.city ?? null,
    pincode: row.pincode ?? null,
    upiId: row.upi_id ?? null,
    einvoiceEnabled: row.einvoice_enabled !== false,
    ewbThreshold: row.ewb_threshold == null ? 50000 : Number(row.ewb_threshold),
  };
}

// One line as "item|unit|qty|rate", so a dispatch can be compared to the invoice
// it was scanned from regardless of row order.
function lineKey(row) {
  return `${Number(row.itemId)}|${lineUnit(row)}|${lineQty(row)}|${Number(row.ratePerUnit) || 0}`;
}

/**
 * True when a dispatch ships exactly what the invoice bills: same items, units,
 * quantities and rates. Broken stock is never billed, so any broken quantity on
 * a dispatch line means it ships something the invoice does not cover.
 */
export function dispatchMatchesInvoice(invoiceItems, dispatchItems) {
  if ((dispatchItems || []).some((row) => row.fromBroken || Number(row.loadedBrokenQty) > 0)) return false;
  const a = (invoiceItems || []).map(lineKey).sort();
  const b = (dispatchItems || []).map(lineKey).sort();
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** 3933.29 → 'Rupees Three Thousand Nine Hundred Thirty Three and Twenty Nine Paise Only' (Indian lakh/crore grouping). */
export function amountInWords(amount) {
  const paiseTotal = Math.round(Math.abs(Number(amount) || 0) * 100);
  let rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const parts = [];
  for (const [size, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']]) {
    // Above 99 crore the crore count itself is spelled with this same grouping.
    const count = Math.floor(rupees / size);
    if (count) parts.push(`${size === 1e7 && count > 999 ? amountInWords(count).replace(/^Rupees | Only$/g, '') : belowThousand(count)} ${name}`);
    rupees %= size;
  }
  if (rupees) parts.push(belowThousand(rupees));
  const words = parts.join(' ') || 'Zero';
  return `Rupees ${words}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}
