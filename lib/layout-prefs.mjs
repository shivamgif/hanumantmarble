// A user's saved arrangement of a list of things (analytics widgets, sidebar
// links), stored in stock_app_users.ui_prefs as { order, span, hidden }.
// The code's own list is always the source of truth: saved ids that no longer
// exist are dropped, and new ids appear where the defaults put them. So
// shipping or removing a widget never breaks anyone's saved layout, and a
// saved layout can never add something the code (or the role) did not offer.

export const SPANS = [4, 6, 8, 12];

// Which ui_prefs keys exist. Anything else is refused by the API.
export const PREF_KEYS = /^(analytics\.(overview|sales|inventory|team)|nav)$/;

const ID = /^[\w/-]{1,60}$/;

/** Keep only well-formed parts of a layout a client sent. */
export function sanitizeLayout(value) {
  const ids = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && ID.test(id)))].slice(0, 50);
  const span = {};
  for (const [id, n] of Object.entries(value && typeof value.span === 'object' && value.span ? value.span : {})) {
    if (ID.test(id) && SPANS.includes(n)) span[id] = n;
  }
  return { order: ids(value?.order), span, hidden: ids(value?.hidden) };
}

/**
 * defaults: [{ id, span? }] in the code's order. saved: { order, span, hidden }.
 * Returns [{ id, span, hidden }] in the user's order.
 */
export function mergeLayout(defaults, saved) {
  const byId = new Map(defaults.map((item) => [item.id, item]));
  const clean = sanitizeLayout(saved);
  const order = clean.order.filter((id) => byId.has(id));
  const placed = new Set(order);

  // A new id goes right after the nearest default-order neighbour above it
  // that the user already has, or first if there is none.
  defaults.forEach((item, index) => {
    if (placed.has(item.id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const pos = order.indexOf(defaults[i].id);
      if (pos !== -1) { at = pos + 1; break; }
    }
    order.splice(at, 0, item.id);
    placed.add(item.id);
  });

  const hidden = new Set(clean.hidden);
  return order.map((id) => ({
    id,
    span: clean.span[id] ?? byId.get(id).span ?? 12,
    hidden: hidden.has(id),
  }));
}

/** The compact form to save back, from mergeLayout's output. */
export function toSaved(items) {
  return {
    order: items.map((item) => item.id),
    span: Object.fromEntries(items.map((item) => [item.id, item.span])),
    hidden: items.filter((item) => item.hidden).map((item) => item.id),
  };
}

/** Move the item at `from` to index `to`. */
export function moveItem(items, from, to) {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Move the item with id `fromId` to where `toId` is, by `getId` (default .id). */
export function moveById(items, fromId, toId, getId = (item) => item.id) {
  const from = items.findIndex((item) => getId(item) === fromId);
  const to = items.findIndex((item) => getId(item) === toId);
  return from === -1 || to === -1 ? items : moveItem(items, from, to);
}

/**
 * A resize drag: the span the card started at, plus how far the pointer moved
 * (px) over one column's width, snapped to the nearest allowed span.
 */
export function snapSpan(startSpan, dx, colWidth) {
  if (!(colWidth > 0)) return startSpan;
  const raw = startSpan + dx / colWidth;
  return SPANS.reduce((best, span) => (Math.abs(span - raw) < Math.abs(best - raw) ? span : best), SPANS[0]);
}
