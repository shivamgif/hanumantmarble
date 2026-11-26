// How two customer entries are judged to be the same row. Shared by the server
// (findOrCreateCustomer), the dispatch/estimate forms and scripts/merge-customers.mjs.
// No imports, so plain node scripts and client components can both load it.

// A phone reduced to its 10-digit form so '+91 98765 43210', '098765 43210' and
// '9876543210' compare equal. The 91/0 prefix is dropped only when exactly ten
// digits remain, so an 11-digit typo is not truncated into someone else's number.
export const PHONE_KEY = (expr) => `regexp_replace(regexp_replace(${expr}, '\\D', '', 'g'), '^(91|0)(?=\\d{10}$)', '')`;

// Case and repeated spaces ignored: 'Ajay  Enterprises' is 'ajay enterprises'.
export const NAME_KEY = (expr) => `lower(regexp_replace(trim(${expr}), '\\s+', ' ', 'g'))`;

// PHONE_KEY, in JS.
export function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^(91|0)(?=\d{10}$)/, '');
}
