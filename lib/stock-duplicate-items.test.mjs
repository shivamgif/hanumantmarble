// Run: node lib/stock-duplicate-items.test.mjs
//
// Guards the judgement that decides whether the duplicate-products tab is
// useful or noise: which two product rows are the same tile typed twice, and
// which are two real products that happen to read alike.
import assert from 'node:assert/strict';
import {
  findDuplicateItemPairs,
  itemBucketKey,
  nameDigits,
  differsOnlyByShortCode,
  nameDistance,
  normalizeItemName,
  summarizeDuplicateItems,
} from './stock-duplicate-items.mjs';

// --- the pieces ---------------------------------------------------------------
assert.equal(normalizeItemName('Delphi Bianco- Matt'), 'delphibiancomatt');
assert.equal(normalizeItemName('  DELPHI   BIANCO MATT '), 'delphibiancomatt');
assert.equal(normalizeItemName(null), '');
assert.equal(nameDigits('K 12646 J'), '12646');
assert.equal(nameDigits('Larchen Nero'), '');
assert.equal(nameDistance('larchennero', 'larcennero'), 1);
assert.equal(nameDistance('same', 'same'), 0);

// Two NULLs belong in one bucket. A plain SQL row-value IN () drops them, which
// is how the Gresbond "Adhesive" pair went missing from an earlier count.
assert.equal(
  itemBucketKey({ brand_id: 7, type_id: null, size_id: null, grade: null }),
  itemBucketKey({ brand_id: 7, type_id: null, size_id: null, grade: '' })
);
// Grade is part of the key, so it separates buckets.
assert.notEqual(
  itemBucketKey({ brand_id: 1, type_id: 2, size_id: 3, grade: 'Premium' }),
  itemBucketKey({ brand_id: 1, type_id: 2, size_id: 3, grade: 'Commercial' })
);

// --- pairing ------------------------------------------------------------------
const item = (over) => ({
  id: 1, sku: 'SKU', name: 'Tile', grade: 'Premium',
  brand_id: 1, type_id: 2, size_id: 3, is_active: true,
  qty: 0, sells: 0, last_buy: '2026-05-01', unit_cost: 1000, shipment_ids: [],
  ...over,
});
const pairsOf = (...rows) => findDuplicateItemPairs(rows);

// The one this tab exists for: the same tile, one letter apart, bought at
// exactly the same price.
const delphi = pairsOf(
  item({ id: 193, name: 'Delphi Bianco- Matt', unit_cost: 734.4, qty: 2, last_buy: '2026-05-07' }),
  item({ id: 390, name: 'Delphi Bianca Matt', unit_cost: 734.4, qty: 977, last_buy: '2026-06-13' })
);
assert.equal(delphi.length, 1);
assert.equal(delphi[0].tier, 'near');
assert.equal(delphi[0].editDistance, 1);
assert.equal(delphi[0].costRatio, 1);
assert.equal(delphi[0].confidence, 'certain');
// The stray is the row that stopped being bought, and its stock is what goes missing.
assert.equal(delphi[0].strayId, 193);
assert.equal(delphi[0].strandedValue, Math.round(2 * 734.4));

// Commercial and Premium are different products - they buy at Rs 612 and
// Rs 1,062 and sell on accordingly. Same name, and still not a pair.
assert.deepEqual(
  pairsOf(
    item({ id: 151, name: 'Analya Marfil', grade: 'Commercial', unit_cost: 612.09 }),
    item({ id: 325, name: 'Analya Marfil', grade: 'Premium', unit_cost: 1061.96 })
  ),
  []
);

// A tile's numbers are its identity: one digit apart is a different tile,
// however close the letters look.
assert.deepEqual(
  pairsOf(item({ id: 324, name: 'K 6212' }), item({ id: 660, name: 'K 6213' })),
  []
);
assert.deepEqual(
  pairsOf(item({ id: 277, name: 'K- 12251' }), item({ id: 274, name: 'K- 12254' })),
  []
);
// But the same number typed differently is the same tile.
const spacing = pairsOf(item({ id: 1, name: 'K 12651- Matt' }), item({ id: 2, name: 'K - 12651 -Matt' }));
assert.equal(spacing.length, 1);
assert.equal(spacing[0].tier, 'identical', 'punctuation is not identity');

// A one-letter word is a code, not a spelling. These three are finishes of the
// same design, one edit apart, and two of them were bought at the same price -
// without this rule they lead the list as the most confident duplicate there is.
assert.deepEqual(
  pairsOf(
    item({ id: 439, name: 'Lira Italino (P)- GVT', unit_cost: 1061.96 }),
    item({ id: 765, name: 'Lira Italino (M)- GVT', unit_cost: 1065.23 })
  ),
  []
);
// Shades of one tile, on one invoice, at one price. Still two products.
assert.deepEqual(
  pairsOf(
    item({ id: 252, name: 'Vega Bianco - A', unit_cost: 648, shipment_ids: [55] }),
    item({ id: 253, name: 'Vega Bianco - B', unit_cost: 648, shipment_ids: [55] })
  ),
  []
);
// A suffixed variant: one name carries a code the other does not.
assert.deepEqual(
  pairsOf(item({ id: 273, name: 'K- 4060 U' }), item({ id: 537, name: 'K 4060' })),
  []
);
assert.deepEqual(
  pairsOf(item({ id: 88, name: 'Venchy Grey C+', grade: 'Commercial' }), item({ id: 694, name: 'Venchy Grey', grade: 'Commercial' })),
  []
);
// The rule must not swallow a real misspelling: the differing tokens are words.
assert.equal(differsOnlyByShortCode('Larchen Nero', 'Larcen Nero'), false);
assert.equal(differsOnlyByShortCode('Florence Gris Endless', 'Florence Grey ( Endless)'), false);
assert.equal(differsOnlyByShortCode('Lira Italino (P)- GVT', 'Lira Italino (M)- GVT'), true);

// Names alike, prices far apart: worth a look, not worth asserting.
const agate = pairsOf(
  item({ id: 593, name: 'Agate Decor Polished', unit_cost: 409.5 }),
  item({ id: 628, name: 'Almate Decor Polished', unit_cost: 414.1 })
);
assert.equal(agate.length, 1, 'two words two letters apart stay a candidate for a human');

// Never bought at a priced receipt: unknown must not read as agreement.
assert.equal(
  pairsOf(item({ id: 1, name: 'Larchen Nero', unit_cost: 0 }), item({ id: 2, name: 'Larcen Nero', unit_cost: 0 }))[0].confidence,
  'check'
);

// Both spellings on one invoice - the case the tab badges, because it is the
// operator keying the same line twice rather than drifting over months.
const oneInvoice = pairsOf(
  item({ id: 1, name: 'Larchen Nero', unit_cost: 1091, shipment_ids: [55] }),
  item({ id: 2, name: 'Larcen Nero', unit_cost: 1091, shipment_ids: [55, 61] })
);
assert.equal(oneInvoice[0].sharesPurchase, true);
assert.equal(oneInvoice[0].confidence, 'likely', 'one invoice listing both is a reason to look, not to merge');

// Different bucket, identical name: a 600x600 and a 600x1200 of one design are
// two products, and Blanco Nieve is legitimately both.
assert.deepEqual(
  pairsOf(item({ id: 1, name: 'Blanco Nieve', size_id: 3 }), item({ id: 2, name: 'Blanco Nieve', size_id: 9 })),
  []
);

// --- ordering and totals --------------------------------------------------------
const ranked = findDuplicateItemPairs([
  item({ id: 1, name: 'Check Me', unit_cost: 100, qty: 10, last_buy: '2026-01-01' }),
  item({ id: 2, name: 'Check Mo', unit_cost: 130, qty: 10, last_buy: '2026-02-01' }),
  item({ id: 3, name: 'Sure Thing', size_id: 44, unit_cost: 500, qty: 4, last_buy: '2026-01-01' }),
  item({ id: 4, name: 'Sure Thing', size_id: 44, unit_cost: 500, qty: 4, last_buy: '2026-02-01' }),
]);
assert.equal(ranked.length, 2);
assert.equal(ranked[0].confidence, 'certain', 'the certain pair leads');
assert.equal(ranked[1].confidence, 'check');

// A product in three pairs must not have its stock counted three times.
const shared = findDuplicateItemPairs([
  item({ id: 10, name: 'Trio Uno', unit_cost: 100, qty: 5, last_buy: '2026-01-01' }),
  item({ id: 11, name: 'Trio Una', unit_cost: 100, qty: 5, last_buy: '2026-02-01' }),
  item({ id: 12, name: 'Trio Uno', unit_cost: 100, qty: 5, last_buy: '2026-03-01' }),
]);
assert.equal(shared.length, 3);
const summary = summarizeDuplicateItems(shared);
assert.equal(summary.productCount, 3);
assert.equal(summary.pairCount, 3);
assert.equal(summary.strandedValue, 1000, 'two distinct strays at 5 x 100, not three pairs x 500');

assert.deepEqual(findDuplicateItemPairs([]), []);
assert.deepEqual(findDuplicateItemPairs(null), []);

console.log('stock-duplicate-items: ok');
