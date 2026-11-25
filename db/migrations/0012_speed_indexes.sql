-- Indexes for the filters the stock app runs on every page load: analytics
-- month ranges (dispatch_date / arrival_date), the approval queues
-- (approval_status), the documents and change-request lists (newest first)
-- and the unread-notification badge, polled every minute. Each leads with
-- tenant_id because RLS adds tenant_id = current tenant to every query.
--
-- Plain CREATE INDEX (not CONCURRENTLY): migrate.mjs runs each file in a
-- transaction, and these tables are small enough that the brief write lock
-- is not noticed.
CREATE INDEX IF NOT EXISTS idx_stock_outbound_tenant_dispatch_date
  ON stock_outbound_shipments (tenant_id, dispatch_date);
CREATE INDEX IF NOT EXISTS idx_stock_outbound_tenant_approval
  ON stock_outbound_shipments (tenant_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_stock_inbound_tenant_arrival_date
  ON stock_inbound_shipments (tenant_id, arrival_date);
CREATE INDEX IF NOT EXISTS idx_stock_inbound_tenant_approval
  ON stock_inbound_shipments (tenant_id, approval_status);
-- "Latest HSN / cost / slab per item" on the dashboard: newest line first.
CREATE INDEX IF NOT EXISTS idx_stock_inbound_items_item_latest
  ON stock_inbound_shipment_items (item_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_stock_documents_tenant_created
  ON stock_documents (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_change_requests_tenant_created
  ON stock_change_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_notifications_tenant_unread
  ON stock_notifications (tenant_id) WHERE is_read = FALSE;

-- Exact duplicates left by the baseline (same table, same column): every
-- insert maintained both. The idx_stock_*_items_* twins stay.
DROP INDEX IF EXISTS idx_stock_inbound_shipment_items_item_id;
DROP INDEX IF EXISTS idx_stock_inbound_shipment_items_shipment_id;
DROP INDEX IF EXISTS idx_stock_outbound_shipment_items_item_id;
DROP INDEX IF EXISTS idx_stock_outbound_shipment_items_shipment_id;
