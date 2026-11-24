'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { COMMANDS } from '@/components/stock/layout/StockTopbar';
import { matchesKey, parentPath } from '@/lib/shortcuts.mjs';

// Fields Enter walks through, Tally-style. Popover triggers (date pickers) count.
const FIELDS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button[aria-haspopup]:not([disabled])';

const isOpenLayer = () => document.querySelector('[role="dialog"][data-state="open"], [role="listbox"], [role="combobox"][aria-expanded="true"]');

export function useStockShortcuts({ dashboardSearchRef, accessRole }) {
  const router = useRouter();
  const [isApplePlatform, setIsApplePlatform] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const platform = typeof navigator !== 'undefined' ? String(navigator.platform || '') : '';
    const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    setIsApplePlatform(/mac|iphone|ipad|ipod/i.test(platform) || /mac os|iphone|ipad|ipod/i.test(userAgent));
  }, []);

  useEffect(() => {
    function handleGlobalShortcuts(event) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTypingTarget = Boolean(target) && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dashboardSearchRef.current?.focus();
        dashboardSearchRef.current?.select();
        return;
      }

      // Ctrl/⌘+Enter saves the form you're in, from any field (Tally's Ctrl+A).
      if (mod && event.key === 'Enter') {
        const form = target?.closest('form') || document.querySelector('[role="dialog"][data-state="open"] form');
        if (form) {
          event.preventDefault();
          form.requestSubmit();
        }
        return;
      }

      // Enter moves to the next field; on the last one it saves.
      if (event.key === 'Enter' && !mod && !event.shiftKey && !event.altKey
        && target?.form && (target.tagName === 'INPUT' || target.tagName === 'SELECT')
        && target.id !== 'topbar-search') {
        const fields = [...target.form.querySelectorAll(FIELDS)].filter((el) => el.getClientRects().length);
        const next = fields[fields.indexOf(target) + 1];
        event.preventDefault();
        if (next) {
          next.focus();
          if (next.select && next.tagName === 'INPUT') next.select();
        } else {
          target.form.requestSubmit();
        }
        return;
      }

      // ↑/↓ walk list rows (rows are tr[tabindex] and already open on Enter).
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && target?.matches('tr[tabindex]')) {
        const rows = [...target.closest('table').querySelectorAll('tr[tabindex]')];
        const row = rows[rows.indexOf(target) + (event.key === 'ArrowDown' ? 1 : -1)];
        if (row) {
          event.preventDefault();
          row.focus();
        }
        return;
      }

      if (isTypingTarget) return;

      // The older chords still work (on a Mac, F8/F9 are media keys without fn).
      const writable = !getRoleFlags(accessRole).isReadOnly;
      if (writable && mod && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        router.push('/stock?view=purchases&new=purchase');
        return;
      }
      if (writable && mod && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        router.push('/stock?view=dispatches&new=dispatch');
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Never from inside a form or dialog: Esc there must not drop unsaved work.
      if (event.key === 'Escape' && !isOpenLayer() && !target?.closest('form, [role="dialog"]')) {
        const up = parentPath(window.location.pathname, window.location.search);
        if (up) router.push(up);
        return;
      }

      // Tally F-keys: F8 sales, Alt+F8 delivery note, F9 purchase.
      const flags = getRoleFlags(accessRole);
      const cmd = COMMANDS.find((c) => matchesKey(c.shortcut, event) && (!c.show || c.show(flags, accessRole)));
      if (cmd) {
        event.preventDefault();
        router.push(cmd.href);
      }
    }

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [router, dashboardSearchRef, accessRole]);

  return { isApplePlatform, shortcutsOpen, setShortcutsOpen };
}
