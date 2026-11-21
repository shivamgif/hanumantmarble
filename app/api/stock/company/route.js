import { NextResponse } from 'next/server';
import { getRoleFlags, getStockContext, normalizeText, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { companyProfile } from '@/lib/company';

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
  const name = normalizeText(body?.name);
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: 'Company name must be 2 to 80 characters.' }, { status: 400 });
  }
  await sql('UPDATE tenants SET name = $1 WHERE id = app_tenant()', [name]);
  return NextResponse.json({ company: await companyProfile() });
});
