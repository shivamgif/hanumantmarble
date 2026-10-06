#!/usr/bin/env node

// Sales estimates → GST tax invoices → QR-prefilled dispatch.
//
//   stock_businesses      one row per legal entity (one GSTIN). Showrooms and
//                         warehouses in stock_locations point at the business
//                         they trade under, so an invoice raised at a branch
//                         knows its GSTIN, seller state and number series.
//   stock_sales_invoices  a seller's estimate; approval turns it into a tax
//                         invoice with a gap-free number per business per FY.
//   stock_outbound_shipments.sales_invoice_id
//                         the dispatch registered by scanning the invoice QR.
//                         At most one live (non-rejected) dispatch per invoice.
//
// Idempotent. Local and production are separate Neon databases — running this
// against .env.local does NOT reach production; run it there explicitly.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateSalesInvoices() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS stock_businesses (
        id BIGSERIAL PRIMARY KEY,
        legal_name TEXT NOT NULL,
        trade_name TEXT,
        gstin TEXT NOT NULL UNIQUE,
        state_code TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        bank_name TEXT,
        bank_account TEXT,
        bank_ifsc TEXT,
        invoice_prefix TEXT NOT NULL DEFAULT 'HM',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    // invoice_number is globally unique, so two businesses sharing a prefix
    // would collide on their first invoice of the year.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_businesses_invoice_prefix ON stock_businesses (invoice_prefix)`;
    console.log('Ensured stock_businesses.');

    await sql`
      ALTER TABLE stock_locations
      ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES stock_businesses(id)
    `;
    console.log('Ensured stock_locations.business_id.');

    // Seed one placeholder business and attach every unassigned branch to it,
    // so invoicing works the moment someone fills in the real GSTIN.
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM stock_businesses`;
    if (count === 0) {
      await sql`
        INSERT INTO stock_businesses (legal_name, trade_name, gstin, state_code, invoice_prefix)
        VALUES ('Hanumant Marble', 'Hanumant Marble', '08AAAAA0000A1Z5', '08', 'HM')
      `;
      console.log('Seeded placeholder business — EDIT ITS GSTIN AND ADDRESS in Branches before issuing invoices.');
    }
    const attached = await sql`
      UPDATE stock_locations
         SET business_id = (SELECT id FROM stock_businesses ORDER BY id LIMIT 1)
       WHERE business_id IS NULL
      RETURNING id
    `;
    console.log(`Attached ${attached.length} branch(es) to the default business.`);

    await sql`
      CREATE TABLE IF NOT EXISTS stock_sales_invoices (
        id BIGSERIAL PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        location_id BIGINT NOT NULL REFERENCES stock_locations(id),
        business_id BIGINT NOT NULL REFERENCES stock_businesses(id),
        seller_snapshot JSONB,
        invoice_number TEXT UNIQUE,
        fiscal_year TEXT,
        invoice_seq INT,
        invoice_date DATE,
        customer_id BIGINT REFERENCES stock_customers(id),
        bill_to_name TEXT NOT NULL,
        bill_to_phone TEXT,
        bill_to_address TEXT,
        bill_to_gstin TEXT,
        bill_to_state_code TEXT NOT NULL,
        ship_to_address TEXT,
        salesperson_user_id BIGINT REFERENCES stock_app_users(id),
        items JSONB NOT NULL,
        taxable_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        cgst NUMERIC(14, 2) NOT NULL DEFAULT 0,
        sgst NUMERIC(14, 2) NOT NULL DEFAULT 0,
        igst NUMERIC(14, 2) NOT NULL DEFAULT 0,
        grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        notes TEXT,
        rejection_reason TEXT,
        created_by_user_id BIGINT REFERENCES stock_app_users(id),
        approved_by_user_id BIGINT REFERENCES stock_app_users(id),
        approved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (business_id, fiscal_year, invoice_seq)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON stock_sales_invoices (status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sales_invoices_salesperson ON stock_sales_invoices (salesperson_user_id)`;
    console.log('Ensured stock_sales_invoices.');

    await sql`
      ALTER TABLE stock_outbound_shipments
      ADD COLUMN IF NOT EXISTS sales_invoice_id BIGINT REFERENCES stock_sales_invoices(id)
    `;
    // One live dispatch per invoice; a rejected dispatch frees the invoice to be scanned again.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_live_sales_invoice
        ON stock_outbound_shipments (sales_invoice_id)
        WHERE sales_invoice_id IS NOT NULL AND approval_status <> 'rejected'
    `;
    console.log('Ensured stock_outbound_shipments.sales_invoice_id + live-dispatch unique index.');

    console.log('sales invoices migration completed successfully.');
  } catch (error) {
    console.error('Failed to run sales invoices migration:', error.message);
    process.exit(1);
  }
}

migrateSalesInvoices();
