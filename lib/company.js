import { sql } from '@/lib/db';

/**
 * The current request's company (tenants row, via RLS policy tenant_self):
 * its name and the logo the app chrome and printed invoices show. An uploaded
 * logo wins; otherwise tenants.settings.logo (Hanumant Marble's static files);
 * otherwise none, and CompanyMark draws initials.
 */
export async function companyProfile() {
  const [row] = await sql('SELECT id, name, settings, logo_updated_at FROM tenants WHERE id = app_tenant()');
  if (!row) return null;
  const uploaded = row.logo_updated_at ? new Date(row.logo_updated_at).getTime() : null;
  return {
    id: Number(row.id),
    name: row.name,
    // ?v= changes on every upload, so a browser never shows a stale cached logo.
    logo: uploaded ? `/api/stock/company/logo?v=${uploaded}` : row.settings?.logo ?? null,
    logoDark: uploaded ? null : row.settings?.logoDark ?? null,
    hasUploadedLogo: Boolean(uploaded),
  };
}

/** PNG, JPEG or WebP by their first bytes, never by what the browser claims. */
export function imageMimeOf(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const MAX_LOGO_BYTES = 300_000;
