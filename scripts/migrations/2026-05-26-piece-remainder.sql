-- Add piece-level remainder counter so tile items sold by the piece
-- can decrement sub-box quantities without losing pieces_per_box precision.
--
-- Invariant (when pieces_per_box > 1):
--   total_available_pieces = current_whole_qty * pieces_per_box + current_piece_remainder
--   0 <= current_piece_remainder < pieces_per_box
--
-- Outbound decrement for sellUnit='piece' rolls over from whole boxes when
-- remainder would go negative. Box sales are unaffected (remainder untouched).

BEGIN;

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS current_piece_remainder INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_piece_remainder_nonneg
  CHECK (current_piece_remainder >= 0);

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS current_broken_piece_remainder INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_broken_piece_remainder_nonneg
  CHECK (current_broken_piece_remainder >= 0);

COMMIT;
