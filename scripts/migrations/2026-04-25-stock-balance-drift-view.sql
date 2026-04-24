-- Reconciliation view: surface drift between stock_items.current_*_qty
-- (the column read by every code path) and stock_inventory_lots.quantity_available
-- (the source-of-truth for purchase-side quantities).
--
-- Ops: `SELECT * FROM stock_balance_drift_v WHERE whole_diff <> 0 OR broken_diff <> 0;`

CREATE OR REPLACE VIEW stock_balance_drift_v AS
WITH lot_totals AS (
  SELECT item_id,
         SUM(CASE WHEN tile_condition = 'whole'  THEN quantity_available ELSE 0 END) AS lot_whole,
         SUM(CASE WHEN tile_condition = 'broken' THEN quantity_available ELSE 0 END) AS lot_broken
    FROM stock_inventory_lots
   GROUP BY item_id
)
SELECT si.id                          AS item_id,
       si.sku,
       si.name,
       si.current_whole_qty,
       COALESCE(lt.lot_whole, 0)      AS lot_whole_qty,
       si.current_whole_qty - COALESCE(lt.lot_whole, 0)   AS whole_diff,
       si.current_broken_qty,
       COALESCE(lt.lot_broken, 0)     AS lot_broken_qty,
       si.current_broken_qty - COALESCE(lt.lot_broken, 0) AS broken_diff
  FROM stock_items si
  LEFT JOIN lot_totals lt ON lt.item_id = si.id;
