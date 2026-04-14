#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error('DATABASE_URL environment variable is required');
	process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migratePurchaseCapabilities() {
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS stock_divisions (
				id BIGSERIAL PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				description TEXT,
				is_active BOOLEAN NOT NULL DEFAULT TRUE,
				created_at TIMESTAMP NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMP NOT NULL DEFAULT NOW()
			)
		`;

		await sql`
			ALTER TABLE stock_items
			ADD COLUMN IF NOT EXISTS division_id BIGINT REFERENCES stock_divisions(id)
		`;

		await sql`
			ALTER TABLE stock_app_users
			ADD COLUMN IF NOT EXISTS division_id BIGINT REFERENCES stock_divisions(id)
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS invoice_date DATE
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS origin_city TEXT
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS destination_warehouse_name TEXT
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2)
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS payment_date DATE
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS payment_reference TEXT
		`;

		await sql`
			ALTER TABLE stock_inbound_shipments
			ADD COLUMN IF NOT EXISTS payment_mode TEXT
		`;

		await sql`
			ALTER TABLE stock_inbound_shipment_items
			ADD COLUMN IF NOT EXISTS hsn_code TEXT
		`;

		await sql`
			ALTER TABLE stock_inbound_shipment_items
			ADD COLUMN IF NOT EXISTS qty_sqm NUMERIC(14, 3)
		`;

		await sql`
			ALTER TABLE stock_inbound_shipment_items
			ADD COLUMN IF NOT EXISTS cost_per_sqm NUMERIC(12, 2)
		`;

		await sql`
			ALTER TABLE stock_inbound_shipment_items
			ADD COLUMN IF NOT EXISTS thickness_mm_snapshot NUMERIC(10, 2)
		`;

		await sql`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'stock_inbound_shipments_payment_status_check'
				) THEN
					ALTER TABLE stock_inbound_shipments
						ADD CONSTRAINT stock_inbound_shipments_payment_status_check
						CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
				END IF;
			END $$;
		`;

		// Backfill divisions from existing item department values, then attach division_id.
		await sql`
			INSERT INTO stock_divisions (name)
			SELECT DISTINCT COALESCE(NULLIF(TRIM(department), ''), 'General') AS division_name
			FROM stock_items
			ON CONFLICT (name) DO NOTHING
		`;

		await sql`
			UPDATE stock_items i
			SET division_id = d.id,
					updated_at = NOW()
			FROM stock_divisions d
			WHERE i.division_id IS NULL
				AND d.name = COALESCE(NULLIF(TRIM(i.department), ''), 'General')
		`;

		await sql`
			INSERT INTO stock_divisions (name)
			SELECT DISTINCT COALESCE(NULLIF(TRIM(department), ''), 'General') AS division_name
			FROM stock_app_users
			WHERE role = 'salesperson'
			ON CONFLICT (name) DO NOTHING
		`;

		await sql`
			UPDATE stock_app_users u
			SET division_id = d.id,
					updated_at = NOW()
			FROM stock_divisions d
			WHERE u.division_id IS NULL
				AND u.role = 'salesperson'
				AND d.name = COALESCE(NULLIF(TRIM(u.department), ''), 'General')
		`;

		await sql`
			CREATE INDEX IF NOT EXISTS idx_stock_divisions_name
			ON stock_divisions(name)
		`;

		await sql`
			CREATE INDEX IF NOT EXISTS idx_stock_items_division_id
			ON stock_items(division_id)
		`;

		await sql`
			CREATE INDEX IF NOT EXISTS idx_stock_app_users_division_id
			ON stock_app_users(division_id)
		`;

		await sql`
			CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_payment_status
			ON stock_inbound_shipments(payment_status)
		`;

		await sql`
			CREATE INDEX IF NOT EXISTS idx_stock_inbound_shipments_invoice_date
			ON stock_inbound_shipments(invoice_date)
		`;

		await sql`
			CREATE INDEX IF NOT EXISTS idx_stock_inbound_items_hsn_code
			ON stock_inbound_shipment_items(hsn_code)
		`;

		console.log('Purchase capabilities migration completed successfully.');
	} catch (error) {
		console.error('Failed to run purchase capabilities migration:', error.message);
		process.exit(1);
	}
}

migratePurchaseCapabilities();
