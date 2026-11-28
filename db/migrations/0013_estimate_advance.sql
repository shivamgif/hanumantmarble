-- Advance a customer paid against an estimate / proforma: one running amount
-- (updated if they pay again), when and how. Printed as "Less: Advance" and
-- "Balance due". It is a note on the document only: the receipt itself is
-- still entered in Accounts, so nothing here touches the books.
ALTER TABLE stock_sales_invoices
  ADD COLUMN advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN advance_date DATE,
  ADD COLUMN advance_mode TEXT;
