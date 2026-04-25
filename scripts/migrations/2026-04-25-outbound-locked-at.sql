ALTER TABLE stock_outbound_shipments
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS locked_by_user_id BIGINT REFERENCES stock_app_users(id);
