-- Estimates: who referred the customer (a thekedar, mistri or architect;
-- internal, never printed), and the proforma an approver can issue against a
-- pending estimate for bulk / advance orders. A proforma is an offer, not a
-- tax invoice: it has its own gap-free series per business per financial
-- year and books nothing. Editing an estimate after its proforma went out
-- bumps proforma_rev, so the customer's older copy can be told apart.
ALTER TABLE stock_sales_invoices
  ADD COLUMN referred_by_name TEXT,
  ADD COLUMN referred_by_phone TEXT,
  ADD COLUMN proforma_number TEXT,
  ADD COLUMN proforma_fiscal_year TEXT,
  ADD COLUMN proforma_seq INTEGER,
  ADD COLUMN proforma_date DATE,
  ADD COLUMN proforma_valid_until DATE,
  ADD COLUMN proforma_rev INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX stock_sales_invoices_proforma_seq_key
  ON stock_sales_invoices (business_id, proforma_fiscal_year, proforma_seq)
  WHERE proforma_seq IS NOT NULL;
