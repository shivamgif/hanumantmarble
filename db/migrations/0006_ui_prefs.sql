-- Each person's own screen arrangement: analytics widget order, sizes and
-- hidden widgets, and sidebar link order (lib/layout-prefs.mjs). Saved per
-- staff row, so it follows them to every device. Cosmetic only: permissions
-- never read it.
ALTER TABLE stock_app_users
  ADD COLUMN ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb
  CHECK (octet_length(ui_prefs::text) <= 16000);
