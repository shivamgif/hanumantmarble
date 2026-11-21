// Run: node lib/tally-xml.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { buildTallyXml, remoteId, tallyDate, xmlEscape } from './tally-xml.mjs';

const ledgers = [
  { name: 'Shree Builders & Sons', group_name: 'Sundry Debtors', gstin: '24AAACS1234B1Z2', state_code: '24' },
  { name: 'Cash Walk-in', group_name: 'Sundry Debtors', gstin: null, state_code: null },
  { name: 'Sales', group_name: 'Sales Accounts' },
  { name: 'Output IGST', group_name: 'Duties & Taxes' },
  { name: 'Cash', group_name: 'Cash-in-Hand' },
];
const sale = {
  id: 41, voucher_type: 'sales', voucher_date: '2026-10-07', voucher_number: 'HM/26-27/0001', reference: 'HM/26-27/0001',
  narration: 'Sales invoice <HM/26-27/0001> to "Shree"', status: 'posted', party_ledger_name: 'Shree Builders & Sons',
  lines: [
    { ledger_name: 'Shree Builders & Sons', amount: '1180.00', bill_ref_type: 'new', bill_ref: 'HM/26-27/0001' },
    { ledger_name: 'Sales', amount: '-1000.00' },
    { ledger_name: 'Output IGST', amount: '-180.00' },
  ],
};
const receipt = {
  id: 42, voucher_type: 'receipt', voucher_date: '2026-10-09', voucher_number: 'RCT/26-27/0001', status: 'cancelled',
  party_ledger_name: 'Shree Builders & Sons',
  lines: [
    { ledger_name: 'Cash', amount: '1500.00' },
    { ledger_name: 'Shree Builders & Sons', amount: '-1180.00', bill_ref_type: 'against', bill_ref: 'HM/26-27/0001' },
    { ledger_name: 'Shree Builders & Sons', amount: '-320.00', bill_ref_type: 'on_account' },
  ],
};
const opening = { id: 1, voucher_type: 'opening', voucher_date: '2026-04-01', status: 'posted', lines: [] };
const payroll = { id: 43, voucher_type: 'payroll', voucher_date: '2026-10-31', voucher_number: 'PAY/26-27/0001', status: 'posted', lines: [] };

const xml = buildTallyXml({ tenantId: 1, ledgers, vouchers: [opening, sale, receipt, payroll] });

// Envelope: no company named, so it imports into the one open in Tally.
assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>'));
assert.ok(!xml.includes('SVCURRENTCOMPANY'));
assert.equal(xml.match(/<IMPORTDATA>/g).length, 1);

// Masters: party ledgers bill-wise with GST details; others just name + group. Names escaped.
assert.ok(xml.includes('<LEDGER NAME="Shree Builders &amp; Sons"><NAME.LIST><NAME>Shree Builders &amp; Sons</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT><ISBILLWISEON>Yes</ISBILLWISEON><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><PARTYGSTIN>24AAACS1234B1Z2</PARTYGSTIN><LEDSTATENAME>Gujarat</LEDSTATENAME>'));
assert.ok(xml.includes('<LEDGER NAME="Cash Walk-in"><NAME.LIST><NAME>Cash Walk-in</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT><ISBILLWISEON>Yes</ISBILLWISEON><GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE><COUNTRYOFRESIDENCE>'));
assert.ok(xml.includes('<LEDGER NAME="Output IGST"><NAME.LIST><NAME>Output IGST</NAME></NAME.LIST><PARENT>Duties &amp; Taxes</PARENT></LEDGER>'));

// Vouchers: opening skipped, payroll as a Journal, stable REMOTEID.
assert.ok(!xml.includes('app-1-1"'));
assert.ok(xml.includes('<VOUCHER REMOTEID="app-1-43" VCHTYPE="Journal"'));
assert.ok(xml.includes('<VOUCHER REMOTEID="app-1-41" VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>20261007</DATE><EFFECTIVEDATE>20261007</EFFECTIVEDATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>HM/26-27/0001</VOUCHERNUMBER>'));
assert.ok(xml.includes('<NARRATION>Sales invoice &lt;HM/26-27/0001&gt; to &quot;Shree&quot;</NARRATION>'));

// Signs: our debit (+) is Tally's ISDEEMEDPOSITIVE Yes with a negative AMOUNT; bills carry the same amount.
assert.ok(xml.includes('<ALLLEDGERENTRIES.LIST><LEDGERNAME>Shree Builders &amp; Sons</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1180.00</AMOUNT><BILLALLOCATIONS.LIST><NAME>HM/26-27/0001</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-1180.00</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>'));
assert.ok(xml.includes('<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1000.00</AMOUNT></ALLLEDGERENTRIES.LIST>'));
assert.ok(xml.includes('<BILLALLOCATIONS.LIST><NAME>HM/26-27/0001</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>1180.00</AMOUNT></BILLALLOCATIONS.LIST>'));
assert.ok(xml.includes('<BILLALLOCATIONS.LIST><BILLTYPE>On Account</BILLTYPE><AMOUNT>320.00</AMOUNT></BILLALLOCATIONS.LIST>'));

// A cancelled voucher goes out marked cancelled, under the same REMOTEID.
assert.ok(/<VOUCHER REMOTEID="app-1-42"[^>]*>.*?<ISCANCELLED>Yes<\/ISCANCELLED>/.test(xml));
assert.ok(/<VOUCHER REMOTEID="app-1-41"[^>]*>.*?<ISCANCELLED>No<\/ISCANCELLED>/.test(xml));

// Every voucher's Tally amounts still sum to zero.
for (const block of xml.split('<VOUCHER ').slice(1)) {
  const entries = [...block.matchAll(/<ALLLEDGERENTRIES\.LIST><LEDGERNAME>[^<]*<\/LEDGERNAME><ISDEEMEDPOSITIVE>\w+<\/ISDEEMEDPOSITIVE><AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)];
  assert.equal(Math.round(entries.reduce((sum, m) => sum + Number(m[1]) * 100, 0)), 0);
}

// Same input, same file (a re-export alters, never duplicates).
assert.equal(buildTallyXml({ tenantId: 1, ledgers, vouchers: [opening, sale, receipt, payroll] }), xml);

assert.equal(xmlEscape(`a&b<c>"d'e\u0001`), 'a&amp;b&lt;c&gt;&quot;d&apos;e');
assert.equal(tallyDate('2026-04-01'), '20260401');
assert.equal(remoteId(2, 9), 'app-2-9');

console.log('tally-xml: all checks passed');
