-- Counted goods ("bag" category) can carry their own unit, so a trader who
-- sells rolls, drums or pieces gets that unit and its GST unit code (UQC) on
-- the invoice, e-invoice and e-way bill. Both NULL = today's behaviour
-- ("bag" / BAG), which is what every existing type keeps.
-- Boxes-of-pieces (tile) and area (stone, sqft) keep their built-in units.
ALTER TABLE stock_types
  ADD COLUMN unit_label TEXT CHECK (unit_label IS NULL OR length(trim(unit_label)) BETWEEN 1 AND 12),
  ADD COLUMN uqc TEXT CHECK (uqc IS NULL OR uqc ~ '^[A-Z]{3}$');
