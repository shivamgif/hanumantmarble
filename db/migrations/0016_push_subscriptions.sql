-- Phone and desktop alerts (Web Push). One row per device a person turned
-- alerts on for. The endpoint is the push service's address for that device;
-- signing in as someone else on the same device moves the row to them.
CREATE TABLE stock_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT app_tenant() REFERENCES tenants(id),
  user_id BIGINT NOT NULL REFERENCES stock_app_users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, endpoint)
);
CREATE INDEX idx_stock_push_subscriptions_user ON stock_push_subscriptions (tenant_id, user_id);
ALTER TABLE stock_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_push_subscriptions USING (tenant_id = (SELECT app_tenant())) WITH CHECK (tenant_id = (SELECT app_tenant()));
