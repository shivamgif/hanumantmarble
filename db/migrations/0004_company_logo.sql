-- A company's own logo, uploaded in Settings → Company. Kept in Postgres: one
-- small image per tenant, so it gets RLS (tenant_self), transactions and
-- backups for free. Selfies are many and live in Netlify Blobs instead.
-- No SVG: it can carry script.
ALTER TABLE tenants
  ADD COLUMN logo BYTEA CHECK (logo IS NULL OR octet_length(logo) <= 300000),
  ADD COLUMN logo_mime TEXT CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD COLUMN logo_updated_at TIMESTAMPTZ;
