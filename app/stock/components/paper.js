'use client';

import { useEffect, useRef, useState } from 'react';

// 210 mm at the CSS 96 dpi.
const A4_PX = 793.7;

/**
 * A printable A4 sheet (invoice, note, ledger). Laid out at true A4 width on
 * every screen and zoomed down to fit a narrow one, like a PDF preview, so a
 * phone shows the same page instead of a nine-column table squeezed until it
 * wraps. Print ignores the zoom and fills the page.
 */
export function Paper({ className = '', children }) {
  const ref = useRef(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return undefined;
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(1, entry.contentRect.width / A4_PX)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      ref={ref}
      style={{ zoom }}
      className={`paper mx-auto w-[210mm] max-w-none bg-white p-6 shadow-sm print:w-full print:p-0 print:shadow-none print:![zoom:1] ${className}`}
    >
      {children}
    </article>
  );
}
