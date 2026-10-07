#!/usr/bin/env node

// Books of account: double-entry ledgers and vouchers, one set per business
// (GSTIN). The database itself enforces what makes books trustworthy:
//   - every voucher balances (deferred constraint trigger),
//   - a posted voucher can only be cancelled, never edited or deleted,
//   - nothing is written into a locked financial year,
//   - every change to accounts, invoices and shipments lands in
//     stock_audit_logs with old and new rows (the Companies Act edit log).
//
// Idempotent. Local and production are separate Neon databases — running this
// against .env.local does NOT reach production; run it there explicitly with
//   npm run db:migrate:prod scripts/migrate-accounts.mjs   (from the main checkout)

import { neon } from '@neondatabase/serverless';
import { SYSTEM_LEDGERS } from '../lib/accounts.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}
const sql = neon(DATABASE_URL);

async function migrateAccounts() {
  try {
    // Books start date: documents dated on/after it are posted automatically,
    // and dispatches must come from an app invoice. NULL = books not started.
    await sql`ALTER TABLE stock_businesses ADD COLUMN IF NOT EXISTS books_start_date DATE`;

    await sql`
      CREATE TABLE IF NOT EXISTS acc_ledgers (
        id BIGSERIAL PRIMARY KEY,
        business_id BIGINT NOT NULL REFERENCES stock_businesses(id),
        name TEXT NOT NULL,
        group_name TEXT NOT NULL,
        system_key TEXT,
        customer_id BIGINT REFERENCES stock_customers(id),
        supplier_id BIGINT REFERENCES stock_suppliers(id),
        transporter_id BIGINT REFERENCES stock_transporters(id),
        app_user_id BIGINT REFERENCES stock_app_users(id),
        gstin TEXT,
        state_code TEXT,
        phone TEXT,
        credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0,
        credit_days INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_ledgers_name ON acc_ledgers (business_id, lower(name))`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_ledgers_system ON acc_ledgers (business_id, system_key) WHERE system_key IS NOT NULL`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_ledgers_customer ON acc_ledgers (business_id, customer_id) WHERE customer_id IS NOT NULL`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_ledgers_supplier ON acc_ledgers (business_id, supplier_id) WHERE supplier_id IS NOT NULL`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_ledgers_transporter ON acc_ledgers (business_id, transporter_id) WHERE transporter_id IS NOT NULL`;
    console.log('Ensured acc_ledgers.');

    await sql`
      CREATE TABLE IF NOT EXISTS acc_vouchers (
        id BIGSERIAL PRIMARY KEY,
        business_id BIGINT NOT NULL REFERENCES stock_businesses(id),
        voucher_type TEXT NOT NULL CHECK (voucher_type IN
          ('sales', 'purchase', 'receipt', 'payment', 'contra', 'journal', 'opening', 'credit_note', 'debit_note', 'payroll')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        voucher_date DATE NOT NULL,
        fiscal_year TEXT NOT NULL,
        seq INT,
        voucher_number TEXT,
        reference TEXT,
        narration TEXT,
        party_ledger_id BIGINT REFERENCES acc_ledgers(id),
        amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
        source_table TEXT,
        source_id BIGINT,
        created_by_user_id BIGINT REFERENCES stock_app_users(id),
        approved_by_user_id BIGINT REFERENCES stock_app_users(id),
        posted_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancelled_by_user_id BIGINT REFERENCES stock_app_users(id),
        exported_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (business_id, voucher_type, fiscal_year, seq)
      )
    `;
    // One live auto-posted voucher per source document; a cancelled one may be re-posted.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_vouchers_source ON acc_vouchers (source_table, source_id, voucher_type)
        WHERE source_table IS NOT NULL AND status <> 'cancelled'
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_acc_vouchers_daybook ON acc_vouchers (business_id, voucher_date DESC, id DESC)`;

    await sql`
      CREATE TABLE IF NOT EXISTS acc_voucher_lines (
        id BIGSERIAL PRIMARY KEY,
        voucher_id BIGINT NOT NULL REFERENCES acc_vouchers(id) ON DELETE CASCADE,
        ledger_id BIGINT NOT NULL REFERENCES acc_ledgers(id),
        amount NUMERIC(14, 2) NOT NULL CHECK (amount <> 0),
        bill_ref_type TEXT CHECK (bill_ref_type IN ('new', 'against', 'on_account')),
        bill_ref TEXT,
        bill_date DATE,
        location_id BIGINT REFERENCES stock_locations(id),
        bank_cleared_on DATE,
        instrument_no TEXT,
        sort INT NOT NULL DEFAULT 0
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_acc_lines_ledger ON acc_voucher_lines (ledger_id, bill_ref)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_acc_lines_voucher ON acc_voucher_lines (voucher_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS acc_fiscal_years (
        business_id BIGINT NOT NULL REFERENCES stock_businesses(id),
        fiscal_year TEXT NOT NULL,
        locked_at TIMESTAMP,
        locked_by_user_id BIGINT REFERENCES stock_app_users(id),
        PRIMARY KEY (business_id, fiscal_year)
      )
    `;
    console.log('Ensured acc_vouchers, acc_voucher_lines, acc_fiscal_years.');

    // Every voucher balances. Deferred, so lines can be inserted one by one
    // inside a transaction and checked once at commit.
    await sql`
      CREATE OR REPLACE FUNCTION acc_check_voucher_balance() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE v_id BIGINT := COALESCE(NEW.voucher_id, OLD.voucher_id); total NUMERIC;
      BEGIN
        SELECT COALESCE(SUM(amount), 0) INTO total FROM acc_voucher_lines WHERE voucher_id = v_id;
        IF total <> 0 AND EXISTS (SELECT 1 FROM acc_vouchers WHERE id = v_id) THEN
          RAISE EXCEPTION 'Voucher % does not balance (difference %)', v_id, total;
        END IF;
        RETURN NULL;
      END $$`;
    await sql`DROP TRIGGER IF EXISTS trg_acc_voucher_balance ON acc_voucher_lines`;
    await sql`
      CREATE CONSTRAINT TRIGGER trg_acc_voucher_balance
        AFTER INSERT OR UPDATE OR DELETE ON acc_voucher_lines
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION acc_check_voucher_balance()`;

    // Posted vouchers are final: only cancellation, the Tally export marker and
    // (on lines) the bank-cleared date may change. Locked years are read-only.
    await sql`
      CREATE OR REPLACE FUNCTION acc_guard_voucher() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE fy_locked BOOLEAN;
      BEGIN
        SELECT locked_at IS NOT NULL INTO fy_locked FROM acc_fiscal_years
         WHERE business_id = COALESCE(NEW.business_id, OLD.business_id)
           AND fiscal_year = COALESCE(NEW.fiscal_year, OLD.fiscal_year);
        IF fy_locked THEN
          RAISE EXCEPTION 'Financial year % is locked', COALESCE(NEW.fiscal_year, OLD.fiscal_year);
        END IF;
        IF TG_OP = 'DELETE' THEN
          IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'A % voucher cannot be deleted; cancel it instead', OLD.status; END IF;
          RETURN OLD;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' AND (NEW.status <> 'cancelled' OR NEW.exported_at IS NOT DISTINCT FROM OLD.exported_at) THEN
          RAISE EXCEPTION 'A cancelled voucher cannot change';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND (
             NEW.status NOT IN ('posted', 'cancelled')
             OR NEW.voucher_date IS DISTINCT FROM OLD.voucher_date
             OR NEW.voucher_number IS DISTINCT FROM OLD.voucher_number
             OR NEW.amount IS DISTINCT FROM OLD.amount
             OR NEW.party_ledger_id IS DISTINCT FROM OLD.party_ledger_id
             OR NEW.business_id IS DISTINCT FROM OLD.business_id) THEN
          RAISE EXCEPTION 'A posted voucher cannot be edited; cancel it and post a new one';
        END IF;
        RETURN NEW;
      END $$`;
    await sql`DROP TRIGGER IF EXISTS trg_acc_guard_voucher ON acc_vouchers`;
    await sql`CREATE TRIGGER trg_acc_guard_voucher BEFORE INSERT OR UPDATE OR DELETE ON acc_vouchers FOR EACH ROW EXECUTE FUNCTION acc_guard_voucher()`;

    await sql`
      CREATE OR REPLACE FUNCTION acc_guard_voucher_line() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE v_status TEXT;
      BEGIN
        SELECT status INTO v_status FROM acc_vouchers WHERE id = COALESCE(NEW.voucher_id, OLD.voucher_id);
        IF v_status IS NULL OR v_status = 'draft' THEN
          RETURN COALESCE(NEW, OLD);
        END IF;
        IF TG_OP = 'UPDATE'
           AND NEW.ledger_id = OLD.ledger_id AND NEW.amount = OLD.amount
           AND NEW.bill_ref IS NOT DISTINCT FROM OLD.bill_ref
           AND NEW.bill_ref_type IS NOT DISTINCT FROM OLD.bill_ref_type THEN
          RETURN NEW; -- bank reconciliation marks cleared dates on posted lines
        END IF;
        RAISE EXCEPTION 'Lines of a % voucher cannot change', v_status;
      END $$`;
    await sql`DROP TRIGGER IF EXISTS trg_acc_guard_voucher_line ON acc_voucher_lines`;
    await sql`CREATE TRIGGER trg_acc_guard_voucher_line BEFORE INSERT OR UPDATE OR DELETE ON acc_voucher_lines FOR EACH ROW EXECUTE FUNCTION acc_guard_voucher_line()`;
    console.log('Ensured balance, immutability and year-lock triggers.');

    // Edit log. The acting user comes from set_config('app.user_id') inside the
    // app's transactions; writes made outside one are still logged, without it.
    await sql`
      CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        -- Logging must never block the write it records: any failure here is
        -- downgraded to a warning instead of aborting the business change.
        BEGIN
          INSERT INTO stock_audit_logs (action, entity_type, entity_id, user_id, user_email, timestamp, changes, details)
          VALUES (
            lower(TG_OP), TG_TABLE_NAME,
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'system'),
            COALESCE(NULLIF(current_setting('app.user_email', true), ''), 'system'),
            NOW(),
            jsonb_build_object('old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                               'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END),
            'db-trigger'
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'audit_row_change failed for %: %', TG_TABLE_NAME, SQLERRM;
        END;
        RETURN NULL;
      END $$`;
    for (const table of ['acc_ledgers', 'acc_vouchers', 'acc_voucher_lines', 'stock_sales_invoices', 'stock_inbound_shipments', 'stock_outbound_shipments', 'stock_businesses']) {
      await sql.query(`DROP TRIGGER IF EXISTS trg_audit_${table} ON ${table}`);
      await sql.query(`CREATE TRIGGER trg_audit_${table} AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
    }
    console.log('Ensured edit-log triggers.');

    // System ledgers every business needs (lib/accounts.mjs SYSTEM_LEDGERS).
    const businesses = await sql`SELECT id FROM stock_businesses`;
    for (const { id } of businesses) {
      for (const [systemKey, { name, group }] of Object.entries(SYSTEM_LEDGERS)) {
        await sql`
          INSERT INTO acc_ledgers (business_id, name, group_name, system_key)
          VALUES (${id}, ${name}, ${group}, ${systemKey})
          ON CONFLICT DO NOTHING`;
      }
    }
    console.log(`Seeded system ledgers for ${businesses.length} business(es).`);
    console.log('accounts migration completed successfully.');
  } catch (error) {
    console.error('Failed to run accounts migration:', error.message);
    process.exit(1);
  }
}

migrateAccounts();
