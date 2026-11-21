-- Credit and debit notes (GST s.34). A note is its own document: an item
-- snapshot, a GST reason, its own number series, maker-checker approval and,
-- for B2B, its own IRN. On approval it posts one voucher with
-- source_table = 'acc_notes' (uq_acc_vouchers_source allows one live voucher
-- per source row, so a note cannot ride on the invoice's voucher).
--
-- Customer side refers to a sales invoice; supplier side to a purchase
-- (inbound shipment). restock_done marks the stock-out a supplier debit note
-- with goods makes on approval.
CREATE TABLE acc_notes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT app_tenant() REFERENCES tenants(id),
  business_id BIGINT NOT NULL REFERENCES stock_businesses(id),
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'debit')),
  party_kind TEXT NOT NULL CHECK (party_kind IN ('customer', 'supplier')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  note_date DATE,
  fiscal_year TEXT,
  seq INT,
  note_number TEXT,
  customer_id BIGINT REFERENCES stock_customers(id),
  supplier_id BIGINT REFERENCES stock_suppliers(id),
  sales_invoice_id BIGINT REFERENCES stock_sales_invoices(id),
  inbound_shipment_id BIGINT REFERENCES stock_inbound_shipments(id),
  outbound_shipment_id BIGINT REFERENCES stock_outbound_shipments(id),
  original_number TEXT NOT NULL,
  original_date DATE,
  reason TEXT NOT NULL CHECK (reason IN ('sales_return', 'post_sale_discount', 'rate_correction', 'deficiency', 'other')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  taxable_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  restock_done BOOLEAN NOT NULL DEFAULT FALSE,
  einvoice_status TEXT NOT NULL DEFAULT 'not_required' CHECK (einvoice_status IN ('not_required', 'pending', 'generated', 'cancelled')),
  irn TEXT UNIQUE,
  ack_no TEXT,
  ack_date TEXT,
  signed_qr TEXT,
  created_by_user_id BIGINT,
  approved_by_user_id BIGINT,
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  cancelled_by_user_id BIGINT,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, kind, fiscal_year, seq),
  UNIQUE (tenant_id, note_number),
  CHECK (party_kind <> 'customer' OR sales_invoice_id IS NOT NULL),
  CHECK (party_kind <> 'supplier' OR inbound_shipment_id IS NOT NULL),
  CHECK (status <> 'approved' OR note_number IS NOT NULL)
);
CREATE INDEX acc_notes_sales_invoice_idx ON acc_notes (sales_invoice_id) WHERE sales_invoice_id IS NOT NULL;
CREATE INDEX acc_notes_inbound_shipment_idx ON acc_notes (inbound_shipment_id) WHERE inbound_shipment_id IS NOT NULL;

ALTER TABLE acc_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON acc_notes USING (tenant_id = (SELECT app_tenant())) WITH CHECK (tenant_id = (SELECT app_tenant()));

CREATE TRIGGER trg_audit_acc_notes AFTER INSERT OR DELETE OR UPDATE ON acc_notes
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
