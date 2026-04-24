-- ⚠️ DRAFT — DO NOT APPLY UNTIL OUTBOUND FLOW IS LOT-AWARE.
-- Prerequisite: the outbound approval path must be changed to decrement
-- stock_inventory_lots (e.g. FIFO across lots) instead of mutating
-- stock_items.current_whole_qty directly. Until that lands, dispatches
-- would not reduce any lot row, and the trigger below would repeatedly
-- reset the balance back to the full sum of lots — effectively undoing
-- every outbound movement.
--
-- Follow-up code change required before applying:
--   1. app/api/stock/outbound-shipments/[id]/route.js → applyShipmentApproval:
--      replace `UPDATE stock_items SET current_whole_qty = current_whole_qty - $1`
--      with a lot-consuming loop over stock_inventory_lots for that item.
--   2. Remove manual `UPDATE stock_items SET current_whole_qty = current_whole_qty + $1`
--      from the inbound approval path (trigger will handle it).
--   3. Remove the per-condition UPDATE inside reverseInboundShipmentStock
--      (the lot DELETE already propagates through the trigger).
--
-- Until then, rely on the reconciliation VIEW added in the companion
-- migration (`…-stock-balance-drift-view.sql`) to surface drift for ops.
--
-- Make stock_items.current_whole_qty / current_broken_qty authoritatively
-- derived from stock_inventory_lots via AFTER triggers, then backfill.
--
-- Motivation: `stock_items.current_whole_qty` and `stock_inventory_lots.quantity_available`
-- were maintained by separate code paths (approval flow vs. view), so they could
-- silently drift. We keep stock_items as the read surface (existing code + indexes),
-- but make it a trigger-maintained projection of the lots table. Every code path
-- that touches a lot now updates the balance automatically.

BEGIN;

CREATE OR REPLACE FUNCTION stock_items_recompute_balance(p_item_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE stock_items si
     SET current_whole_qty = COALESCE((
           SELECT SUM(quantity_available)
             FROM stock_inventory_lots
            WHERE item_id = p_item_id
              AND tile_condition = 'whole'
         ), 0),
         current_broken_qty = COALESCE((
           SELECT SUM(quantity_available)
             FROM stock_inventory_lots
            WHERE item_id = p_item_id
              AND tile_condition = 'broken'
         ), 0),
         updated_at = NOW()
   WHERE si.id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION stock_inventory_lots_sync_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM stock_items_recompute_balance(OLD.item_id);
    RETURN OLD;
  END IF;

  PERFORM stock_items_recompute_balance(NEW.item_id);
  IF TG_OP = 'UPDATE' AND NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    PERFORM stock_items_recompute_balance(OLD.item_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_inventory_lots_sync_balance_trg ON stock_inventory_lots;
CREATE TRIGGER stock_inventory_lots_sync_balance_trg
AFTER INSERT OR UPDATE OR DELETE ON stock_inventory_lots
FOR EACH ROW EXECUTE FUNCTION stock_inventory_lots_sync_balance();

-- One-shot backfill so existing rows match the new source of truth.
UPDATE stock_items si
   SET current_whole_qty = COALESCE(w.q, 0),
       current_broken_qty = COALESCE(b.q, 0),
       updated_at = NOW()
  FROM (
        SELECT item_id, SUM(quantity_available) AS q
          FROM stock_inventory_lots
         WHERE tile_condition = 'whole'
         GROUP BY item_id
       ) w
  FULL OUTER JOIN (
        SELECT item_id, SUM(quantity_available) AS q
          FROM stock_inventory_lots
         WHERE tile_condition = 'broken'
         GROUP BY item_id
       ) b ON b.item_id = w.item_id
 WHERE si.id = COALESCE(w.item_id, b.item_id);

COMMIT;
