-- PF, ESI and salary TDS per staff member (payroll, lib/payroll-statutory.mjs).
-- Off by default: nobody's pay changes until someone switches them on.
ALTER TABLE stock_app_users
  ADD COLUMN pf_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN esi_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN uan TEXT CHECK (uan IS NULL OR uan ~ '^\d{12}$'),
  ADD COLUMN esi_ip_number TEXT CHECK (esi_ip_number IS NULL OR esi_ip_number ~ '^\d{10}$'),
  ADD COLUMN tds_monthly NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tds_monthly >= 0);
