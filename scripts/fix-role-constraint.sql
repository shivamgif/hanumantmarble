-- Fix role constraint to allow new 3-role model
-- Run this before seeding if constraint still has old values

BEGIN;

-- Drop old constraint
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
    RAISE NOTICE 'Dropped constraint: %', role_constraint_name;
  END IF;
END $$;

-- Update existing roles to new model
UPDATE stock_app_users
SET role = CASE
  WHEN role = 'admin' THEN 'admin'
  WHEN role IN ('manager', 'stock_approver') THEN 'manager'
  ELSE 'stock_maintainer'
END
WHERE role NOT IN ('admin', 'manager', 'stock_maintainer');

-- Update permission flags based on normalized role
UPDATE stock_app_users
SET can_manage_users = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
    can_approve_changes = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
    can_view_dashboard = COALESCE(can_view_dashboard, TRUE)
WHERE status = 'active';

-- Add new constraint
ALTER TABLE stock_app_users
ADD CONSTRAINT stock_app_users_role_check
CHECK (role IN ('admin', 'manager', 'stock_maintainer'));

COMMIT;

-- Verify
SELECT COUNT(*) as total_users, 
       COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
       COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_count,
       COUNT(CASE WHEN role = 'stock_maintainer' THEN 1 END) as maintainer_count
FROM stock_app_users;
