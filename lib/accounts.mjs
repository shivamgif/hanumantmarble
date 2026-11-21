// Double-entry rules for the books. Pure — no db/session imports — so the API,
// the migration and lib/accounts.test.mjs all agree on what a posting is.
//
// Sign convention everywhere: debit is positive, credit is negative, and a
// voucher's lines sum to zero. Money is handled in whole paise internally so
// rupee amounts never drift by a fraction.

// Tally's predefined groups (names kept identical so the Tally export and the
// trial-balance import need no mapping). `nature` decides the side of the
// balance sheet or the P&L.
export const GROUPS = {
  'Capital Account': { nature: 'liability' },
  'Reserves & Surplus': { parent: 'Capital Account', nature: 'liability' },
  'Loans (Liability)': { nature: 'liability' },
  'Bank OD A/c': { parent: 'Loans (Liability)', nature: 'liability' },
  'Secured Loans': { parent: 'Loans (Liability)', nature: 'liability' },
  'Unsecured Loans': { parent: 'Loans (Liability)', nature: 'liability' },
  'Current Liabilities': { nature: 'liability' },
  'Duties & Taxes': { parent: 'Current Liabilities', nature: 'liability' },
  'Provisions': { parent: 'Current Liabilities', nature: 'liability' },
  'Sundry Creditors': { parent: 'Current Liabilities', nature: 'liability' },
  'Suspense A/c': { nature: 'liability' },
  'Fixed Assets': { nature: 'asset' },
  'Investments': { nature: 'asset' },
  'Current Assets': { nature: 'asset' },
  'Stock-in-Hand': { parent: 'Current Assets', nature: 'asset' },
  'Deposits (Asset)': { parent: 'Current Assets', nature: 'asset' },
  'Loans & Advances (Asset)': { parent: 'Current Assets', nature: 'asset' },
  'Sundry Debtors': { parent: 'Current Assets', nature: 'asset' },
  'Cash-in-Hand': { parent: 'Current Assets', nature: 'asset' },
  'Bank Accounts': { parent: 'Current Assets', nature: 'asset' },
  'Misc. Expenses (ASSET)': { nature: 'asset' },
  'Sales Accounts': { nature: 'income', pl: true },
  'Direct Incomes': { nature: 'income', pl: true },
  'Indirect Incomes': { nature: 'income', pl: true },
  'Purchase Accounts': { nature: 'expense', pl: true },
  'Direct Expenses': { nature: 'expense', pl: true },
  'Indirect Expenses': { nature: 'expense', pl: true },
};

/** Case-insensitive group lookup; returns the canonical name or null. */
export function canonicalGroup(name) {
  const wanted = String(name || '').trim().toLowerCase();
  return Object.keys(GROUPS).find((group) => group.toLowerCase() === wanted) || null;
}

export const PARTY_GROUPS = ['Sundry Debtors', 'Sundry Creditors'];
export const CASH_BANK_GROUPS = ['Cash-in-Hand', 'Bank Accounts', 'Bank OD A/c'];

// Ledgers every business has, keyed by the role the code posts them in.
export const SYSTEM_LEDGERS = {
  sales: { name: 'Sales', group: 'Sales Accounts' },
  sales_returns: { name: 'Sales Returns', group: 'Sales Accounts' },
  purchases: { name: 'Purchases', group: 'Purchase Accounts' },
  purchase_returns: { name: 'Purchase Returns', group: 'Purchase Accounts' },
  output_cgst: { name: 'Output CGST', group: 'Duties & Taxes' },
  output_sgst: { name: 'Output SGST', group: 'Duties & Taxes' },
  output_igst: { name: 'Output IGST', group: 'Duties & Taxes' },
  input_cgst: { name: 'Input CGST', group: 'Duties & Taxes' },
  input_sgst: { name: 'Input SGST', group: 'Duties & Taxes' },
  input_igst: { name: 'Input IGST', group: 'Duties & Taxes' },
  cash: { name: 'Cash', group: 'Cash-in-Hand' },
  freight_inward: { name: 'Freight Inward', group: 'Direct Expenses' },
  loading_unloading: { name: 'Loading & Unloading', group: 'Direct Expenses' },
  salaries: { name: 'Salaries', group: 'Indirect Expenses' },
  capital: { name: 'Capital', group: 'Capital Account' },
  round_off: { name: 'Round Off', group: 'Indirect Expenses' },
  opening_difference: { name: 'Difference in Opening Balances', group: 'Suspense A/c' },
};

export const VOUCHER_TYPES = {
  sales: { prefix: 'SAL', label: 'Sales' },
  purchase: { prefix: 'PUR', label: 'Purchase' },
  receipt: { prefix: 'RCT', label: 'Receipt' },
  payment: { prefix: 'PMT', label: 'Payment' },
  contra: { prefix: 'CTR', label: 'Contra' },
  journal: { prefix: 'JNL', label: 'Journal' },
  opening: { prefix: 'OPN', label: 'Opening' },
  credit_note: { prefix: 'CRN', label: 'Credit Note' },
  debit_note: { prefix: 'DBN', label: 'Debit Note' },
  payroll: { prefix: 'PAY', label: 'Payroll' },
};

export function formatVoucherNumber(type, fiscalYear, seq) {
  return `${VOUCHER_TYPES[type]?.prefix || 'VCH'}/${fiscalYear}/${String(seq).padStart(4, '0')}`;
}

export const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
export const fromPaise = (paise) => paise / 100;

/** Throws unless the lines (amounts in rupees) sum to exactly zero. */
export function assertBalanced(lines) {
  if (!lines.length) throw new Error('A voucher needs at least two lines.');
  const total = lines.reduce((sum, line) => sum + toPaise(line.amount), 0);
  if (total !== 0) throw new Error(`Voucher does not balance: off by ₹${fromPaise(total).toFixed(2)}.`);
  if (lines.some((line) => toPaise(line.amount) === 0)) throw new Error('A voucher line cannot be zero.');
  return lines;
}

/** Drop zero lines, round to paise. */
const clean = (lines) => lines
  .map((line) => ({ ...line, amount: fromPaise(toPaise(line.amount)) }))
  .filter((line) => line.amount !== 0);

/**
 * Sales invoice → Dr customer (bill-wise, new ref), Cr Sales, Cr output tax.
 * `totals` is computeInvoiceTotals() output. Any paise left by rounding goes to
 * Round Off so the voucher always balances.
 */
export function salesInvoiceLines({ totals, partyLedgerId, ledgers, billRef, billDate, locationId = null }) {
  const lines = [
    { ledgerId: ledgers.sales, amount: -totals.taxableTotal, locationId },
    { ledgerId: ledgers.output_cgst, amount: -totals.cgst },
    { ledgerId: ledgers.output_sgst, amount: -totals.sgst },
    { ledgerId: ledgers.output_igst, amount: -totals.igst },
  ];
  const credits = lines.reduce((sum, line) => sum + toPaise(line.amount), 0);
  const residue = toPaise(totals.grandTotal) + credits;
  if (residue !== 0) lines.push({ ledgerId: ledgers.round_off, amount: -fromPaise(residue) });
  lines.unshift({ ledgerId: partyLedgerId, amount: totals.grandTotal, billRefType: 'new', billRef, billDate, locationId });
  return assertBalanced(clean(lines));
}

/**
 * Credit note to a customer → the sales entry reversed: Dr Sales Returns, Dr
 * output tax, Cr customer against the invoice it reduces (so the invoice's
 * outstanding drops by the note).
 */
export function creditNoteLines({ totals, partyLedgerId, ledgers, invoiceNumber, locationId = null }) {
  return salesInvoiceLines({ totals, partyLedgerId, ledgers: { ...ledgers, sales: ledgers.sales_returns }, billRef: invoiceNumber, locationId })
    .map((line) => ({
      ...line,
      amount: -line.amount,
      ...(line.ledgerId === partyLedgerId ? { billRefType: 'against' } : {}),
    }));
}

/**
 * Debit note to a supplier (goods sent back, or a claim on the bill) → the
 * purchase entry reversed: Dr supplier against their bill, Cr Purchase
 * Returns, Cr input tax. `totals` from computeInvoiceTotals over the note's
 * lines; without ITC the lines carry 0% and only Purchase Returns is credited.
 */
export function supplierDebitNoteLines({ totals, partyLedgerId, ledgers, billRef, locationId = null }) {
  const asSale = {
    ...ledgers,
    sales: ledgers.purchase_returns,
    output_cgst: ledgers.input_cgst,
    output_sgst: ledgers.input_sgst,
    output_igst: ledgers.input_igst,
  };
  return salesInvoiceLines({ totals, partyLedgerId, ledgers: asSale, billRef, locationId })
    .map((line) => (line.ledgerId === partyLedgerId ? { ...line, billRefType: 'against' } : line));
}

/**
 * Purchase bill → Dr Purchases, Dr input tax, Cr supplier (bill-wise).
 * The supplier's grand total already includes GST at `gstPercent`; tax is
 * claimable only when the supplier has a GSTIN — otherwise it is all cost.
 */
export function purchaseLines({ grandTotal, gstPercent, interState, claimItc, partyLedgerId, ledgers, billRef, billDate, locationId = null }) {
  const grand = toPaise(grandTotal);
  const taxable = claimItc ? Math.round(grand / (1 + (Number(gstPercent) || 0) / 100)) : grand;
  const tax = grand - taxable;
  const cgst = interState ? 0 : Math.round(tax / 2);
  const lines = [
    { ledgerId: ledgers.purchases, amount: fromPaise(taxable), locationId },
    { ledgerId: ledgers.input_igst, amount: interState ? fromPaise(tax) : 0 },
    { ledgerId: ledgers.input_cgst, amount: fromPaise(cgst) },
    { ledgerId: ledgers.input_sgst, amount: interState ? 0 : fromPaise(tax - cgst) },
    { ledgerId: partyLedgerId, amount: -fromPaise(grand), billRefType: 'new', billRef, billDate, locationId },
  ];
  return assertBalanced(clean(lines));
}

/**
 * Receipt from / payment to a party, settled against their bills.
 * allocations: [{ billRef, amount }] (positive rupees). Whatever is left over
 * stays "on account" (an advance) until a later bill takes it.
 */
export function settlementLines({ kind, partyLedgerId, cashBankLedgerId, amount, allocations = [], instrumentNo = null }) {
  const total = toPaise(amount);
  if (total <= 0) throw new Error('Amount must be more than zero.');
  const allocated = allocations.reduce((sum, a) => sum + toPaise(a.amount), 0);
  if (allocated > total) throw new Error('Allocated more than the amount received or paid.');
  if (allocations.some((a) => toPaise(a.amount) <= 0 || !a.billRef)) throw new Error('Each allocation needs a bill and a positive amount.');

  // Receipt: Dr cash/bank, Cr party. Payment: Dr party, Cr cash/bank.
  const partySign = kind === 'receipt' ? -1 : 1;
  const lines = [
    { ledgerId: cashBankLedgerId, amount: fromPaise(-partySign * total), instrumentNo },
    ...allocations.map((a) => ({ ledgerId: partyLedgerId, amount: fromPaise(partySign * toPaise(a.amount)), billRefType: 'against', billRef: a.billRef })),
  ];
  if (total > allocated) {
    lines.push({ ledgerId: partyLedgerId, amount: fromPaise(partySign * (total - allocated)), billRefType: 'on_account' });
  }
  return assertBalanced(clean(lines));
}

/**
 * Expense paid out (rent, electricity, transport…), optionally with GST on a
 * tax invoice: Dr expense (taxable), Dr input tax, Cr cash/bank.
 */
export function expenseLines({ expenseLedgerId, cashBankLedgerId, amount, gstRate = 0, interState = false, ledgers, instrumentNo = null }) {
  const total = toPaise(amount);
  if (total <= 0) throw new Error('Amount must be more than zero.');
  const taxable = Math.round(total / (1 + (Number(gstRate) || 0) / 100));
  const tax = total - taxable;
  const cgst = interState ? 0 : Math.round(tax / 2);
  return assertBalanced(clean([
    { ledgerId: expenseLedgerId, amount: fromPaise(taxable) },
    { ledgerId: ledgers?.input_igst, amount: interState ? fromPaise(tax) : 0 },
    { ledgerId: ledgers?.input_cgst, amount: interState ? 0 : fromPaise(cgst) },
    { ledgerId: ledgers?.input_sgst, amount: interState ? 0 : fromPaise(tax - cgst) },
    { ledgerId: cashBankLedgerId, amount: -fromPaise(total), instrumentNo },
  ]));
}

/** Oldest bills first, until the amount runs out. openBills: [{ billRef, balance }] positive. */
export function allocateFifo(amount, openBills) {
  let left = toPaise(amount);
  const allocations = [];
  for (const bill of openBills) {
    if (left <= 0) break;
    const take = Math.min(left, toPaise(bill.balance));
    if (take > 0) {
      allocations.push({ billRef: bill.billRef, amount: fromPaise(take) });
      left -= take;
    }
  }
  return allocations;
}

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000);
}

export function addDays(iso, days) {
  return new Date(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export const AGE_BUCKETS = ['current', '0-30', '31-60', '61-90', '90+'];

/** Bucket by days past the due date; not yet due is 'current'. */
export function ageBucket(daysPastDue) {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '0-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return '90+';
}

// ---- Opening balances imported from Tally ---------------------------------

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/** '1,23,456.50 Dr' → 123456.5, '(500)' or '500 Cr' → -500. Indian digit grouping allowed. */
export function parseAmount(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const credit = /cr\.?$/i.test(text) || /^\(.*\)$/.test(text) || text.startsWith('-');
  const number = Number(text.replace(/(dr|cr)\.?$/i, '').replace(/[(),\s₹-]/g, ''));
  if (!Number.isFinite(number)) return NaN;
  return credit ? -number : number;
}

/** First header matching any name: short names (Dr, Cr) must match whole, longer ones may be contained. */
function columnIndex(header, names, exclude = []) {
  return header.findIndex((h) => {
    const text = h.toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (exclude.some((x) => text.includes(x))) return false;
    return names.some((n) => (n.length <= 2 ? text === n : text.includes(n)));
  });
}

/**
 * Trial balance CSV → [{ name, group, amount }]. Accepts either separate
 * Debit/Credit columns or one balance column with a Dr/Cr suffix.
 */
export function parseTrialBalance(text) {
  const [header = [], ...rows] = parseCsv(text);
  const nameCol = columnIndex(header, ['ledger', 'particular', 'name']);
  const groupCol = columnIndex(header, ['group', 'under']);
  const drCol = columnIndex(header, ['debit', 'dr']);
  const crCol = columnIndex(header, ['credit', 'cr']);
  const balCol = columnIndex(header, ['balance', 'amount', 'closing']);
  const errors = [];
  if (nameCol < 0 || groupCol < 0 || (balCol < 0 && (drCol < 0 || crCol < 0))) {
    return { entries: [], errors: ['Columns needed: Ledger, Group, and either Debit + Credit or Balance (with Dr/Cr).'] };
  }
  const entries = [];
  rows.forEach((row, i) => {
    const name = row[nameCol];
    if (!name || /^(grand )?total$/i.test(name)) return;
    const group = canonicalGroup(row[groupCol]);
    if (!group) { errors.push(`Row ${i + 2}: "${name}" is under "${row[groupCol]}", which is not a Tally group this app knows. Use the primary group name.`); return; }
    const amount = balCol >= 0 && (drCol < 0 || crCol < 0)
      ? parseAmount(row[balCol])
      : (Math.abs(parseAmount(row[drCol])) || 0) - (Math.abs(parseAmount(row[crCol])) || 0);
    if (Number.isNaN(amount)) { errors.push(`Row ${i + 2}: amount for "${name}" is not a number.`); return; }
    if (toPaise(amount) !== 0) entries.push({ name, group, amount: fromPaise(toPaise(amount)) });
  });
  return { entries, errors };
}

/** Outstanding bills CSV → [{ party, billRef, billDate, amount }] (receivable +, payable −). */
export function parseOpeningBills(text) {
  const [header = [], ...rows] = parseCsv(text);
  const partyCol = columnIndex(header, ['party', 'ledger', 'name']);
  const refCol = columnIndex(header, ['bill', 'ref', 'invoice'], ['date', 'amount']);
  const dateCol = columnIndex(header, ['date'], ['due']);
  const amountCol = columnIndex(header, ['pending', 'amount', 'balance']);
  if (partyCol < 0 || refCol < 0 || amountCol < 0) {
    return { bills: [], errors: ['Columns needed: Party, Bill No, Bill Date, Amount (with Dr/Cr).'] };
  }
  const errors = [];
  const bills = [];
  rows.forEach((row, i) => {
    const amount = parseAmount(row[amountCol]);
    if (!row[partyCol] || !row[refCol]) return;
    if (Number.isNaN(amount)) { errors.push(`Row ${i + 2}: amount is not a number.`); return; }
    bills.push({ party: row[partyCol], billRef: row[refCol], billDate: toIsoDate(row[dateCol]), amount: fromPaise(toPaise(amount)) });
  });
  return { bills, errors };
}

/** '07-10-2026', '07/10/2026', '2026-10-07' or '7-Oct-26' → '2026-10-07'; unknown → null. */
export function toIsoDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const m = text.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3}|\d{1,2})[-/.\s](\d{2,4})$/);
  if (!m) return null;
  const month = months[m[2].toLowerCase()] || Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (!month || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

/**
 * One opening voucher from a trial balance and its party bills. Party
 * balances are split into their bills; a party's bills that do not add up to
 * its balance leave the remainder on account. Whatever the trial balance does
 * not balance by goes to Difference in Opening Balances, as in Tally.
 * `ledgerIdByName` maps lower-case ledger names to ids (all already created).
 */
export function openingLines({ entries, bills, ledgerIdByName, differenceLedgerId }) {
  const lines = [];
  const billsByParty = new Map();
  for (const bill of bills) {
    const key = bill.party.toLowerCase();
    if (!billsByParty.has(key)) billsByParty.set(key, []);
    billsByParty.get(key).push(bill);
  }
  for (const entry of entries) {
    const ledgerId = ledgerIdByName.get(entry.name.toLowerCase());
    const partyBills = PARTY_GROUPS.includes(entry.group) ? billsByParty.get(entry.name.toLowerCase()) || [] : [];
    let rest = toPaise(entry.amount);
    for (const bill of partyBills) {
      lines.push({ ledgerId, amount: bill.amount, billRefType: 'new', billRef: bill.billRef, billDate: bill.billDate });
      rest -= toPaise(bill.amount);
    }
    if (rest !== 0) {
      lines.push({ ledgerId, amount: fromPaise(rest), ...(PARTY_GROUPS.includes(entry.group) ? { billRefType: 'on_account' } : {}) });
    }
  }
  const difference = lines.reduce((sum, line) => sum + toPaise(line.amount), 0);
  if (difference !== 0) lines.push({ ledgerId: differenceLedgerId, amount: -fromPaise(difference) });
  return assertBalanced(clean(lines));
}
