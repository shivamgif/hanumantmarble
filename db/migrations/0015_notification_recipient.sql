-- Notifications become a per-person inbox. A row was one shared entry for the
-- whole business: everyone saw every row, and one person reading it marked it
-- read for everyone. Now each row belongs to one recipient, and is_read is
-- that person's own state.
ALTER TABLE stock_notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id BIGINT REFERENCES stock_app_users(id) ON DELETE CASCADE;

-- Older shared rows have no recipient. They are hidden from every inbox, so
-- they are marked read and leave no badge behind.
UPDATE stock_notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
 WHERE recipient_user_id IS NULL AND is_read = FALSE;

DROP INDEX IF EXISTS idx_stock_notifications_tenant_unread;
CREATE INDEX IF NOT EXISTS idx_stock_notifications_recipient_unread
  ON stock_notifications (tenant_id, recipient_user_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_stock_notifications_recipient_created
  ON stock_notifications (tenant_id, recipient_user_id, created_at DESC);
-- One open (unread) entry per person per item: a later update to the same
-- dispatch or estimate replaces the entry instead of stacking a new one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_notifications_open_thread
  ON stock_notifications (tenant_id, recipient_user_id, source_table, source_id)
  WHERE is_read = FALSE AND recipient_user_id IS NOT NULL AND source_id IS NOT NULL;
