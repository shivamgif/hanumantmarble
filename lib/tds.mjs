// TDS (income tax deducted at source) on what the business pays or owes a
// party. Pure — no db/session imports — so lib/tds.test.mjs pins it.
//
// Every common section is available; each party ledger carries its own
// section and PAN. Rates and thresholds in one block for the CA to check
// (as amended by the Finance Act 2025, from 1 April 2025).
export const TDS_SECTIONS = {
  '194C': {
    label: 'Contractors, transporters',
    rate: { individual: 1, other: 2 },
    single: 30000,       // one bill/payment above this…
    yearly: 100000,      // …or the year's total above this
  },
  '194H': { label: 'Commission, brokerage', rate: { individual: 2, other: 2 }, yearly: 20000 },
  '194I(a)': { label: 'Rent: plant & machinery', rate: { individual: 2, other: 2 }, monthly: 50000 },
  '194I(b)': { label: 'Rent: land, building, furniture', rate: { individual: 10, other: 10 }, monthly: 50000 },
  '194J(a)': { label: 'Fees for technical services', rate: { individual: 2, other: 2 }, yearly: 50000 },
  '194J(b)': { label: 'Professional fees', rate: { individual: 10, other: 10 }, yearly: 50000 },
  '194Q': {
    label: 'Purchase of goods (turnover above ₹10 crore)',
    rate: { individual: 0.1, other: 0.1 },
    above: 5000000,      // only on purchases from one seller beyond ₹50 lakh in the year
    noPanRate: 5,
  },
};
// Without a valid PAN the rate is at least 20% (s.206AA); 194Q has its own.
export const NO_PAN_RATE = 20;

const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const isValidPan = (pan) => PAN_PATTERN.test(String(pan || '').trim().toUpperCase());

/** The PAN's 4th letter says who holds it: P individual, H HUF (the lower rate), the rest companies, firms… */
export function panHolder(pan) {
  if (!isValidPan(pan)) return null;
  return ['P', 'H'].includes(String(pan).toUpperCase()[3]) ? 'individual' : 'other';
}

export function tdsRate(section, pan) {
  const rule = TDS_SECTIONS[section];
  const holder = panHolder(pan);
  if (!holder) return rule.noPanRate ?? NO_PAN_RATE;
  return rule.rate[holder];
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// Tax is rounded to the rupee.
const rupee = (n) => Math.round(Number(n) || 0);

/**
 * TDS on one bill or payment of `amount` (the base: value before GST) to a
 * party, given what was already paid or credited to them under the same
 * section this financial year (`priorBase`) and already deducted
 * (`priorTds`). Once a yearly threshold is crossed, tax is due on the whole
 * year's amount, so the first deduction catches up on earlier bills.
 * → { tds, rate, base }
 */
export function tdsFor({ section, pan, amount, priorBase = 0, priorTds = 0 }) {
  const rule = TDS_SECTIONS[section];
  if (!rule) return { tds: 0, rate: 0, base: r2(amount) };
  const rate = tdsRate(section, pan);
  const base = r2(amount);
  const yearTotal = r2(Number(priorBase) + base);
  let due = 0;

  if (rule.above != null) {
    // 194Q: only the part of the year's purchases beyond the limit.
    const taxable = Math.max(0, yearTotal - rule.above) - Math.max(0, Number(priorBase) - rule.above);
    due = (taxable * rate) / 100;
  } else if (rule.monthly != null) {
    due = base > rule.monthly ? (base * rate) / 100 : 0;
  } else if (rule.yearly != null && yearTotal > rule.yearly) {
    due = (yearTotal * rate) / 100 - Number(priorTds);
  } else if (rule.single != null && base > rule.single) {
    due = (base * rate) / 100;
  }
  return { tds: Math.max(0, rupee(due)), rate, base };
}

/** When a month's TDS is due to the government: the 7th of the next month; March's by 30 April. */
export function tdsDueDate(month) {
  const [y, m] = month.split('-').map(Number);
  if (m === 3) return `${y}-04-30`;
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${next[0]}-${String(next[1]).padStart(2, '0')}-07`;
}

/** Financial-year quarter of a date, for 26Q/24Q: Q1 Apr–Jun … Q4 Jan–Mar. */
export function tdsQuarter(iso) {
  const m = Number(String(iso).slice(5, 7));
  return m >= 4 ? Math.ceil((m - 3) / 3) : 4;
}

/** System ledger key and name for a section's payable. */
export const tdsLedger = (section) => ({
  key: `tds_${section.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
  name: `TDS Payable ${section}`,
});
