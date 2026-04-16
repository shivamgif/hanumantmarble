-- Rollback for external auth identity migration.
-- Non-destructive rollback: keeps columns, removes strict uniqueness, and restores Auth0-only defaults.

DROP INDEX IF EXISTS uq_stock_app_users_external_auth;
DROP INDEX IF EXISTS idx_stock_app_users_external_auth;

UPDATE stock_app_users
SET external_auth_provider = 'auth0',
    external_auth_id = COALESCE(NULLIF(TRIM(auth0_sub), ''), NULLIF(TRIM(external_auth_id), ''))
WHERE external_auth_provider IS DISTINCT FROM 'auth0'
   OR external_auth_provider IS NULL
   OR external_auth_id IS NULL
   OR TRIM(external_auth_id) = '';

CREATE INDEX IF NOT EXISTS idx_stock_app_users_auth0_sub ON stock_app_users(auth0_sub);
