-- Performance Indexes for Dashboard & Shipments
-- These indices prevent SeqScans by targeting the exact JOINs, GROUP BYs, and ORDER BYs used in the APIs

BEGIN;

-- 1. stock_items: optimize active item fetch and ordering
CREATE INDEX IF NOT EXISTS idx_stock_items_is_active 
ON stock_items(is_active) 
WHERE is_active = true;

-- 2. stock_inbound_shipments: optimize sorting by created_at DESC (used in recent arrivals limit 20)
CREATE INDEX IF NOT EXISTS idx_stock_inbound_created_at 
ON stock_inbound_shipments(created_at DESC);

-- 3. stock_outbound_shipments: optimize sorting by created_at DESC (used in recent dispatches limit 20)
CREATE INDEX IF NOT EXISTS idx_stock_outbound_created_at 
ON stock_outbound_shipments(created_at DESC);

-- 4. stock_inbound_shipment_items: optimize foreign keys for JOINs and GROUP BY aggregation
-- Postgres does not auto-index foreign keys
CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipment_items_shipment_id 
ON stock_inbound_shipment_items(inbound_shipment_id);

CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipment_items_item_id 
ON stock_inbound_shipment_items(item_id);

-- 5. stock_outbound_shipment_items: optimize foreign keys for JOINs and GROUP BY aggregation 
CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipment_items_shipment_id 
ON stock_outbound_shipment_items(outbound_shipment_id);

CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipment_items_item_id 
ON stock_outbound_shipment_items(item_id);

COMMIT;

-- 6. stock_notifications: optimize fetch by created_at DESC
CREATE INDEX IF NOT EXISTS idx_stock_notif_created_at 
ON stock_notifications(created_at DESC);

-- 7. stock_notifications: optimize unread count
CREATE INDEX IF NOT EXISTS idx_stock_notif_unread 
ON stock_notifications(is_read) WHERE is_read = false;
