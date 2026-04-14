#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateSalespersonRole() {
  try {
    await sql`
      DO $$
      DECLARE
        role_constraint_name TEXT;
      BEGIN
        -- Explicitly drop the known constraint name first to avoid duplicate-constraint errors.
        ALTER TABLE stock_app_users
        DROP CONSTRAINT IF EXISTS stock_app_users_role_check;

        -- Drop any other legacy role check constraints if present.
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
          WHEN role IN ('salesperson', 'sales_person', 'sales') THEN 'salesperson'
          ELSE 'stock_maintainer'
        END;

        UPDATE stock_app_users
        SET can_manage_users = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
            can_approve_changes = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
            can_view_dashboard = COALESCE(can_view_dashboard, TRUE);

        ALTER TABLE stock_app_users
        ADD CONSTRAINT stock_app_users_role_check
        CHECK (role IN ('admin', 'manager', 'stock_maintainer', 'salesperson'));
      END $$;
    `;

    console.log('Salesperson role migration completed successfully.');
  } catch (error) {
    console.error('Failed to run salesperson role migration:', error.message);
    process.exit(1);
  }
}

migrateSalespersonRole();
