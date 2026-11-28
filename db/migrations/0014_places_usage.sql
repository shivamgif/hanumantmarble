-- Google address-search calls per staff member per day, so the Places key's
-- daily budget (PLACES_DAILY_LIMIT, per tenant) and a per-person share of it
-- are enforced here before Google ever sees the call. No audit trigger: it is
-- a counter, not a record anyone edits.
CREATE TABLE places_usage (
  tenant_id INT NOT NULL DEFAULT app_tenant() REFERENCES tenants(id),
  day DATE NOT NULL,
  user_id BIGINT NOT NULL,
  calls INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, user_id)
);
ALTER TABLE places_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON places_usage USING (tenant_id = (SELECT app_tenant())) WITH CHECK (tenant_id = (SELECT app_tenant()));
