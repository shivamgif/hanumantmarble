-- GSTR-2B as uploaded from the GST portal, one per business and month, kept
-- parsed (rows of supplier invoices and notes) so the GST returns tab can
-- match it against purchases and show ITC as the portal sees it. Uploading
-- the same month again replaces it.
CREATE TABLE acc_gstr2b (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT app_tenant() REFERENCES tenants(id),
  business_id BIGINT NOT NULL REFERENCES stock_businesses(id),
  period TEXT NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rows JSONB NOT NULL,
  uploaded_by_user_id BIGINT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, period)
);
ALTER TABLE acc_gstr2b ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON acc_gstr2b USING (tenant_id = (SELECT app_tenant())) WITH CHECK (tenant_id = (SELECT app_tenant()));
CREATE TRIGGER trg_audit_acc_gstr2b AFTER INSERT OR DELETE OR UPDATE ON acc_gstr2b
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
