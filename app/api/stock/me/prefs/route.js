import { NextResponse } from 'next/server';
import { getStockContext, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { PREF_KEYS, sanitizeLayout } from '@/lib/layout-prefs.mjs';

/**
 * The signed-in person's own layout preferences. Reads come with
 * /api/stock/access (user.ui_prefs); this only writes one key at a time.
 * Body: { key: 'nav' | 'analytics.<tab>', value: { order, span, hidden } | null }.
 * null resets that key to the defaults.
 */
export const PATCH = stockRoute(async function PATCH(request) {
  const { appUser } = await getStockContext(request);
  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!PREF_KEYS.test(key)) {
    return NextResponse.json({ error: 'Unknown preference.' }, { status: 400 });
  }
  const value = body.value === null ? null : JSON.stringify(sanitizeLayout(body.value));
  const [row] = await sql(
    `UPDATE stock_app_users
        SET ui_prefs = CASE WHEN $2::jsonb IS NULL THEN ui_prefs - $1::text
                            ELSE ui_prefs || jsonb_build_object($1::text, $2::jsonb) END
      WHERE id = $3
      RETURNING ui_prefs`,
    [key, value, appUser.id]
  );
  return NextResponse.json({ prefs: row?.ui_prefs ?? {} });
});
