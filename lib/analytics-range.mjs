// The analytics time window: one { from, to } pair that every chart, table and
// CSV on the analytics pages is cut to. Shared by the page (to build the URL)
// and the routes (to read it back), so the two can never disagree about what
// "this FY" or "6M" means.
//
// Dates are 'YYYY-MM-DD' strings in IST business days throughout; arithmetic
// goes through UTC midnight so no timezone can shift a day.

export const RANGE_PRESETS = ['month', '30d', '3m', '6m', '12m', 'ytd', 'fy'];
export const DEFAULT_PRESET = '6m';
const MAX_DAYS = 731; // 24 months
// At or under this many days the trend charts bucket by day; over it, by month.
// ponytail: two grains only. Add 'week' if quarter-length windows feel lumpy.
export const DAY_BUCKET_MAX_DAYS = 62;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function istToday(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

const toUtc = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) {
  const d = toUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
export function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000) + 1;
}
function monthStart(s, back = 0) {
  const d = toUtc(s);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)));
}
function monthEnd(s) {
  const d = toUtc(s);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
function isValidDate(s) {
  return typeof s === 'string' && DATE_RE.test(s) && fmt(toUtc(s)) === s;
}

/** A preset id -> { from, to }, ending today. */
export function resolvePreset(preset, today = istToday()) {
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case 'month': return { from: monthStart(today), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case '3m': return { from: monthStart(today, 2), to: today };
    case '12m': return { from: monthStart(today, 11), to: today };
    case 'ytd': return { from: `${year}-01-01`, to: today };
    // Indian financial year: 1 April to 31 March.
    case 'fy': return { from: `${Number(today.slice(5, 7)) >= 4 ? year : year - 1}-04-01`, to: today };
    case '6m':
    default: return { from: monthStart(today, 5), to: today };
  }
}

/**
 * Query params -> the full range a route works with. Accepts, in order:
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   custom range
 *   ?range=<preset>                  one of RANGE_PRESETS
 *   ?months=N[&endDate=]             the old 3M/6M/12M links and CSV hrefs
 * Bad input falls back to the default rather than failing the page.
 */
export function parseAnalyticsRange(searchParams, now = new Date()) {
  const today = istToday(now);
  const get = (k) => searchParams.get(k);
  let from;
  let to;
  let preset = null;

  if (isValidDate(get('from')) && isValidDate(get('to'))) {
    from = get('from');
    to = get('to');
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > to) from = to;
    // Clamp to 24 months, keeping the end the reader chose.
    if (daysBetween(from, to) > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
  } else if (RANGE_PRESETS.includes(get('range'))) {
    preset = get('range');
    ({ from, to } = resolvePreset(preset, today));
  } else if (get('months')) {
    const months = Math.min(24, Math.max(1, Math.round(Number(get('months'))) || 6));
    const end = isValidDate(get('endDate')) ? get('endDate') : today;
    from = monthStart(end, months - 1);
    to = monthEnd(end) > today ? today : monthEnd(end);
  } else {
    preset = DEFAULT_PRESET;
    ({ from, to } = resolvePreset(preset, today));
  }

  const days = daysBetween(from, to);
  const bucket = days <= DAY_BUCKET_MAX_DAYS ? 'day' : 'month';
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  // Month buckets: whole months touched. Day buckets: days.
  const bucketCount = bucket === 'day'
    ? days
    : (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
  // The final bucket is still filling: today for days, this month for months.
  const partialLastBucket = to === today && (bucket === 'day' || to !== monthEnd(to));

  return { preset, from, to, days, bucket, bucketCount, prevFrom, prevTo, partialLastBucket, today };
}

/** The start of the bucket a date falls in. */
export function bucketStart(date, bucket) {
  return bucket === 'month' ? monthStart(date) : date;
}

/** A bucket's own dates, clipped to the range: what a click on one bar means. */
export function bucketSlice(bucketDate, bucket, range) {
  const start = String(bucketDate).slice(0, 10);
  const end = bucket === 'month' ? monthEnd(start) : start;
  return { from: start < range.from ? range.from : start, to: end > range.to ? range.to : end };
}

/** URL params for a range: a preset by name, a custom range by its dates. */
export function rangeQuery(range) {
  return range.preset ? `range=${range.preset}` : `from=${range.from}&to=${range.to}`;
}
