// Tally's "go back a screen": /stock/invoices/42 → /stock/invoices, ?view=x → its page.
export function parentPath(pathname, search) {
  if (search && search !== '?') return pathname;
  if (pathname === '/stock') return null;
  return pathname.slice(0, pathname.lastIndexOf('/')) || '/stock';
}

// 'F8' / 'Alt+F8' as written on a command, against a keydown.
export function matchesKey(spec, event) {
  if (!spec) return false;
  const alt = spec.startsWith('Alt+');
  return event.key === (alt ? spec.slice(4) : spec) && event.altKey === alt && !event.ctrlKey && !event.metaKey;
}

// A key pressed on its own: no Ctrl, ⌘ or Alt. Shift is allowed, since on some
// layouts '/' and '?' need it.
export function isBareKey(event) {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

// 1-9 pick the page's first nine tabs. Returns the tab's index, or -1.
export function tabIndexFor(event) {
  if (!isBareKey(event) || event.shiftKey) return -1;
  return /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
}
