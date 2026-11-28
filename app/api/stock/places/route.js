import { NextResponse } from 'next/server';
import { stockRoute } from '@/lib/stock-workflow';
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
// first, but anywhere in India still comes up.
const LUCKNOW_BIAS = { circle: { center: { latitude: 26.8467, longitude: 80.9462 }, radius: 50000 } };
const STATE_BY_NAME = new Map(Object.entries(GST_STATES).map(([code, name]) => [name.toLowerCase(), code]));

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
  if (input.length < 3) return NextResponse.json({ enabled: true, suggestions: [] });
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
      .map((p) => ({ placeId: p.placeId, text: p.text?.text || '' })),
  });
});
