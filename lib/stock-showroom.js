// Showroom stock is owned and physically present, but it sits at the showroom
// rather than the warehouse, so it is deliberately excluded from the outbound
// availability checks. Without a hint, "exceeds available 0" reads as "we don't
// have it" when the slab is on a cassette twenty metres away.
//
// Showroom stock carries a STATE:
//   cassette  — on display, sellable (pull it back to the warehouse, then dispatch)
//   installed — stuck down as flooring, not sellable
//
// The state is re-classifiable both ways. Staff pick it at the moment of the
// move and sometimes pick wrong, or only find out later, so "installed" is a
// tracked subset rather than a one-way write-off.
//
//   showroom_whole_qty / showroom_sqft   = TOTAL at the showroom
//   showroom_installed_*                 = the stuck-down part
//   cassette (sellable)                  = total - installed
//
// Relative import, not '@/lib/...', so scripts/check-showroom-move.mjs can load
// this under bare node without the Next.js path alias.
import { toSqft, toPositiveSqft } from './stock-sqft.js';

export const SHOWROOM_STATES = ['cassette', 'installed'];

// warehouseSign / showroomSign / installedSign are the deltas applied to the
// three counters. `reclassify` moves stock between states without changing the
// showroom total, so both of the first two are 0.
//
// movementType must stay inside the stock_movements CHECK. A reclassify is
// recorded as an adjustment because what actually changes is how much is
// *sellable*: →installed removes stock from sale, →cassette returns it.
export const SHOWROOM_MOVES = {
  to_cassette: {
    warehouseSign: -1, showroomSign: +1, installedSign: 0,
    movementType: 'transfer_out', direction: 'out',
    label: 'To showroom (cassette)',
  },
  to_installed: {
    warehouseSign: -1, showroomSign: +1, installedSign: +1,
    movementType: 'transfer_out', direction: 'out',
    label: 'To showroom (installed)',
  },
  to_warehouse: {
    warehouseSign: +1, showroomSign: -1, installedSign: 0,
    movementType: 'transfer_in', direction: 'in',
    label: 'Back to warehouse',
  },
  reclassify_installed: {
    warehouseSign: 0, showroomSign: 0, installedSign: +1,
    movementType: 'adjustment_minus', direction: 'out',
    label: 'Marked installed',
  },
  reclassify_cassette: {
    warehouseSign: 0, showroomSign: 0, installedSign: -1,
    movementType: 'adjustment_plus', direction: 'in',
    label: 'Marked back on cassette',
  },
};

// The API takes { action, state }; this flattens that to one move key so the UI
// can send a radio value rather than knowing the internal names.
export function showroomMoveKey(action, state) {
  if (action === 'to_showroom') return state === 'installed' ? 'to_installed' : 'to_cassette';
  if (action === 'reclassify') return state === 'installed' ? 'reclassify_installed' : 'reclassify_cassette';
  return action;
}

function toPositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Resolve one showroom move into the columns, signs and quantity to apply.
 * Pure — all the unit branching lives here so it can be asserted without a DB
 * (scripts/check-showroom-move.mjs). Returns null for an unknown move.
 *
 * Stone (unit_of_measure 'sqft') is fractional and lives in the *_sqft columns;
 * bags and tiles reuse the whole-qty columns.
 */
export function resolveShowroomMove({ move: moveKey, unitOfMeasure, qty }) {
  const move = SHOWROOM_MOVES[moveKey];
  if (!move) return null;

  const isStone = unitOfMeasure === 'sqft';

  return {
    ...move,
    key: moveKey,
    isStone,
    warehouseColumn: isStone ? 'current_sqft' : 'current_whole_qty',
    showroomColumn: isStone ? 'showroom_sqft' : 'showroom_whole_qty',
    installedColumn: isStone ? 'showroom_installed_sqft' : 'showroom_installed_whole_qty',
    qty: isStone ? toPositiveSqft(qty) : toPositiveInteger(qty),
    unit: isStone ? 'sqft' : unitOfMeasure === 'bag' ? 'bags' : 'boxes',
    sourceType: `showroom_${moveKey}`,
  };
}

// Read side: total at the showroom, split by state. `row` needs the showroom_*
// and showroom_installed_* columns selected. NUMERIC arrives from pg as a
// string, so never do bare arithmetic on the raw value.
export function showroomSplit(row) {
  const isStone = row?.unit_of_measure === 'sqft';
  const total = isStone ? toSqft(row?.showroom_sqft) : Number(row?.showroom_whole_qty || 0);
  const installed = isStone
    ? toSqft(row?.showroom_installed_sqft)
    : Number(row?.showroom_installed_whole_qty || 0);
  return {
    total,
    installed,
    // Only cassette stock can go back to the warehouse and be sold.
    cassette: isStone ? toSqft(total - installed) : total - installed,
    unit: isStone ? 'sqft' : row?.unit_of_measure === 'bag' ? 'bags' : 'box',
  };
}

/**
 * Suffix for an insufficient-stock message. Empty when nothing sellable is at
 * the showroom, so callers can append unconditionally. Installed stock is
 * excluded — it is stuck to a floor and cannot be dispatched.
 */
export function showroomHint(row) {
  if (!row) return '';
  const { cassette, unit } = showroomSplit(row);
  if (cassette <= 0) return '';
  return ` — ${cassette} ${unit} is on display at the showroom, bring it back to the warehouse first.`;
}
