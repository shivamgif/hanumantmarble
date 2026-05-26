// Helpers for piece-aware stock balance arithmetic.
//
// Stock is stored as boxes (current_whole_qty) plus a sub-box piece
// counter (current_piece_remainder). When pieces_per_box (ppb) > 1
// and a sale is recorded with sell_unit='piece', the loaded quantity
// is interpreted as pieces and must roll over from whole boxes.

export function isPieceSale(sellUnit, piecesPerBox) {
  const ppb = Number(piecesPerBox || 0);
  return sellUnit === 'piece' && ppb > 1;
}

export function totalPieces(currentWholeQty, currentPieceRemainder, piecesPerBox) {
  const ppb = Number(piecesPerBox || 0);
  if (ppb <= 1) return Number(currentWholeQty || 0);
  return Number(currentWholeQty || 0) * ppb + Number(currentPieceRemainder || 0);
}

// Returns { boxDelta, remainderTarget } for a piece-unit decrement.
// boxDelta is the number of whole boxes to subtract (>=0).
// remainderTarget is the new absolute value for current_piece_remainder (0..ppb-1).
// Throws if insufficient stock.
export function computePieceDecrement({
  pieces,
  currentWholeQty,
  currentPieceRemainder,
  piecesPerBox,
}) {
  const ppb = Number(piecesPerBox);
  const haveBoxes = Number(currentWholeQty || 0);
  const haveRem = Number(currentPieceRemainder || 0);
  const total = haveBoxes * ppb + haveRem;
  if (pieces > total) {
    throw new Error(`Insufficient stock: need ${pieces} pieces, have ${total}`);
  }
  let newRem = haveRem - pieces;
  let boxDelta = 0;
  while (newRem < 0) {
    newRem += ppb;
    boxDelta += 1;
  }
  return { boxDelta, remainderTarget: newRem };
}

// Inverse of computePieceDecrement: returns the new (whole, remainder)
// after adding `pieces` back (used for return / revert paths).
export function computePieceIncrement({
  pieces,
  currentWholeQty,
  currentPieceRemainder,
  piecesPerBox,
}) {
  const ppb = Number(piecesPerBox);
  let newRem = Number(currentPieceRemainder || 0) + pieces;
  let boxDelta = 0;
  while (newRem >= ppb) {
    newRem -= ppb;
    boxDelta += 1;
  }
  return { boxDelta, remainderTarget: newRem };
}
