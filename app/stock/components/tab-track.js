'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const ACTIVE_TAB = '[aria-current="true"], [aria-selected="true"]';

// Marks which ends have tabs scrolled past them; globals.css fades those edges
// (.tab-scroll[data-more]) so the labels visibly run on instead of stopping.
function markOverflow(el) {
  const start = el.scrollLeft > 1;
  const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  el.dataset.more = start && end ? 'both' : start ? 'start' : end ? 'end' : '';
}

/**
 * The page tab strip: one row at every width. On a phone the tabs share the
 * width and the row scrolls sideways when they don't fit. The grey track sits
 * outside the scroller so only the labels fade, not the track itself.
 * Props (role="tablist" and the like) go on the scroller, which holds the tabs.
 */
export function TabTrack({ children, ...props }) {
  const { language } = useLanguage();
  const ref = useRef(null);
  const shownActive = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const update = () => markOverflow(el);
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  // Every render: tabs and labels can change (language, badges). When the
  // selected tab changes and is out of view, centre it; a page opened on a
  // later tab otherwise shows the highlight off-screen.
  useEffect(() => {
    const el = ref.current;
    const active = el.querySelector(ACTIVE_TAB);
    if (active && active !== shownActive.current) {
      shownActive.current = active;
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = left - (el.clientWidth - active.offsetWidth) / 2;
      }
    }
    markOverflow(el);
    // 1-9 switch tabs (hooks/useStockShortcuts.js): say so on hover and to
    // assistive tech. Set here, not by each page, so every strip gets it.
    [...el.children].slice(0, 9).forEach((tab, index) => {
      const key = String(index + 1);
      tab.setAttribute('aria-keyshortcuts', key);
      tab.title = language === 'hi' ? `शॉर्टकट: ${key}` : `Shortcut: ${key}`;
    });
  });

  return (
    <div className="w-full min-w-0 rounded-lg bg-muted sm:w-fit sm:max-w-full">
      <div ref={ref} className="tab-scroll relative flex items-center gap-1 overflow-x-auto p-1 scrollbar-none" {...props}>
        {children}
      </div>
    </div>
  );
}
