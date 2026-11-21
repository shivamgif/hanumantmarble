import { NextResponse } from 'next/server';
import { getRoleFlags, getStockContext, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { companyProfile, imageMimeOf, MAX_LOGO_BYTES } from '@/lib/company';

/** The company's uploaded logo. The URL carries ?v=<upload time>, so it can be cached. */
export const GET = stockRoute(async function GET() {
  const [row] = await sql('SELECT logo, logo_mime FROM tenants WHERE id = app_tenant() AND logo IS NOT NULL');
  if (!row) return new Response(null, { status: 404 });
  return new Response(row.logo, {
    headers: {
      'Content-Type': row.logo_mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

async function managerOnly(request) {
  const { appUser } = await getStockContext(request);
  return getRoleFlags(appUser.role).canManageUsers
    ? null
    : NextResponse.json({ error: 'Only a manager can change the logo.' }, { status: 403 });
}

/** Body: the image file itself (PNG, JPEG or WebP, at most 300 KB). */
export const PUT = stockRoute(async function PUT(request) {
  const denied = await managerOnly(request);
  if (denied) return denied;

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
  if (bytes.length > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: `The logo must be at most ${MAX_LOGO_BYTES / 1000} KB.` }, { status: 400 });
  }
  const mime = imageMimeOf(bytes);
  if (!mime) return NextResponse.json({ error: 'The logo must be a PNG, JPEG or WebP image.' }, { status: 400 });

  await sql('UPDATE tenants SET logo = $1, logo_mime = $2, logo_updated_at = NOW() WHERE id = app_tenant()', [bytes, mime]);
  return NextResponse.json({ company: await companyProfile() });
});

/** Back to the default: initials, or the built-in logo tenants.settings names. */
export const DELETE = stockRoute(async function DELETE(request) {
  const denied = await managerOnly(request);
  if (denied) return denied;
  await sql('UPDATE tenants SET logo = NULL, logo_mime = NULL, logo_updated_at = NULL WHERE id = app_tenant()');
  return NextResponse.json({ company: await companyProfile() });
});
