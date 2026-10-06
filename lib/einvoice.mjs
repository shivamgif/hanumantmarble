// E-invoice (IRN) files for the government Invoice Registration Portal.
// Pure — no db/session imports — so it is tested by lib/einvoice.test.mjs.
//
// Format: IRP e-invoice schema v1.1 (INV-01). We generate the JSON, someone
// uploads it on the portal's bulk upload, and the portal's response file comes
// back through parseIrpResponse. Swapping to a GSP API later only replaces the
// upload step, not this file.
import { computeInvoiceTotals, lineUnit } from './gst-invoice.mjs';

// Unit Quantity Codes the portal accepts, for the units this business sells in.
export const UQC = { box: 'BOX', piece: 'PCS', bag: 'BAG', sqft: 'SQF' };

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** First line → Addr1, the rest → Addr2; the portal caps each at 100 characters. */
export function splitAddress(text) {
  const lines = String(text || '').split(/\r?\n|,\s*/).map((l) => l.trim()).filter(Boolean);
  const addr1 = (lines.shift() || '').slice(0, 100);
  const addr2 = lines.join(', ').slice(0, 100);
  return { addr1, addr2: addr2 || undefined };
}

/** Portal phone fields take 6–12 digits; anything else is dropped rather than rejected. */
export function portalPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return digits.length >= 6 && digits.length <= 12 ? digits : undefined;
}

/** '2026-10-07' → '07/10/2026'. */
export function portalDate(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

const isPin = (pin) => /^[1-9]\d{5}$/.test(String(pin || ''));

/** Everything the portal will reject, listed up front instead of one upload at a time. */
export function einvoiceProblems(invoice, business) {
  const problems = [];
  if (!business?.gstin) problems.push('Business GSTIN is missing.');
  if (!splitAddress(business?.address).addr1) problems.push('Business address is missing.');
  if (!business?.city) problems.push('Business city is missing (Branches → Businesses).');
  if (!isPin(business?.pincode)) problems.push('Business PIN code is missing (Branches → Businesses).');
  if (!invoice.bill_to_gstin) problems.push('Customer GSTIN is missing — B2C invoices do not need an IRN.');
  if (!splitAddress(invoice.bill_to_address).addr1) problems.push('Customer billing address is missing.');
  if (!invoice.bill_to_city) problems.push('Customer city is missing.');
  if (!isPin(invoice.bill_to_pincode)) problems.push('Customer PIN code is missing.');
  if (!invoice.invoice_number) problems.push('Invoice is not approved yet.');
  return problems;
}

/** One invoice as an IRP v1.1 document. Throws with every problem if it cannot be uploaded. */
export function buildEinvoiceJson(invoice, business) {
  const problems = einvoiceProblems(invoice, business);
  if (problems.length) throw new Error(`${invoice.invoice_number || `Estimate #${invoice.id}`}: ${problems.join(' ')}`);

  const totals = computeInvoiceTotals(invoice.items, business.stateCode, invoice.bill_to_state_code);
  const seller = splitAddress(business.address);
  const buyer = splitAddress(invoice.bill_to_address);

  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: invoice.invoice_number, Dt: portalDate(invoice.invoice_date_text) },
    SellerDtls: {
      Gstin: business.gstin,
      LglNm: business.legalName,
      TrdNm: business.tradeName || undefined,
      Addr1: seller.addr1,
      Addr2: seller.addr2,
      Loc: business.city,
      Pin: Number(business.pincode),
      Stcd: business.stateCode,
      Ph: portalPhone(business.phone),
      Em: business.email || undefined,
    },
    BuyerDtls: {
      Gstin: invoice.bill_to_gstin,
      LglNm: invoice.bill_to_name,
      Pos: invoice.bill_to_state_code,
      Addr1: buyer.addr1,
      Addr2: buyer.addr2,
      Loc: invoice.bill_to_city,
      Pin: Number(invoice.bill_to_pincode),
      Stcd: invoice.bill_to_gstin.slice(0, 2),
      Ph: portalPhone(invoice.bill_to_phone),
    },
    ItemList: invoice.items.map((item, index) => {
      const line = totals.lines[index];
      return {
        SlNo: String(index + 1),
        PrdDesc: String(item.itemLabel || '').slice(0, 300),
        IsServc: 'N',
        HsnCd: item.hsnCode,
        Qty: round3(line.qty),
        Unit: UQC[lineUnit(item)] || 'OTH',
        UnitPrice: round3(line.rate),
        TotAmt: line.taxable,
        Discount: 0,
        AssAmt: line.taxable,
        GstRt: line.gstRate,
        IgstAmt: line.igst,
        CgstAmt: line.cgst,
        SgstAmt: line.sgst,
        TotItemVal: line.total,
      };
    }),
    ValDtls: {
      AssVal: totals.taxableTotal,
      CgstVal: totals.cgst,
      SgstVal: totals.sgst,
      IgstVal: totals.igst,
      TotInvVal: totals.grandTotal,
    },
  };
}

/**
 * The portal's signed QR is a JWT whose payload's `data` field is JSON naming
 * the document (DocNo, SellerGstin, Irn, …). Reading it lets the import match
 * results to invoices no matter how the response file is wrapped.
 * Signature not verified: that needs the portal's public key. ponytail: add
 * verification if responses ever arrive from anywhere but our own upload.
 */
export function decodeSignedQr(token) {
  try {
    const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    return typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data || payload;
  } catch {
    return null;
  }
}

/**
 * Pull every generated IRN out of a portal response file — a single API
 * response, an array, or a bulk-download wrapper. Returns
 * [{ docNo, irn, ackNo, ackDate, signedQr, sellerGstin }].
 */
export function parseIrpResponse(json) {
  const found = [];
  const walk = (node) => {
    // API responses carry the result as a JSON string in `Data`.
    if (typeof node === 'string') {
      if (node.trim().startsWith('{') || node.trim().startsWith('[')) {
        try { walk(JSON.parse(node)); } catch { /* not JSON, ignore */ }
      }
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const signedQr = node.SignedQRCode || node.SignedQrCode;
    if (signedQr || (node.Irn && node.AckNo)) {
      const qr = signedQr ? decodeSignedQr(signedQr) : null;
      found.push({
        docNo: qr?.DocNo || node.DocNo || node.DocDtls?.No || null,
        irn: node.Irn || qr?.Irn || null,
        ackNo: node.AckNo != null ? String(node.AckNo) : null,
        ackDate: node.AckDt || null,
        signedQr: signedQr || null,
        sellerGstin: qr?.SellerGstin || null,
      });
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(json);
  return found.filter((row) => row.docNo && row.irn);
}
