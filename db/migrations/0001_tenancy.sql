-- Multi-tenancy: every business table gets tenant_id and a row-level-security
-- policy keyed on the transaction-local setting app.tenant_id.
--
-- Additive and backward compatible on purpose, so the deploy before this one
-- still runs against the new schema (instant rollback = republish it):
--   * tenant_id defaults to COALESCE(app_tenant(), 1), so old code that never
--     sets a tenant keeps writing Hanumant's rows;
--   * the old global UNIQUEs stay next to the new (tenant_id, x) ones.
-- 0002 (before a second tenant signs up) drops both crutches.
--
-- RLS is ENABLEd but not FORCEd: the table owner (migrations, and the two
-- SECURITY DEFINER lookups below) is exempt; the app connects as app_rw, which
-- is not. app_rw must never own a table (scripts/check-rls.mjs checks this).

CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'suspended')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  fy_start_month INT NOT NULL DEFAULT 4 CHECK (fy_start_month BETWEEN 1 AND 12),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO tenants (id, name) VALUES (1, 'Hanumant Marble');
SELECT setval('tenants_id_seq', 1);

-- NULLIF: once any transaction on a pooled connection has set app.tenant_id,
-- the setting reads back as '' (not NULL) outside it, and ''::int would throw.
CREATE FUNCTION app_tenant() RETURNS INT LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::int $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants USING (id = (SELECT app_tenant()));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acc_fiscal_years', 'acc_ledgers', 'acc_voucher_lines', 'acc_vouchers',
    'stock_app_users', 'stock_attendance_entries', 'stock_attendance_settings', 'stock_audit_logs',
    'stock_brands', 'stock_businesses', 'stock_change_requests', 'stock_customer_acknowledgements',
    'stock_customers', 'stock_divisions', 'stock_documents', 'stock_holidays',
    'stock_inbound_freight_backup', 'stock_inbound_shipment_items', 'stock_inbound_shipments', 'stock_inbound_trips',
    'stock_inventory_lots', 'stock_items', 'stock_kiosk_devices', 'stock_leave_requests',
    'stock_locations', 'stock_movements', 'stock_notifications', 'stock_outbound_shipment_items',
    'stock_outbound_shipments', 'stock_purchase_orders', 'stock_sales_invoices', 'stock_sales_orders',
    'stock_sales_people', 'stock_showroom_stock', 'stock_sizes', 'stock_suppliers',
    'stock_timeline_events', 'stock_transporters', 'stock_types', 'stock_user_divisions',
    'stock_vehicles'
  ] LOOP
    -- Constant default first: Postgres fills existing rows without a rewrite.
    EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id)', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT COALESCE(app_tenant(), 1)', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = (SELECT app_tenant())) WITH CHECK (tenant_id = (SELECT app_tenant()))',
      t
    );
  END LOOP;
END $$;
-- ponytail: no plain (tenant_id) indexes. With a handful of tenants the RLS
-- filter rides along existing indexes; add (tenant_id, ...) composites to the
-- hot tables when one tenant's rows are a small fraction of a large table.

-- Names a tenant types in are unique per tenant. Random reference numbers
-- (shipment_number, movement_number, ...), IRNs and kiosk token hashes stay global.
ALTER TABLE stock_app_users ADD CONSTRAINT stock_app_users_tenant_email_key UNIQUE (tenant_id, email);
ALTER TABLE stock_app_users ADD CONSTRAINT stock_app_users_tenant_auth0_sub_key UNIQUE (tenant_id, auth0_sub);
ALTER TABLE stock_brands ADD CONSTRAINT stock_brands_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE stock_divisions ADD CONSTRAINT stock_divisions_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE stock_locations ADD CONSTRAINT stock_locations_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE stock_suppliers ADD CONSTRAINT stock_suppliers_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE stock_transporters ADD CONSTRAINT stock_transporters_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE stock_types ADD CONSTRAINT stock_types_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE stock_sizes ADD CONSTRAINT stock_sizes_tenant_label_key UNIQUE (tenant_id, label);
ALTER TABLE stock_items ADD CONSTRAINT stock_items_tenant_sku_key UNIQUE (tenant_id, sku);
ALTER TABLE stock_holidays ADD CONSTRAINT stock_holidays_tenant_holiday_date_key UNIQUE (tenant_id, holiday_date);
ALTER TABLE stock_vehicles ADD CONSTRAINT stock_vehicles_tenant_vehicle_number_key UNIQUE (tenant_id, vehicle_number);
ALTER TABLE stock_businesses ADD CONSTRAINT stock_businesses_tenant_gstin_key UNIQUE (tenant_id, gstin);
ALTER TABLE stock_sales_invoices ADD CONSTRAINT stock_sales_invoices_tenant_invoice_number_key UNIQUE (tenant_id, invoice_number);
CREATE UNIQUE INDEX uq_businesses_tenant_invoice_prefix ON stock_businesses (tenant_id, invoice_prefix);

-- Attendance settings: one row per tenant instead of one row overall. Each
-- tenant's row keeps id = 1, so `WHERE id = 1` reads still find it.
ALTER TABLE stock_attendance_settings DROP CONSTRAINT stock_attendance_settings_pkey;
ALTER TABLE stock_attendance_settings DROP CONSTRAINT stock_attendance_settings_id_check;
ALTER TABLE stock_attendance_settings ADD PRIMARY KEY (tenant_id);

-- Views run as the caller, so RLS on the underlying tables applies.
ALTER VIEW stock_balance_drift_v SET (security_invoker = true);
ALTER VIEW stock_dashboard_summary_view SET (security_invoker = true);
ALTER VIEW stock_item_balance_view SET (security_invoker = true);

-- The only cross-tenant reads the app needs, as narrow SECURITY DEFINER
-- functions (owner-run, so exempt from RLS). Anything else cross-tenant is a bug.

-- Which tenants a signed-in person belongs to. Email only counts when the
-- auth provider has verified it; otherwise anyone could sign up with a
-- pre-added staff email and claim that staff row.
CREATE FUNCTION my_tenants(p_sub TEXT, p_email TEXT, p_email_verified BOOLEAN)
  RETURNS TABLE (tenant_id INT, tenant_name TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT DISTINCT t.id, t.name
      FROM stock_app_users u
      JOIN tenants t ON t.id = u.tenant_id
     WHERE t.status <> 'suspended'
       AND (u.auth0_sub = p_sub
            OR (p_email_verified AND p_email <> '' AND lower(u.email) = lower(p_email)))
     ORDER BY t.id
  $$;

-- The kiosk has no session; its cookie names a device id (global bigserial).
-- Knowing a tenant id grants nothing: the device secret is still checked under RLS.
CREATE FUNCTION kiosk_device_tenant(p_device_id BIGINT) RETURNS INT
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT tenant_id FROM stock_kiosk_devices WHERE id = p_device_id AND is_active $$;

-- Nightly selfie purge (netlify/functions/purge-selfies.mjs) across all tenants.
CREATE FUNCTION selfie_purge_batch(p_older_than_days INT, p_limit INT)
  RETURNS TABLE (id BIGINT, in_selfie_key TEXT, out_selfie_key TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT e.id, e.in_selfie_key, e.out_selfie_key
      FROM stock_attendance_entries e
     WHERE e.work_date < (CURRENT_DATE - p_older_than_days)
       AND (e.in_selfie_key IS NOT NULL OR e.out_selfie_key IS NOT NULL)
     ORDER BY e.work_date
     LIMIT p_limit
  $$;

CREATE FUNCTION clear_selfie_keys(p_entry_id BIGINT) RETURNS VOID
  LANGUAGE sql SECURITY DEFINER SET search_path = public
  AS $$ UPDATE stock_attendance_entries SET in_selfie_key = NULL, out_selfie_key = NULL WHERE id = p_entry_id $$;

REVOKE ALL ON FUNCTION my_tenants(TEXT, TEXT, BOOLEAN), kiosk_device_tenant(BIGINT),
  selfie_purge_batch(INT, INT), clear_selfie_keys(BIGINT) FROM PUBLIC;

-- The app's login role. NOLOGIN here so no password ever lands in git; enable
-- it once per database by hand:  ALTER ROLE app_rw LOGIN PASSWORD '<random>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
REVOKE ALL ON schema_migrations FROM app_rw;
GRANT EXECUTE ON FUNCTION app_tenant(), my_tenants(TEXT, TEXT, BOOLEAN), kiosk_device_tenant(BIGINT),
  selfie_purge_batch(INT, INT), clear_selfie_keys(BIGINT) TO app_rw;
-- Tables created by later migrations (run by the owner) are granted automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
