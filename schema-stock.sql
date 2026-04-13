-- Stock Management Database Schema (Neon PostgreSQL)
--
-- This schema is designed for marble/tile inventory where you need to track:
-- - Brand, type, name, and size of tiles
-- - Inbound purchase receipts and transporter bills
-- - Whole vs broken tile quantities
-- - Labour costs for unloading/loading
-- - Outbound sale dispatches with invoice and gatepass archival
-- - Customer acknowledgment of receipt
-- - WhatsApp notifications to sales/accounts
--
-- Run this after DATABASE_URL is configured and db:setup is completed.

-- ====== MASTER DATA ======

CREATE TABLE IF NOT EXISTS stock_brands (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_sizes (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  width_mm NUMERIC(10, 2),
  length_mm NUMERIC(10, 2),
  thickness_mm NUMERIC(10, 2),
  unit TEXT NOT NULL DEFAULT 'mm',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location_type TEXT NOT NULL DEFAULT 'warehouse' CHECK (location_type IN ('warehouse', 'yard', 'showroom', 'in_transit', 'customer_site', 'supplier_site', 'other')),
  address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  gst_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  email TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  gst_number TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transporters (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  phone TEXT,
  vehicle_number TEXT,
  gst_number TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_vehicles (
  id BIGSERIAL PRIMARY KEY,
  vehicle_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  transporter_id BIGINT REFERENCES stock_transporters(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_app_users (
  id BIGSERIAL PRIMARY KEY,
  auth0_sub TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'stock_maintainer' CHECK (role IN ('admin', 'manager', 'stock_maintainer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  can_manage_users BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve_changes BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_sales_people (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  whatsapp_phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  role_constraint_name TEXT;
BEGIN
  SELECT c.conname
  INTO role_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'stock_app_users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%role IN%'
  LIMIT 1;

  IF role_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE stock_app_users DROP CONSTRAINT %I', role_constraint_name);
  END IF;

  UPDATE stock_app_users
  SET role = CASE
    WHEN role = 'admin' THEN 'admin'
    WHEN role IN ('manager', 'stock_approver') THEN 'manager'
    ELSE 'stock_maintainer'
  END;

  UPDATE stock_app_users
  SET can_manage_users = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
      can_approve_changes = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
      can_view_dashboard = COALESCE(can_view_dashboard, TRUE);

  ALTER TABLE stock_app_users
    ALTER COLUMN role SET DEFAULT 'stock_maintainer';

  ALTER TABLE stock_app_users
    ADD CONSTRAINT stock_app_users_role_check
    CHECK (role IN ('admin', 'manager', 'stock_maintainer'));
END $$;

-- ====== PRODUCT MASTER ======

CREATE TABLE IF NOT EXISTS stock_items (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  brand_id BIGINT REFERENCES stock_brands(id),
  type_id BIGINT REFERENCES stock_types(id),
  size_id BIGINT REFERENCES stock_sizes(id),
  name TEXT NOT NULL,
  finish TEXT,
  color TEXT,
  material TEXT,
  grade TEXT,
  series TEXT,
  unit_of_measure TEXT NOT NULL DEFAULT 'box',
  tiles_per_box INTEGER,
  pieces_per_box INTEGER,
  thickness_mm NUMERIC(10, 2),
  weight_kg NUMERIC(12, 3),
  reorder_level INTEGER NOT NULL DEFAULT 10,
  safety_stock INTEGER NOT NULL DEFAULT 0,
  current_whole_qty INTEGER NOT NULL DEFAULT 0,
  current_broken_qty INTEGER NOT NULL DEFAULT 0,
  reserved_whole_qty INTEGER NOT NULL DEFAULT 0,
  reserved_broken_qty INTEGER NOT NULL DEFAULT 0,
  purchase_price NUMERIC(12, 2),
  landed_cost NUMERIC(12, 2),
  selling_price NUMERIC(12, 2),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_items_qty_nonnegative CHECK (
    current_whole_qty >= 0 AND
    current_broken_qty >= 0 AND
    reserved_whole_qty >= 0 AND
    reserved_broken_qty >= 0
  )
);

-- Remove deprecated Hindi tile metadata columns if they exist from older deployments.
ALTER TABLE IF EXISTS stock_brands DROP COLUMN IF EXISTS name_hi;
ALTER TABLE IF EXISTS stock_types DROP COLUMN IF EXISTS name_hi;
ALTER TABLE IF EXISTS stock_items DROP COLUMN IF EXISTS name_hi;
ALTER TABLE IF EXISTS stock_items DROP COLUMN IF EXISTS description_hi;

-- ====== PURCHASE / INBOUND FLOW ======

CREATE TABLE IF NOT EXISTS stock_purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id BIGINT REFERENCES stock_suppliers(id),
  currency_code TEXT NOT NULL DEFAULT 'INR',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_arrival_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  delivery_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unloading_labour_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  transporter_bill_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_purchase_order_items (
  id BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES stock_purchase_orders(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES stock_items(id),
  ordered_qty INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estimated_whole_qty INTEGER NOT NULL DEFAULT 0,
  estimated_broken_qty INTEGER NOT NULL DEFAULT 0,
  received_whole_qty INTEGER NOT NULL DEFAULT 0,
  received_broken_qty INTEGER NOT NULL DEFAULT 0,
  rejected_qty INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_inbound_shipments (
  id BIGSERIAL PRIMARY KEY,
  shipment_number TEXT NOT NULL UNIQUE,
  purchase_order_id BIGINT REFERENCES stock_purchase_orders(id),
  supplier_id BIGINT REFERENCES stock_suppliers(id),
  currency_code TEXT NOT NULL DEFAULT 'INR',
  customer_name TEXT,
  customer_phone TEXT,
  salesperson_name TEXT,
  salesperson_phone TEXT,
  transporter_id BIGINT REFERENCES stock_transporters(id),
  vehicle_id BIGINT REFERENCES stock_vehicles(id),
  truck_license_plate TEXT,
  truck_number TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  arrival_date TIMESTAMP NOT NULL DEFAULT NOW(),
  received_date TIMESTAMP,
  submitted_at TIMESTAMP,
  submitted_by_user_id BIGINT REFERENCES stock_app_users(id),
  reviewed_at TIMESTAMP,
  reviewed_by_user_id BIGINT REFERENCES stock_app_users(id),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'reviewed', 'approved', 'rejected', 'changes_requested')),
  approval_notes TEXT,
  approved_at TIMESTAMP,
  approved_by_user_id BIGINT REFERENCES stock_app_users(id),
  locked_at TIMESTAMP,
  locked_by_user_id BIGINT REFERENCES stock_app_users(id),
  invoice_number TEXT,
  invoice_document_id BIGINT,
  transporter_bill_number TEXT,
  transporter_bill_document_id BIGINT,
  transporter_bill_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  delivery_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unloading_labour_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_whole_qty INTEGER NOT NULL DEFAULT 0,
  total_broken_qty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'arrived', 'partially_received', 'received', 'closed', 'cancelled')),
  whatsapp_notified_at TIMESTAMP,
  received_by TEXT,
  recorded_by_user_id BIGINT REFERENCES stock_app_users(id),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_inbound_shipment_items (
  id BIGSERIAL PRIMARY KEY,
  inbound_shipment_id BIGINT NOT NULL REFERENCES stock_inbound_shipments(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES stock_items(id),
  ordered_qty INTEGER NOT NULL DEFAULT 0,
  received_whole_qty INTEGER NOT NULL DEFAULT 0,
  received_broken_qty INTEGER NOT NULL DEFAULT 0,
  rejected_qty INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  landed_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  whole_inventory_lot_id BIGINT,
  broken_inventory_lot_id BIGINT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ====== SALES / OUTBOUND FLOW ======

CREATE TABLE IF NOT EXISTS stock_sales_orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES stock_customers(id),
  currency_code TEXT NOT NULL DEFAULT 'INR',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_dispatch_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'picked', 'dispatched', 'delivered', 'partially_returned', 'returned', 'cancelled')),
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  delivery_charge NUMERIC(14, 2) NOT NULL DEFAULT 0,
  loading_labour_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  transport_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_person TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_sales_order_items (
  id BIGSERIAL PRIMARY KEY,
  sales_order_id BIGINT NOT NULL REFERENCES stock_sales_orders(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES stock_items(id),
  ordered_qty INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  picked_whole_qty INTEGER NOT NULL DEFAULT 0,
  picked_broken_qty INTEGER NOT NULL DEFAULT 0,
  delivered_whole_qty INTEGER NOT NULL DEFAULT 0,
  delivered_broken_qty INTEGER NOT NULL DEFAULT 0,
  returned_whole_qty INTEGER NOT NULL DEFAULT 0,
  returned_broken_qty INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_outbound_shipments (
  id BIGSERIAL PRIMARY KEY,
  shipment_number TEXT NOT NULL UNIQUE,
  sales_order_id BIGINT REFERENCES stock_sales_orders(id),
  vehicle_id BIGINT REFERENCES stock_vehicles(id),
  currency_code TEXT NOT NULL DEFAULT 'INR',
  customer_name TEXT,
  customer_phone TEXT,
  salesperson_name TEXT,
  salesperson_phone TEXT,
  truck_license_plate TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  truck_number TEXT,
  gatepass_number TEXT,
  gatepass_document_id BIGINT,
  invoice_number TEXT,
  invoice_document_id BIGINT,
  submitted_at TIMESTAMP,
  submitted_by_user_id BIGINT REFERENCES stock_app_users(id),
  reviewed_at TIMESTAMP,
  reviewed_by_user_id BIGINT REFERENCES stock_app_users(id),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'reviewed', 'approved', 'rejected', 'changes_requested')),
  approval_notes TEXT,
  approved_at TIMESTAMP,
  approved_by_user_id BIGINT REFERENCES stock_app_users(id),
  dispatch_date TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered_date TIMESTAMP,
  customer_acknowledged_at TIMESTAMP,
  customer_acknowledged_by TEXT,
  customer_acknowledgement_id BIGINT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'packed', 'dispatched', 'delivered', 'partially_returned', 'returned', 'closed', 'cancelled')),
  loading_labour_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  transport_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  return_broken_qty INTEGER NOT NULL DEFAULT 0,
  return_notes TEXT,
  recorded_by_user_id BIGINT REFERENCES stock_app_users(id),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_outbound_shipment_items (
  id BIGSERIAL PRIMARY KEY,
  outbound_shipment_id BIGINT NOT NULL REFERENCES stock_outbound_shipments(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES stock_items(id),
  loaded_whole_qty INTEGER NOT NULL DEFAULT 0,
  loaded_broken_qty INTEGER NOT NULL DEFAULT 0,
  delivered_whole_qty INTEGER NOT NULL DEFAULT 0,
  delivered_broken_qty INTEGER NOT NULL DEFAULT 0,
  returned_whole_qty INTEGER NOT NULL DEFAULT 0,
  returned_broken_qty INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_customer_acknowledgements (
  id BIGSERIAL PRIMARY KEY,
  outbound_shipment_id BIGINT NOT NULL REFERENCES stock_outbound_shipments(id) ON DELETE CASCADE,
  customer_id BIGINT REFERENCES stock_customers(id),
  acknowledged_by TEXT,
  acknowledged_phone TEXT,
  acknowledgement_status TEXT NOT NULL DEFAULT 'pending' CHECK (acknowledgement_status IN ('pending', 'received', 'partial', 'damaged', 'rejected')),
  acknowledged_at TIMESTAMP,
  signature_url TEXT,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ====== INVENTORY LOTS / LEDGER ======

CREATE TABLE IF NOT EXISTS stock_inventory_lots (
  id BIGSERIAL PRIMARY KEY,
  lot_number TEXT NOT NULL UNIQUE,
  item_id BIGINT NOT NULL REFERENCES stock_items(id),
  location_id BIGINT REFERENCES stock_locations(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase', 'return', 'adjustment', 'transfer', 'opening_balance')),
  source_table TEXT,
  source_id BIGINT,
  tile_condition TEXT NOT NULL DEFAULT 'whole' CHECK (tile_condition IN ('whole', 'broken')),
  quantity_received INTEGER NOT NULL DEFAULT 0,
  quantity_available INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  landed_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expiry_date DATE,
  qc_status TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'failed', 'mixed')),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_inventory_lots_qty_nonnegative CHECK (
    quantity_received >= 0 AND
    quantity_available >= 0 AND
    quantity_reserved >= 0
  )
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  movement_number TEXT NOT NULL UNIQUE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase_receive', 'sale_issue', 'return_in', 'return_out', 'damage_writeoff', 'adjustment_plus', 'adjustment_minus', 'transfer_in', 'transfer_out')),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  currency_code TEXT NOT NULL DEFAULT 'INR',
  item_id BIGINT NOT NULL REFERENCES stock_items(id),
  location_id BIGINT REFERENCES stock_locations(id),
  inventory_lot_id BIGINT REFERENCES stock_inventory_lots(id),
  quantity INTEGER NOT NULL,
  tile_condition TEXT NOT NULL DEFAULT 'whole' CHECK (tile_condition IN ('whole', 'broken')),
  unit_cost NUMERIC(12, 2),
  labour_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id BIGINT,
  reference_number TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ====== DOCUMENT ARCHIVE ======

CREATE TABLE IF NOT EXISTS stock_documents (
  id BIGSERIAL PRIMARY KEY,
  document_number TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN ('purchase_invoice', 'transporter_bill', 'gatepass', 'sales_invoice', 'delivery_receipt', 'customer_acknowledgement', 'photo_evidence', 'other')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('purchase_order', 'inbound_shipment', 'sales_order', 'outbound_shipment', 'acknowledgement', 'movement', 'customer', 'supplier', 'other')),
  entity_id BIGINT,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  checksum TEXT,
  archived_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ====== COSTS / EXPENSES ======

CREATE TABLE IF NOT EXISTS stock_cost_entries (
  id BIGSERIAL PRIMARY KEY,
  cost_number TEXT NOT NULL UNIQUE,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('unloading', 'loading', 'transport', 'transporter_bill', 'labour', 'damage', 'adjustment', 'other')),
  related_entity_type TEXT CHECK (related_entity_type IN ('purchase_order', 'inbound_shipment', 'sales_order', 'outbound_shipment', 'movement', 'other')),
  related_entity_id BIGINT,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  paid_to TEXT,
  paid_by TEXT,
  payment_method TEXT,
  paid_at TIMESTAMP,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ensure explicit INR currency columns on existing deployments where these tables pre-exist.
ALTER TABLE IF EXISTS stock_purchase_orders ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE IF EXISTS stock_inbound_shipments ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE IF EXISTS stock_sales_orders ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE IF EXISTS stock_outbound_shipments ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE IF EXISTS stock_movements ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';

-- ====== NOTIFICATIONS ======

CREATE TABLE IF NOT EXISTS stock_notifications (
  id BIGSERIAL PRIMARY KEY,
  notification_number TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'internal')),
  event_type TEXT NOT NULL CHECK (event_type IN ('inbound_arrival', 'inbound_received', 'outbound_dispatch', 'low_stock', 'damage_report', 'customer_acknowledged', 'payment_update', 'other')),
  recipients JSONB NOT NULL DEFAULT '[]',
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'cancelled')),
  provider_name TEXT,
  provider_message_id TEXT,
  sent_at TIMESTAMP,
  error_message TEXT,
  source_table TEXT,
  source_id BIGINT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ====== AUDIT & LOGGING ======

CREATE TABLE IF NOT EXISTS stock_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, EXPORT, RECEIVE, DISPATCH, ACKNOWLEDGE
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  changes JSONB,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS stock_change_requests (
  id BIGSERIAL PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('inbound_shipment', 'outbound_shipment', 'purchase_order', 'sales_order', 'stock_item', 'stock_document', 'other')),
  source_entity_id BIGINT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('create', 'update', 'delete', 'correct', 'approve', 'reject', 'reopen', 'adjust')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected', 'cancelled', 'implemented')),
  requested_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_snapshot JSONB,
  reason TEXT NOT NULL,
  requested_by_user_id BIGINT REFERENCES stock_app_users(id),
  requested_by_name TEXT,
  reviewed_by_user_id BIGINT REFERENCES stock_app_users(id),
  reviewed_at TIMESTAMP,
  reviewed_notes TEXT,
  approved_by_user_id BIGINT REFERENCES stock_app_users(id),
  approved_at TIMESTAMP,
  approval_notes TEXT,
  implemented_at TIMESTAMP,
  implemented_by_user_id BIGINT REFERENCES stock_app_users(id),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  requires_higher_level_approval BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_timeline_events (
  id BIGSERIAL PRIMARY KEY,
  event_number TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('inbound_submitted', 'inbound_reviewed', 'inbound_approved', 'inbound_received', 'outbound_submitted', 'outbound_reviewed', 'outbound_approved', 'outbound_dispatched', 'customer_acknowledged', 'change_requested', 'change_approved', 'change_rejected', 'user_created', 'user_removed', 'login', 'logout', 'other')),
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  recorded_by_user_id BIGINT REFERENCES stock_app_users(id),
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ====== INDEXES FOR PERFORMANCE ======

CREATE INDEX IF NOT EXISTS idx_stock_brands_name ON stock_brands(name);
CREATE INDEX IF NOT EXISTS idx_stock_types_name ON stock_types(name);
CREATE INDEX IF NOT EXISTS idx_stock_sizes_label ON stock_sizes(label);

CREATE INDEX IF NOT EXISTS idx_stock_items_brand_id ON stock_items(brand_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_type_id ON stock_items(type_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_size_id ON stock_items(size_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_sku ON stock_items(sku);
CREATE INDEX IF NOT EXISTS idx_stock_items_name ON stock_items(name);

CREATE INDEX IF NOT EXISTS idx_stock_purchase_orders_supplier_id ON stock_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_purchase_orders_status ON stock_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_stock_purchase_order_items_po_id ON stock_purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_purchase_order_items_item_id ON stock_purchase_order_items(item_id);

CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_po_id ON stock_inbound_shipments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_supplier_id ON stock_inbound_shipments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_status ON stock_inbound_shipments(status);
CREATE INDEX IF NOT EXISTS idx_stock_inbound_items_shipment_id ON stock_inbound_shipment_items(inbound_shipment_id);
CREATE INDEX IF NOT EXISTS idx_stock_inbound_items_item_id ON stock_inbound_shipment_items(item_id);

CREATE INDEX IF NOT EXISTS idx_stock_sales_orders_customer_id ON stock_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_sales_orders_status ON stock_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_stock_sales_order_items_order_id ON stock_sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_sales_order_items_item_id ON stock_sales_order_items(item_id);

CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipments_order_id ON stock_outbound_shipments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_outbound_shipments_status ON stock_outbound_shipments(status);
CREATE INDEX IF NOT EXISTS idx_stock_outbound_items_shipment_id ON stock_outbound_shipment_items(outbound_shipment_id);
CREATE INDEX IF NOT EXISTS idx_stock_outbound_items_item_id ON stock_outbound_shipment_items(item_id);

CREATE INDEX IF NOT EXISTS idx_stock_customer_ack_shipment_id ON stock_customer_acknowledgements(outbound_shipment_id);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_lots_item_id ON stock_inventory_lots(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_lots_location_id ON stock_inventory_lots(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_lots_condition ON stock_inventory_lots(tile_condition);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_direction ON stock_movements(direction);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_documents_entity ON stock_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_documents_type ON stock_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_stock_cost_entries_related ON stock_cost_entries(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_cost_entries_type ON stock_cost_entries(cost_type);

CREATE INDEX IF NOT EXISTS idx_stock_notifications_event_type ON stock_notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_stock_notifications_status ON stock_notifications(status);
CREATE INDEX IF NOT EXISTS idx_stock_notifications_created_at ON stock_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_app_users_role ON stock_app_users(role);
CREATE INDEX IF NOT EXISTS idx_stock_app_users_status ON stock_app_users(status);
CREATE INDEX IF NOT EXISTS idx_stock_sales_people_name ON stock_sales_people(name);

CREATE INDEX IF NOT EXISTS idx_stock_change_requests_source ON stock_change_requests(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_change_requests_status ON stock_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_change_requests_requested_by ON stock_change_requests(requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_stock_timeline_events_entity ON stock_timeline_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_timeline_events_type ON stock_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stock_timeline_events_occurred_at ON stock_timeline_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_timestamp ON stock_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_user_email ON stock_audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_action ON stock_audit_logs(action);

-- ====== HELPFUL VIEW ======

CREATE OR REPLACE VIEW stock_item_balance_view AS
SELECT
  i.id AS item_id,
  i.sku,
  i.name,
  b.name AS brand_name,
  t.name AS type_name,
  s.label AS size_label,
  COALESCE(SUM(CASE WHEN l.tile_condition = 'whole' THEN l.quantity_available ELSE 0 END), 0) AS whole_available_qty,
  COALESCE(SUM(CASE WHEN l.tile_condition = 'broken' THEN l.quantity_available ELSE 0 END), 0) AS broken_available_qty,
  COALESCE(SUM(l.quantity_reserved), 0) AS reserved_qty
FROM stock_items i
LEFT JOIN stock_brands b ON b.id = i.brand_id
LEFT JOIN stock_types t ON t.id = i.type_id
LEFT JOIN stock_sizes s ON s.id = i.size_id
LEFT JOIN stock_inventory_lots l ON l.item_id = i.id
GROUP BY i.id, i.sku, i.name, b.name, t.name, s.label;

CREATE OR REPLACE VIEW stock_dashboard_summary_view AS
SELECT
  (SELECT COUNT(*) FROM stock_items WHERE is_active = TRUE) AS total_items,
  (SELECT COALESCE(SUM(current_whole_qty), 0) FROM stock_items WHERE is_active = TRUE) AS total_whole_stored,
  (SELECT COALESCE(SUM(current_broken_qty), 0) FROM stock_items WHERE is_active = TRUE) AS total_broken_stored,
  (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements WHERE direction = 'in') AS total_incoming,
  (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements WHERE direction = 'out') AS total_outgoing,
  (SELECT COALESCE(SUM(labour_cost), 0) FROM stock_movements) AS total_labour_cost,
  (SELECT COALESCE(SUM(transport_cost), 0) FROM stock_movements) AS total_transport_cost,
  (SELECT COUNT(*) FROM stock_change_requests WHERE status = 'pending') AS pending_change_requests,
  (SELECT COUNT(*) FROM stock_inbound_shipments WHERE approval_status = 'pending') AS pending_inbound_reviews,
  (SELECT COUNT(*) FROM stock_outbound_shipments WHERE approval_status = 'pending') AS pending_outbound_reviews;
