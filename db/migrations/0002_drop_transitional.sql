-- Ends the 0001 transition. Run before a second tenant exists.
--
-- After this, the pre-tenancy code (anything older than 0001's deploy) can no
-- longer run against the database: it relied on both things removed here.

-- 1. A row is only ever written inside a tenant. Without app.tenant_id the
--    default is NULL and NOT NULL rejects the insert, instead of quietly
--    filing it under Hanumant Marble (tenant 1).
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.table_name <> 'tenants'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT app_tenant()', t);
  END LOOP;
END $$;

-- 2. Names are unique per tenant only (the (tenant_id, x) twins came in 0001).
ALTER TABLE stock_app_users DROP CONSTRAINT stock_app_users_email_key;
ALTER TABLE stock_app_users DROP CONSTRAINT stock_app_users_auth0_sub_key;
ALTER TABLE stock_brands DROP CONSTRAINT stock_brands_name_key;
ALTER TABLE stock_divisions DROP CONSTRAINT stock_divisions_name_key;
ALTER TABLE stock_locations DROP CONSTRAINT stock_locations_name_key;
ALTER TABLE stock_suppliers DROP CONSTRAINT stock_suppliers_name_key;
ALTER TABLE stock_transporters DROP CONSTRAINT stock_transporters_name_key;
ALTER TABLE stock_types DROP CONSTRAINT stock_types_name_key;
ALTER TABLE stock_sizes DROP CONSTRAINT stock_sizes_label_key;
ALTER TABLE stock_items DROP CONSTRAINT stock_items_sku_key;
ALTER TABLE stock_holidays DROP CONSTRAINT stock_holidays_holiday_date_key;
ALTER TABLE stock_vehicles DROP CONSTRAINT stock_vehicles_vehicle_number_key;
ALTER TABLE stock_businesses DROP CONSTRAINT stock_businesses_gstin_key;
ALTER TABLE stock_sales_invoices DROP CONSTRAINT stock_sales_invoices_invoice_number_key;
DROP INDEX uq_businesses_invoice_prefix;

-- 3. No company inherits Hanumant Marble's invoice prefix.
ALTER TABLE stock_businesses ALTER COLUMN invoice_prefix DROP DEFAULT;

-- 4. Tenant 1 keeps the logo it always had in the app chrome (CompanyMark).
UPDATE tenants
   SET settings = settings || '{"logo": "/logo-mark.png", "logoDark": "/logo-mark-dark.png"}'::jsonb
 WHERE id = 1;
