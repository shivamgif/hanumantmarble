-- Add provider-neutral identity columns for dual Auth0/Better Auth compatibility.
-- Safe and additive: no legacy columns are dropped.

ALTER TABLE IF EXISTS stock_app_users
  ADD COLUMN IF NOT EXISTS external_auth_provider TEXT;

ALTER TABLE IF EXISTS stock_app_users
  ADD COLUMN IF NOT EXISTS external_auth_id TEXT;

UPDATE stock_app_users
SET external_auth_provider = COALESCE(NULLIF(TRIM(external_auth_provider), ''), 'auth0'),
    external_auth_id = COALESCE(NULLIF(TRIM(external_auth_id), ''), NULLIF(TRIM(auth0_sub), ''))
WHERE external_auth_provider IS NULL
   OR TRIM(external_auth_provider) = ''
   OR external_auth_id IS NULL
   OR TRIM(external_auth_id) = '';

CREATE INDEX IF NOT EXISTS idx_stock_app_users_external_auth
  ON stock_app_users(external_auth_provider, external_auth_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_app_users_external_auth
  ON stock_app_users(external_auth_provider, external_auth_id)
  WHERE external_auth_provider IS NOT NULL
    AND external_auth_id IS NOT NULL;
