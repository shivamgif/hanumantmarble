BEGIN;

ALTER TABLE stock_outbound_shipments
  ADD COLUMN IF NOT EXISTS salesperson_user_id BIGINT REFERENCES stock_app_users(id);

CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipments_salesperson_user_id
  ON stock_outbound_shipments(salesperson_user_id);

COMMIT;
