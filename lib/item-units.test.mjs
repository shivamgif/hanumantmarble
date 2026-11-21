// Counted-goods types with their own unit (0003_item_type_units.sql).
// Run: node lib/item-units.test.mjs
import assert from 'node:assert/strict';
import { computeInvoiceTotals, dispatchMatchesInvoice, GST_UQC_CODES, lineUnit } from './gst-invoice.mjs';
import { lineUqc } from './einvoice.mjs';

const plainBag = { itemId: '3', itemCategory: 'bag', qtyBags: 10, ratePerUnit: 300, gstRate: 18 };
const roll = { ...plainBag, itemId: '4', unitLabel: 'roll', uqc: 'ROL' };

// Unchanged for every existing line: no label → "bag" / BAG; tile and stone as before.
assert.equal(lineUnit(plainBag), 'bag');
assert.equal(lineUqc(plainBag), 'BAG');
assert.equal(lineUqc({ itemCategory: 'tile', sellUnit: 'box' }), 'BOX');
assert.equal(lineUqc({ itemCategory: 'tile', sellUnit: 'piece' }), 'PCS');
assert.equal(lineUqc({ itemCategory: 'stone' }), 'SQF');

// A typed unit prints on the invoice and goes to the portals.
assert.equal(lineUnit(roll), 'roll');
assert.equal(lineUqc(roll), 'ROL');
assert.equal(lineUqc({ ...plainBag, unitLabel: 'drum' }), 'OTH'); // a label without a code
assert.equal(computeInvoiceTotals([roll], '27', '27').lines[0].unit, 'roll');

// Only counted goods take a type unit; boxes/pieces and sqft keep theirs.
assert.equal(lineUnit({ itemCategory: 'tile', sellUnit: 'box', unitLabel: 'roll' }), 'box');
assert.equal(lineUqc({ itemCategory: 'stone', uqc: 'ROL' }), 'SQF');

// A dispatch line carries no label; it still matches the invoice it came from.
assert.equal(dispatchMatchesInvoice([roll], [{ ...roll, unitLabel: undefined, uqc: undefined }]), true);
assert.equal(dispatchMatchesInvoice([roll], [{ ...roll, qtyBags: 9 }]), false);

assert.equal(GST_UQC_CODES.ROL, 'Rolls');
assert.ok(Object.keys(GST_UQC_CODES).every((code) => /^[A-Z]{3}$/.test(code))); // matches the DB CHECK

console.log('item-units: all checks passed');
