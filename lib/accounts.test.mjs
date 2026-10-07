// Run: node lib/accounts.test.mjs
import assert from 'node:assert/strict';
import {
  ageBucket, allocateFifo, assertBalanced, canonicalGroup, expenseLines, formatVoucherNumber, openingLines,
  parseAmount, parseCsv, parseOpeningBills, parseTrialBalance, purchaseLines, salesInvoiceLines, settlementLines, toIsoDate,
} from './accounts.mjs';
import { computeInvoiceTotals } from './gst-invoice.mjs';

const L = { sales: 1, purchases: 2, output_cgst: 3, output_sgst: 4, output_igst: 5, input_cgst: 6, input_sgst: 7, input_igst: 8, round_off: 9 };
const sum = (lines) => Math.round(lines.reduce((s, l) => s + l.amount * 100, 0));

// Sales: Dr party = grand total, Cr sales + output tax, balanced to the paisa.
{
  const totals = computeInvoiceTotals([{ itemCategory: 'tile', loadedWholeQty: 10, ratePerUnit: 333.33, gstRate: 18 }], '08', '08');
  const lines = salesInvoiceLines({ totals, partyLedgerId: 50, ledgers: L, billRef: 'HM/26-27/0001', billDate: '2026-10-07' });
  assert.equal(sum(lines), 0);
  assert.deepEqual(lines[0], { ledgerId: 50, amount: totals.grandTotal, billRefType: 'new', billRef: 'HM/26-27/0001', billDate: '2026-10-07', locationId: null });
  assert.equal(lines.find((l) => l.ledgerId === L.output_cgst).amount, -300);
  assert.ok(!lines.some((l) => l.ledgerId === L.output_igst), 'no zero IGST line');
}

// Purchase with ITC: 118 incl. 18% GST, intra-state → 100 + 9 + 9.
{
  const lines = purchaseLines({ grandTotal: 118, gstPercent: 18, interState: false, claimItc: true, partyLedgerId: 60, ledgers: L, billRef: 'S-1', billDate: '2026-10-01' });
  assert.equal(sum(lines), 0);
  assert.equal(lines.find((l) => l.ledgerId === L.purchases).amount, 100);
  assert.equal(lines.find((l) => l.ledgerId === L.input_cgst).amount, 9);
  assert.equal(lines.find((l) => l.ledgerId === 60).amount, -118);
  // Unregistered supplier: no input credit, the whole bill is purchase cost.
  const urp = purchaseLines({ grandTotal: 118, gstPercent: 18, interState: false, claimItc: false, partyLedgerId: 60, ledgers: L, billRef: 'S-2' });
  assert.equal(urp.find((l) => l.ledgerId === L.purchases).amount, 118);
  assert.equal(urp.length, 2);
  // Odd paise split cleanly between CGST and SGST.
  const odd = purchaseLines({ grandTotal: 100.01, gstPercent: 18, interState: false, claimItc: true, partyLedgerId: 60, ledgers: L, billRef: 'S-3' });
  assert.equal(sum(odd), 0);
}

// Receipt: Dr bank, Cr party against two bills, remainder on account.
{
  const lines = settlementLines({ kind: 'receipt', partyLedgerId: 50, cashBankLedgerId: 70, amount: 1000,
    allocations: [{ billRef: 'A', amount: 600 }, { billRef: 'B', amount: 300 }] });
  assert.equal(sum(lines), 0);
  assert.equal(lines[0].amount, 1000);
  assert.deepEqual(lines.filter((l) => l.ledgerId === 50).map((l) => [l.billRefType, l.amount]), [['against', -600], ['against', -300], ['on_account', -100]]);
  assert.throws(() => settlementLines({ kind: 'receipt', partyLedgerId: 50, cashBankLedgerId: 70, amount: 100, allocations: [{ billRef: 'A', amount: 200 }] }), /more than/);
  const pay = settlementLines({ kind: 'payment', partyLedgerId: 60, cashBankLedgerId: 70, amount: 500 });
  assert.deepEqual(pay.map((l) => l.amount), [-500, 500]);
}

// Expense with GST: 1180 incl. 18% → 1000 + 90 + 90.
{
  const lines = expenseLines({ expenseLedgerId: 80, cashBankLedgerId: 70, amount: 1180, gstRate: 18, ledgers: L });
  assert.deepEqual(lines.map((l) => l.amount), [1000, 90, 90, -1180]);
  assert.deepEqual(expenseLines({ expenseLedgerId: 80, cashBankLedgerId: 70, amount: 500 }).map((l) => l.amount), [500, -500]);
}

assert.throws(() => assertBalanced([{ amount: 1 }, { amount: -0.99 }]), /does not balance/);
assert.deepEqual(allocateFifo(700, [{ billRef: 'A', balance: 500 }, { billRef: 'B', balance: 500 }]), [{ billRef: 'A', amount: 500 }, { billRef: 'B', amount: 200 }]);
assert.equal(ageBucket(0), 'current');
assert.equal(ageBucket(45), '31-60');
assert.equal(ageBucket(120), '90+');
assert.equal(formatVoucherNumber('receipt', '26-27', 12), 'RCT/26-27/0012');
assert.equal(canonicalGroup('sundry debtors'), 'Sundry Debtors');

// Tally exports.
assert.equal(parseAmount('1,23,456.50 Dr'), 123456.5);
assert.equal(parseAmount('500Cr'), -500);
assert.equal(parseAmount('(250.00)'), -250);
assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n'), [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
assert.equal(toIsoDate('7-Oct-26'), '2026-10-07');
assert.equal(toIsoDate('07/10/2026'), '2026-10-07');

{
  const tb = parseTrialBalance('Ledger,Group,Debit,Credit\nShree Builders,Sundry Debtors,"1,500.00",\nCapital,Capital Account,,"1,000.00"\nCash,Cash-in-Hand,200,\nOdd,My Custom Group,1,\nGrand Total,,1700,1000\n');
  assert.equal(tb.entries.length, 3);
  assert.match(tb.errors[0], /My Custom Group/);
  const bills = parseOpeningBills("Date,Ref. No.,Party's Name,Pending Amount\n01-09-2026,INV-9,Shree Builders,1000 Dr\n");
  assert.deepEqual(bills.bills, [{ party: 'Shree Builders', billRef: 'INV-9', billDate: '2026-09-01', amount: 1000 }]);
  const ids = new Map([['shree builders', 50], ['capital', 51], ['cash', 52]]);
  const lines = openingLines({ entries: tb.entries, bills: bills.bills, ledgerIdByName: ids, differenceLedgerId: 99 });
  assert.equal(sum(lines), 0);
  assert.deepEqual(lines.filter((l) => l.ledgerId === 50).map((l) => [l.billRefType, l.amount]), [['new', 1000], ['on_account', 500]]);
  assert.equal(lines.find((l) => l.ledgerId === 99).amount, -700); // 1700 Dr vs 1000 Cr
}

console.log('accounts: all checks passed');
