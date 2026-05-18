-- Workstream E: capture discount on purchase entries
-- Shipment-level discount applied to subtotal before fuel/handling/GST
-- Line-level discount applied to (qty_sqm * cost_per_sqm) or (qty_bags * rate_per_bag)
-- Existing rows default to 0 so grand_total math is unchanged until admin edits

ALTER TABLE stock_inbound_shipments
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE stock_inbound_shipment_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
