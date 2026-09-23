// The same tile, entered twice as two products.
//
// A product master row is minted by its generated SKU - generateSku() in
// app/api/stock/inbound-shipments/route.js joins name, grade, type, size and
// brand, and the insert is ON CONFLICT (sku). The only thing between a typed
// variation and a second row is an exact string match in the browser
// (findMatchingActiveItem, app/stock/lib/stock-utils.js), which is trim and
// lowercase and nothing more. One extra hyphen and the tile exists twice, its
// stock split across both, invisible to whoever searches the other spelling.
//
// Grade is part of the identity here, and that is the whole difference between
// this being useful and being noise. "Analya Marfil" exists as Commercial and
// as Premium; they buy at Rs 612 and Rs 1,062 and sell at Rs 852 and Rs 1,326.
// They are different products. Reading them as one duplicate - as a first pass
// of this did - would merge away real cost and margin history. With grade in
// the key the candidate list drops from 20 groups to 13 pairs.
//
// Everything here is pure: rows in, ranked pairs out, no database. The route
// runs it over what SQL hands back.

// Case, spacing and punctuation are not identity. "Delphi Bianco- Matt" and
// "delphi bianco matt" are one name.
export function normalizeItemName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// A tile's numbers are its identity. K 6212 and K 6213 are one letter apart and
// are different products; so are K 12251 and K 12254, and the six Pentagon
// codes. Requiring the digits to match exactly is what makes the near-name tier
// readable - it drops 38 of 50 raw near-matches and keeps the real typos, which
// are always misspelt words rather than mistyped codes.
export function nameDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

// Products only get compared inside one bucket. Bucketing first is also what
// keeps this cheap enough to do in JS: pg_trgm is not installed on this
// database, and with buckets this small it is not needed.
//
// NULL-safe on purpose. A plain SQL row-value IN () drops rows with a NULL
// size_id, which is how the Gresbond "Adhesive" pair went missing from an
// earlier count. Two NULLs belong in the same bucket.
export function itemBucketKey(item) {
  const part = (value) => (value == null || value === '' ? 'x' : String(value));
  return [
    part(item.brand_id),
    part(item.type_id),
    part(item.size_id),
    normalizeItemName(item.grade) || 'x',
  ].join('|');
}

// A one-character word is a code, not a spelling.
//
// The digit rule above catches K 6212 vs K 6213. This catches the same idea
// wearing letters: "Lira Italino (P)- GVT" and "(M)- GVT" are two finishes,
// "Vega Bianco - A" and "- B" two shades, "K- 4060 U" and "K 4060" a suffixed
// variant. All sit one edit apart and all are different products. Every real
// typo in this catalogue is instead a misspelt *word* - Bianco/Bianca,
// Larchen/Larcen, Rachele/Rachela, Gris/Grey - so if everything the two names
// disagree about is a single character standing alone, they are variants.
export function differsOnlyByShortCode(a, b) {
  const tokens = (value) => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const left = tokens(a);
  const right = tokens(b);
  const remaining = [...right];
  const onlyInLeft = [];
  for (const token of left) {
    const at = remaining.indexOf(token);
    if (at === -1) onlyInLeft.push(token);
    else remaining.splice(at, 1);
  }
  const differing = [...onlyInLeft, ...remaining];
  return differing.length > 0 && differing.every((token) => token.length <= 1);
}

// Levenshtein, iterative, two rows at a time.
export function nameDistance(a, b) {
  if (a === b) return 0;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// How far apart two names may be and still be the same tile mistyped. Short
// names get one edit, longer ones two - never more, because beyond that the
// letters stop being a slip and start being a different word.
function allowedDistance(a, b) {
  return Math.min(2, Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.12)));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Two rows for one tile should have been bought at about one price. The ratio
// between their average unit costs is the evidence, and it reads the way
// freight_weight_kg read for the lorry charges: Delphi Bianco/Bianca are both
// Rs 734.40, which is not a coincidence. A wide ratio says the names look alike
// but the things do not - Lira Italino (c)/(P)/(M) are finish codes at x1.07.
//
// null when either side was never bought at a priced receipt: unknown is not
// the same as close, and the ranking must not treat it as agreement.
function costRatioOf(a, b) {
  const x = toNumber(a.unit_cost);
  const y = toNumber(b.unit_cost);
  if (x <= 0 || y <= 0) return null;
  return Math.max(x, y) / Math.min(x, y);
}

// Ranked, not judged. An identical name under one grade is as close to certain
// as this gets; everything else is a reading of how far the names and the
// prices have drifted, for a human to settle.
function confidenceOf({ tier, costRatio, sharesPurchase }) {
  if (tier === 'identical') return costRatio == null || costRatio <= 1.25 ? 'certain' : 'likely';
  if (costRatio == null) return 'check';
  if (costRatio <= 1.02) return sharesPurchase ? 'likely' : 'certain';
  if (costRatio <= 1.15) return 'likely';
  return 'check';
}

const RANK = { certain: 0, likely: 1, check: 2 };

// The older row is the stray: the one that stopped being bought. Its stock is
// what nobody can find under the name they are searching.
function strayOf(a, b) {
  const at = a.last_buy ? new Date(a.last_buy).getTime() : 0;
  const bt = b.last_buy ? new Date(b.last_buy).getTime() : 0;
  if (at !== bt) return at < bt ? a : b;
  return toNumber(a.id) < toNumber(b.id) ? a : b;
}

function sharesAPurchase(a, b) {
  const mine = new Set((a.shipment_ids || []).map(String));
  return (b.shipment_ids || []).some((id) => mine.has(String(id)));
}

/**
 * Candidate duplicate products, most confident first.
 *
 * Each row needs: id, sku, name, grade, brand_id, type_id, size_id, is_active,
 * qty, sells, last_buy, unit_cost, shipment_ids, and whatever labels the UI
 * prints (brand, type, size, purchases).
 */
export function findDuplicateItemPairs(rows) {
  const buckets = new Map();
  for (const row of rows || []) {
    const key = itemBucketKey(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const pairs = [];
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        const an = normalizeItemName(a.name);
        const bn = normalizeItemName(b.name);
        if (!an || !bn) continue;

        let tier = null;
        let editDistance = 0;
        if (an === bn) {
          tier = 'identical';
        } else {
          if (Math.abs(an.length - bn.length) > 3) continue;
          if (nameDigits(a.name) !== nameDigits(b.name)) continue;
          if (differsOnlyByShortCode(a.name, b.name)) continue;
          const distance = nameDistance(an, bn);
          if (distance > allowedDistance(an, bn)) continue;
          tier = 'near';
          editDistance = distance;
        }

        const costRatio = costRatioOf(a, b);
        const sharesPurchase = sharesAPurchase(a, b);
        const stray = strayOf(a, b);
        const strandedQty = toNumber(stray.qty);
        pairs.push({
          key: `${a.id}-${b.id}`,
          tier,
          editDistance,
          costRatio: costRatio == null ? null : Math.round(costRatio * 100) / 100,
          sharesPurchase,
          confidence: confidenceOf({ tier, costRatio, sharesPurchase }),
          strayId: stray.id,
          strandedQty,
          strandedValue: Math.round(strandedQty * toNumber(stray.unit_cost)),
          items: [a, b],
        });
      }
    }
  }

  pairs.sort((x, y) => (
    RANK[x.confidence] - RANK[y.confidence]
    || y.strandedValue - x.strandedValue
    || String(x.items[0].name).localeCompare(String(y.items[0].name))
  ));
  return pairs;
}

// The three numbers the tab's tiles show. Stranded value counts each product
// once however many pairs it landed in - Lira Italino is in three, and adding
// its stock up three times would invent money.
export function summarizeDuplicateItems(pairs) {
  const products = new Set();
  const strays = new Map();
  for (const pair of pairs) {
    for (const item of pair.items) products.add(String(item.id));
    strays.set(String(pair.strayId), pair.strandedValue);
  }
  let strandedValue = 0;
  for (const value of strays.values()) strandedValue += value;
  return {
    pairCount: pairs.length,
    productCount: products.size,
    certainCount: pairs.filter((p) => p.confidence === 'certain').length,
    strandedValue,
  };
}
