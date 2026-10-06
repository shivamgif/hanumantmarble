// Run: node lib/einvoice.test.mjs
import assert from 'node:assert/strict';
import { buildEinvoiceJson, decodeSignedQr, einvoiceProblems, parseIrpResponse, portalPhone, splitAddress } from './einvoice.mjs';
import { buildEwbJson, needsEwayBill, portalVehicleNo } from './ewaybill.mjs';

const business = {
  gstin: '08AABCH1234F1Z5', legalName: 'Hanumant Marble Pvt Ltd', tradeName: 'Hanumant Marble',
  stateCode: '08', address: 'Plot 12, RIICO Area\nKishangarh', city: 'Kishangarh', pincode: '305801',
  phone: '+91 98765 43210', email: 'accounts@example.com', ewbThreshold: 50000,
};
const invoice = {
  id: 7, invoice_number: 'HM/26-27/0001', invoice_date_text: '2026-10-07',
  bill_to_name: 'Shree Builders', bill_to_gstin: '24AAACS1234B1Z2', bill_to_state_code: '24',
  bill_to_address: '45 Ring Road', bill_to_city: 'Ahmedabad', bill_to_pincode: '380001', bill_to_phone: '9898989898',
  grand_total: '64900.00',
  items: [
    { itemId: '5', itemLabel: 'GVT-6060 - Glazed Vitrified 600x600', itemCategory: 'tile', sellUnit: 'box', loadedWholeQty: 100, ratePerUnit: 500, gstRate: 18, hsnCode: '690721' },
    { itemId: '9', itemLabel: 'KOTA-GRN - Kota Green', itemCategory: 'stone', qtySqft: 120.5, ratePerUnit: 40, gstRate: 5, hsnCode: '680299' },
  ],
};

// E-invoice: inter-state (08 → 24), so IGST.
{
  const doc = buildEinvoiceJson(invoice, business);
  assert.equal(doc.Version, '1.1');
  assert.deepEqual(doc.DocDtls, { Typ: 'INV', No: 'HM/26-27/0001', Dt: '07/10/2026' });
  assert.equal(doc.SellerDtls.Pin, 305801);
  assert.equal(doc.SellerDtls.Ph, '9876543210');
  assert.equal(doc.BuyerDtls.Pos, '24');
  assert.equal(doc.ItemList[0].Unit, 'BOX');
  assert.equal(doc.ItemList[1].Unit, 'SQF');
  assert.equal(doc.ItemList[0].IgstAmt, 9000);
  assert.equal(doc.ItemList[1].AssAmt, 4820);
  assert.equal(doc.ValDtls.IgstVal, 9241);
  assert.equal(doc.ValDtls.TotInvVal, 64061); // 54,820 taxable + 9,241 IGST
  assert.equal(doc.ValDtls.CgstVal, 0);
}

// Everything missing is reported at once, not one upload at a time.
assert.equal(einvoiceProblems({ ...invoice, bill_to_gstin: null, bill_to_pincode: '' }, { ...business, city: '' }).length, 3);
assert.throws(() => buildEinvoiceJson({ ...invoice, bill_to_pincode: '12' }, business), /PIN/);

assert.deepEqual(splitAddress('Plot 12, RIICO Area\nKishangarh'), { addr1: 'Plot 12', addr2: 'RIICO Area, Kishangarh' });
assert.equal(portalPhone('12'), undefined);

// Portal response: matched by the DocNo inside the signed QR, whatever the wrapper.
{
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  const qr = `${b64({ alg: 'RS256' })}.${b64({ data: JSON.stringify({ DocNo: 'HM/26-27/0001', Irn: 'a'.repeat(64), SellerGstin: business.gstin }) })}.sig`;
  assert.equal(decodeSignedQr(qr).DocNo, 'HM/26-27/0001');

  const apiStyle = { Status: 1, Data: JSON.stringify({ AckNo: 112010000000001, AckDt: '2026-10-07 12:00:00', Irn: 'a'.repeat(64), SignedQRCode: qr }) };
  const [row] = parseIrpResponse(apiStyle);
  assert.deepEqual(
    { docNo: row.docNo, irn: row.irn, ackNo: row.ackNo, sellerGstin: row.sellerGstin },
    { docNo: 'HM/26-27/0001', irn: 'a'.repeat(64), ackNo: '112010000000001', sellerGstin: business.gstin }
  );
  assert.equal(parseIrpResponse([{ results: { message: { AckNo: 1, Irn: 'b'.repeat(64), SignedQRCode: qr } } }]).length, 1);
  assert.equal(parseIrpResponse({ unrelated: true }).length, 0);
}

// E-way bill.
{
  const shipment = { truck_license_plate_snapshot: 'rj 14-xy 0000' };
  assert.equal(portalVehicleNo(shipment.truck_license_plate_snapshot), 'RJ14XY0000');
  const ewb = buildEwbJson(shipment, invoice, business).billLists[0];
  assert.equal(ewb.toGstin, '24AAACS1234B1Z2');
  assert.equal(ewb.toStateCode, 24);
  assert.equal(ewb.igstValue, 9241);
  assert.equal(ewb.mainHsnCode, 690721);
  assert.equal(ewb.itemList[0].igstRate, 18);
  assert.equal(ewb.transDistance, 0);
  assert.equal(buildEwbJson(shipment, { ...invoice, bill_to_gstin: null }, business).billLists[0].toGstin, 'URP');
  assert.throws(() => buildEwbJson({}, invoice, business), /Truck/);
  assert.equal(needsEwayBill(invoice, business), true);
  assert.equal(needsEwayBill({ grand_total: '50000' }, business), false);
}

console.log('einvoice: all checks passed');
