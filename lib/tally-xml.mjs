// Tally import XML for the books (accounting vouchers only; stock stays in the
// app). Pure — no db/session imports — so lib/tally-xml.test.mjs pins the output.
//
// One ENVELOPE / IMPORTDATA: the ledger masters every voucher in the file
// uses, then the vouchers. Ledger groups already carry Tally's names
// (GROUPS in lib/accounts.mjs), so PARENT needs no mapping.
import { PARTY_GROUPS } from './accounts.mjs';
import { GST_STATES } from './gst-invoice.mjs';

// Our voucher types → Tally's predefined voucher types. Opening is never
// exported: the openings came from Tally in the first place.
export const TALLY_VOUCHER_TYPES = {
  sales: 'Sales',
  purchase: 'Purchase',
  receipt: 'Receipt',
  payment: 'Payment',
  contra: 'Contra',
  journal: 'Journal',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  payroll: 'Journal',
};

const BILL_TYPES = { new: 'New Ref', against: 'Agst Ref', on_account: 'On Account' };

/** Escape for XML text and attributes, dropping control characters XML 1.0 forbids. */
export function xmlEscape(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const tag = (name, value) => (value == null || value === '' ? '' : `<${name}>${xmlEscape(value)}</${name}>`);
const yesNo = (flag) => (flag ? 'Yes' : 'No');
/** '2026-10-07' → '20261007'. */
export const tallyDate = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
/**
 * Tally's sign convention is the reverse of ours: a debit is
 * ISDEEMEDPOSITIVE Yes with a negative AMOUNT.
 */
const tallyAmount = (amount) => (-Number(amount)).toFixed(2);

/** A stable id per voucher, so importing the same voucher again alters it instead of adding a copy. */
export const remoteId = (tenantId, voucherId) => `app-${tenantId}-${voucherId}`;

function ledgerXml(ledger) {
  const party = PARTY_GROUPS.includes(ledger.group_name);
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xmlEscape(ledger.name)}">`
    + `<NAME.LIST><NAME>${xmlEscape(ledger.name)}</NAME></NAME.LIST>`
    + tag('PARENT', ledger.group_name)
    + (party
      ? tag('ISBILLWISEON', 'Yes')
        + tag('GSTREGISTRATIONTYPE', ledger.gstin ? 'Regular' : 'Unregistered')
        + tag('PARTYGSTIN', ledger.gstin)
        + tag('LEDSTATENAME', GST_STATES[ledger.state_code || String(ledger.gstin || '').slice(0, 2)])
        + tag('COUNTRYOFRESIDENCE', 'India')
      : '')
    + '</LEDGER></TALLYMESSAGE>';
}

function lineXml(line) {
  const amount = tallyAmount(line.amount);
  const bill = BILL_TYPES[line.bill_ref_type];
  return '<ALLLEDGERENTRIES.LIST>'
    + tag('LEDGERNAME', line.ledger_name)
    + tag('ISDEEMEDPOSITIVE', yesNo(Number(line.amount) > 0))
    + tag('AMOUNT', amount)
    + (bill
      ? `<BILLALLOCATIONS.LIST>${bill === 'On Account' ? '' : tag('NAME', line.bill_ref)}${tag('BILLTYPE', bill)}${tag('AMOUNT', amount)}</BILLALLOCATIONS.LIST>`
      : '')
    + '</ALLLEDGERENTRIES.LIST>';
}

function voucherXml(voucher, tenantId) {
  const type = TALLY_VOUCHER_TYPES[voucher.voucher_type];
  const date = tallyDate(voucher.voucher_date);
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="${xmlEscape(remoteId(tenantId, voucher.id))}" VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View">`
    + tag('DATE', date)
    + tag('EFFECTIVEDATE', date)
    + tag('VOUCHERTYPENAME', type)
    + tag('VOUCHERNUMBER', voucher.voucher_number)
    + tag('REFERENCE', voucher.reference)
    + tag('PARTYLEDGERNAME', voucher.party_ledger_name)
    + tag('NARRATION', voucher.narration)
    + tag('PERSISTEDVIEW', 'Accounting Voucher View')
    + tag('ISCANCELLED', yesNo(voucher.status === 'cancelled'))
    + voucher.lines.map(lineXml).join('')
    + '</VOUCHER></TALLYMESSAGE>';
}

/**
 * vouchers: [{ id, voucher_type, voucher_date, voucher_number, reference,
 * narration, status, party_ledger_name, lines: [{ ledger_name, amount,
 * bill_ref_type, bill_ref }] }] (our signs: debit +). ledgers: every ledger
 * the lines name, [{ name, group_name, gstin, state_code }].
 * Opening vouchers are skipped.
 */
export function buildTallyXml({ tenantId, ledgers, vouchers }) {
  const exported = vouchers.filter((v) => TALLY_VOUCHER_TYPES[v.voucher_type]);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>'
    + '<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>'
    // No SVCURRENTCOMPANY: the file goes into the company open in Tally, so a
    // legal name that differs from the Tally company name cannot fail the import.
    + '<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>'
    + '<REQUESTDATA>'
    + ledgers.map(ledgerXml).join('')
    + exported.map((v) => voucherXml(v, tenantId)).join('')
    + '</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n';
}
