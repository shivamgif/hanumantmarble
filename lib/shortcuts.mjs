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
