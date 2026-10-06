// E-way bill bulk-upload JSON for a dispatch registered from a tax invoice.
// Pure — tested by lib/einvoice.test.mjs.
//
// Format: the e-way bill portal's bulk generation JSON (version 1.0.0621).
// Generated when the truck is known (dispatch), uploaded on the portal, and the
// 12-digit e-way bill number is typed back onto the dispatch.
//
// transDistance 0 asks the portal to work the distance out from the two PIN
// codes, so nobody has to type kilometres.
import { computeInvoiceTotals, lineUnit } from './gst-invoice.mjs';
import { portalDate, splitAddress, UQC } from './einvoice.mjs';

export const EWB_NUMBER_PATTERN = /^\d{12}$/;

/** 'RJ 14-XY 0000' → 'RJ14XY0000', the form the portal accepts. */
export function portalVehicleNo(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Missing data, listed up front. */
export function ewbProblems(invoice, business, vehicleNo) {
  const problems = [];
  if (!invoice?.invoice_number) problems.push('The dispatch is not linked to an issued invoice.');
  if (!business?.city || !/^[1-9]\d{5}$/.test(String(business?.pincode || ''))) problems.push('Business city or PIN code is missing.');
  if (!/^[1-9]\d{5}$/.test(String(invoice?.ship_to_pincode || invoice?.bill_to_pincode || ''))) problems.push('Customer PIN code is missing.');
  if (!vehicleNo) problems.push('Truck number is missing on the dispatch.');
  return problems;
}

export function buildEwbJson(shipment, invoice, business) {
  const vehicleNo = portalVehicleNo(shipment.truck_license_plate_snapshot || shipment.truck_number_snapshot);
  const problems = ewbProblems(invoice, business, vehicleNo);
  if (problems.length) throw new Error(problems.join(' '));

  const totals = computeInvoiceTotals(invoice.items, business.stateCode, invoice.bill_to_state_code);
  const from = splitAddress(business.address);
  const to = splitAddress(invoice.ship_to_address || invoice.bill_to_address);
  const mainLine = totals.lines.reduce((best, line, i) => (line.taxable > totals.lines[best].taxable ? i : best), 0);

  return {
    version: '1.0.0621',
    billLists: [{
      userGstin: business.gstin,
      supplyType: 'O',
      subSupplyType: 1,
      subSupplyDesc: '',
      docType: 'INV',
      docNo: invoice.invoice_number,
      docDate: portalDate(invoice.invoice_date_text),
      transactionType: 1,
      fromGstin: business.gstin,
      fromTrdName: business.tradeName || business.legalName,
      fromAddr1: from.addr1,
      fromAddr2: from.addr2 || '',
      fromPlace: business.city,
      fromPincode: Number(business.pincode),
      fromStateCode: Number(business.stateCode),
      actFromStateCode: Number(business.stateCode),
      toGstin: invoice.bill_to_gstin || 'URP',
      toTrdName: invoice.bill_to_name,
      toAddr1: to.addr1,
      toAddr2: to.addr2 || '',
      toPlace: invoice.bill_to_city || '',
      toPincode: Number(invoice.ship_to_pincode || invoice.bill_to_pincode),
      toStateCode: Number(invoice.bill_to_state_code),
      actToStateCode: Number(invoice.bill_to_state_code),
      totalValue: totals.taxableTotal,
      cgstValue: totals.cgst,
      sgstValue: totals.sgst,
      igstValue: totals.igst,
      cessValue: 0,
      cessNonAdvolValue: 0,
      otherValue: 0,
      totInvValue: totals.grandTotal,
      transMode: 1,
      transDistance: 0,
      transporterName: '',
      transporterId: '',
      transDocNo: '',
      transDocDate: '',
      vehicleNo,
      vehicleType: 'R',
      mainHsnCode: Number(invoice.items[mainLine].hsnCode),
      itemList: invoice.items.map((item, index) => {
        const line = totals.lines[index];
        return {
          itemNo: index + 1,
          productName: String(item.itemLabel || '').slice(0, 100),
          productDesc: String(item.itemLabel || '').slice(0, 100),
          hsnCode: Number(item.hsnCode),
          quantity: line.qty,
          qtyUnit: UQC[lineUnit(item)] || 'OTH',
          taxableAmount: line.taxable,
          cgstRate: totals.interState ? 0 : line.gstRate / 2,
          sgstRate: totals.interState ? 0 : line.gstRate / 2,
          igstRate: totals.interState ? line.gstRate : 0,
          cessRate: 0,
          cessNonAdvol: 0,
        };
      }),
    }],
  };
}

/** Over the business's threshold an e-way bill is needed before the truck leaves. */
export function needsEwayBill(invoice, business) {
  return Number(invoice?.grand_total || 0) > Number(business?.ewbThreshold ?? 50000);
}
