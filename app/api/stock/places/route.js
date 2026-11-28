import { NextResponse } from 'next/server';
import { getStockContext, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { istToday } from '@/lib/attendance.mjs';
import { GST_STATES } from '@/lib/gst-invoice.mjs';

// Address suggestions from Google Places (New), proxied so the key never
// reaches the browser and only signed-in staff can spend it. Off until
// GOOGLE_MAPS_API_KEY is set: the form then simply shows no search box.
//
// Cost: autocomplete calls and the one details call per pick share a
// session token, so Google bills them as one address. Set a daily quota in
// Google Cloud → Places API (New) → Quotas so a runaway can never bill.
const KEY = () => process.env.GOOGLE_MAPS_API_KEY;
const PLACES = 'https://places.googleapis.com/v1';
// Lucknow, 50 km (the API's maximum bias radius): results near the showroom
// first. Customers are in Uttar Pradesh, so anything outside it is dropped.
// Not a Google restriction box: that can't also prefer Lucknow ("sector 18"
// lost Indira Nagar to Noida), and UP's box spills into Delhi and Haryana.
// Fewer wrong suggestions, not fewer calls: Google bills each request.
const LUCKNOW_BIAS = { circle: { center: { latitude: 26.8467, longitude: 80.9462 }, radius: 50000 } };
const inUttarPradesh = (text) => /Uttar Pradesh(?:\s+\d{6})?(?:,\s*India)?$/i.test(text.trim());
const STATE_BY_NAME = new Map(Object.entries(GST_STATES).map(([code, name]) => [name.toLowerCase(), code]));

// Calls a day, all staff together, kept under the key's own daily cap (the
// demo key's, or the quota set in Google Cloud). One person gets a fifth, so
// a stuck screen or a long search session can't starve the rest.
const dailyLimit = () => Number(process.env.PLACES_DAILY_LIMIT) || 1000;

/** Counts this call; false once today's budget (shop or person) is spent. */
async function spend(request) {
  const { appUser } = await getStockContext(request);
  const [row] = await sql(
    `WITH up AS (
       INSERT INTO places_usage (day, user_id, calls) VALUES ($1, $2, 1)
       ON CONFLICT (tenant_id, day, user_id) DO UPDATE SET calls = places_usage.calls + 1
       RETURNING calls)
     SELECT (SELECT calls FROM up) AS mine,
            (SELECT COALESCE(SUM(calls), 0) FROM places_usage WHERE day = $1) + 1 AS total`,
    [istToday(), Number(appUser.id)]
  );
  return Number(row.total) <= dailyLimit() && Number(row.mine) <= dailyLimit() / 5;
}

const overBudget = () => NextResponse.json(
  { error: 'Address search has reached today’s limit. Type the address in by hand.', limited: true },
  { status: 429 }
);

const token = (value) => String(value || '').replace(/[^\w-]/g, '').slice(0, 64);

/**
 * ?q=gomti nagar&session=… → { enabled, suggestions: [{ placeId, text }] }
 * ?placeId=…&session=…    → { address, city, pincode, stateCode }
 */
export const GET = stockRoute(async function GET(request) {
  if (!KEY()) return NextResponse.json({ enabled: false, suggestions: [] });
  const params = new URL(request.url).searchParams;
  const sessionToken = token(params.get('session')) || undefined;
  const headers = { 'X-Goog-Api-Key': KEY(), 'Content-Type': 'application/json' };

  const placeId = token(params.get('placeId'));
  if (placeId) {
    if (!(await spend(request))) return overBudget();
    const res = await fetch(`${PLACES}/places/${placeId}${sessionToken ? `?sessionToken=${sessionToken}` : ''}`, {
      headers: { ...headers, 'X-Goog-FieldMask': 'formattedAddress,addressComponents' },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ error: 'Address lookup failed.' }, { status: 502 });
    const place = await res.json();
    const part = (type) => (place.addressComponents || []).find((c) => c.types?.includes(type))?.longText || '';
    return NextResponse.json({
      // The full line minus the trailing ", India"; city and PIN also go in their own boxes.
      address: String(place.formattedAddress || '').replace(/,\s*India$/, ''),
      city: part('locality') || part('administrative_area_level_3') || part('administrative_area_level_2'),
      pincode: part('postal_code'),
      stateCode: STATE_BY_NAME.get(part('administrative_area_level_1').toLowerCase()) || '',
    });
  }

  const input = String(params.get('q') || '').trim().slice(0, 200);
  if (input.length < 5) return NextResponse.json({ enabled: true, suggestions: [] });
  if (!(await spend(request))) return overBudget();
  const res = await fetch(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, sessionToken, includedRegionCodes: ['in'], locationBias: LUCKNOW_BIAS, languageCode: 'en' }),
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'Address search failed.' }, { status: 502 });
  const json = await res.json();
  return NextResponse.json({
    enabled: true,
    suggestions: (json.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({ placeId: p.placeId, text: p.text?.text || '' }))
      .filter((p) => inUttarPradesh(p.text)),
  });
});
