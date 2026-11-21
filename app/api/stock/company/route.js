import { NextResponse } from 'next/server';
import { getRoleFlags, getStockContext, normalizeText, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { companyProfile } from '@/lib/company';
import { ACCENTS } from '@/lib/accent.mjs';

/** Settings → Company. Everyone on the staff reads it; the manager edits it. */
export const GET = stockRoute(async function GET(request) {
  const { appUser } = await getStockContext(request);
  return NextResponse.json({ company: await companyProfile(), canManage: getRoleFlags(appUser.role).canManageUsers });
});

export const PATCH = stockRoute(async function PATCH(request) {
  const { appUser } = await getStockContext(request);
  if (!getRoleFlags(appUser.role).canManageUsers) {
    return NextResponse.json({ error: 'Only a manager can change company settings.' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const hasName = body?.name !== undefined;
  const hasAccent = body?.accent !== undefined;
  if (!hasName && !hasAccent) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }
  const name = normalizeText(body?.name);
  if (hasName && (name.length < 2 || name.length > 80)) {
    return NextResponse.json({ error: 'Company name must be 2 to 80 characters.' }, { status: 400 });
  }
  if (hasAccent && !Object.hasOwn(ACCENTS, body.accent)) {
    return NextResponse.json({ error: 'Pick one of the listed accent colours.' }, { status: 400 });
  }
  if (hasName) await sql('UPDATE tenants SET name = $1 WHERE id = app_tenant()', [name]);
  if (hasAccent) {
    await sql("UPDATE tenants SET settings = settings || jsonb_build_object('accent', $1::text) WHERE id = app_tenant()", [body.accent]);
  }
  return NextResponse.json({ company: await companyProfile() });
});
