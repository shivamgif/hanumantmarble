-- TDS: each party ledger carries its PAN and the section its bills fall
-- under (lib/tds.mjs). Each voucher that deducted, or counted toward a
-- threshold, records its section, base and tax, so year-to-date limits and
-- the 26Q/challan figures come straight from the books.
ALTER TABLE acc_ledgers
  ADD COLUMN pan TEXT CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  ADD COLUMN tds_section TEXT CHECK (tds_section IS NULL OR tds_section IN ('194C', '194H', '194I(a)', '194I(b)', '194J(a)', '194J(b)', '194Q'));
ALTER TABLE acc_vouchers
  ADD COLUMN tds_section TEXT,
  ADD COLUMN tds_base NUMERIC(14,2),
  ADD COLUMN tds_amount NUMERIC(14,2);
CREATE INDEX acc_vouchers_tds_idx ON acc_vouchers (party_ledger_id, tds_section, fiscal_year) WHERE tds_section IS NOT NULL;
