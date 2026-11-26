'use client';

import { useRef, useState } from 'react';
import { EyeOff, GripHorizontal, LayoutGrid, RotateCcw, Eye } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SPANS, snapSpan } from '@/lib/layout-prefs.mjs';
import { DragGhost, usePointerSort } from '@/hooks/usePointerSort';

// Static strings so Tailwind keeps them.
const SPAN_CLASS = { 4: 'lg:col-span-4', 6: 'lg:col-span-6', 8: 'lg:col-span-8', 12: 'lg:col-span-12' };
const SPAN_LABEL = { 4: '⅓', 6: '½', 8: '⅔', 12: 'Full' };
// Hover controls: shown on hover or keyboard focus, always on touch screens.
const REVEAL = 'opacity-0 transition-opacity group-hover/widget:opacity-100 group-focus-within/widget:opacity-100 [@media(hover:none)]:opacity-100';

/**
 * A tab's widgets on a 12-column grid, arranged in place: drag the grip on a
 * card's top edge to move it (the rest reflow live), drag its right edge to
 * resize (snapped to ⅓ / ½ / ⅔ / full), or hide it. Hidden widgets and the
 * reset live in LayoutMenu. Rows stretch to the tallest widget, so a short
 * card never leaves a hole under it.
 *
 * items: [{ id, span, hidden }] from useLayoutPref. widgets: { id: { title, node } }.
 */
export function WidgetGrid({ items, widgets, onChange, t }) {
  const gridRef = useRef(null);
  const [resize, setResize] = useState(null); // { id, span, startSpan, startX, colWidth }
  const sort = usePointerSort(items, onChange, {
    scope: 'widgets',
    isVisible: (item) => widgets[item.id] && !item.hidden,
  });
  const shown = sort.list.filter((item) => widgets[item.id] && !item.hidden);
  const update = (id, patch) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const resizeProps = (item, title) => ({
    type: 'button',
    'aria-label': `${t('dragToResize')}: ${title}`,
    title: t('dragToResize'),
    style: { touchAction: 'none' },
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      // One column is a twelfth of the grid plus its share of the gaps.
      const grid = gridRef.current;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      setResize({ id: item.id, span: item.span, startSpan: item.span, startX: event.clientX, colWidth: (grid.clientWidth + gap) / 12 });
    },
    onPointerMove: (event) => {
      if (resize?.id !== item.id) return;
      const span = snapSpan(resize.startSpan, event.clientX - resize.startX, resize.colWidth);
      if (span !== resize.span) setResize({ ...resize, span });
    },
    onPointerUp: () => {
      if (resize?.id === item.id && resize.span !== item.span) update(item.id, { span: resize.span });
      setResize(null);
    },
    onPointerCancel: () => setResize(null),
    onKeyDown: (event) => {
      const dir = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!dir) return;
      event.preventDefault();
      const next = SPANS[SPANS.indexOf(item.span) + dir];
      if (next) update(item.id, { span: next });
    },
  });

  return (
    <>
      <div ref={gridRef} className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        {shown.map((item) => {
          const { title, node } = widgets[item.id];
          const span = resize?.id === item.id ? resize.span : item.span;
          const dragging = sort.dragId === item.id;
          return (
            <div
              key={item.id}
              id={`widget-${item.id}`}
              data-sort-scope="widgets"
              data-sort-id={item.id}
              className={`group/widget relative flex min-w-0 flex-col ${SPAN_CLASS[span]} ${dragging ? 'rounded-lg opacity-60 outline-dashed outline-2 outline-offset-2 outline-border' : ''}`}
            >
              {/* Move + hide, on the card's top edge, outside its content. */}
              <div className={`absolute -top-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center rounded-full border border-border bg-card px-0.5 shadow-sm ${dragging || resize?.id === item.id ? 'opacity-100' : REVEAL}`}>
                <button
                  {...sort.gripProps(item.id, `${t('dragToMove')}: ${title}`, title)}
                  className="flex h-5 w-7 cursor-grab items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-ring active:cursor-grabbing"
                >
                  <GripHorizontal className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`${t('hideWidget')}: ${title}`}
                  title={t('hideWidget')}
                  onClick={() => update(item.id, { hidden: true })}
                  className="flex h-5 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              </div>

              {/* Resize: the right edge, in the gutter. Wide screens only - mobile is one column. */}
              <button
                {...resizeProps(item, title)}
                className={`absolute -right-[15px] top-1/2 z-10 hidden h-12 w-1.5 -translate-y-1/2 cursor-col-resize rounded-full bg-border hover:bg-muted-foreground focus-ring lg:block ${resize?.id === item.id ? '!bg-primary opacity-100' : REVEAL}`}
              />
              {resize?.id === item.id ? (
                <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-float">
                  {SPAN_LABEL[span]}
                </span>
              ) : null}

              {/* The widget's own card fills the row height. */}
              <div className={`flex min-w-0 flex-1 flex-col [&>*]:flex-1 ${sort.dragId || resize ? 'pointer-events-none select-none' : ''}`}>{node}</div>
            </div>
          );
        })}
      </div>
      <DragGhost ghost={sort.ghost} />
    </>
  );
}

/** Hidden widgets to bring back, and the reset. Sits in the page header. */
export function LayoutMenu({ items, widgets, onChange, onReset, t }) {
  const hidden = items.filter((item) => item.hidden && widgets[item.id]);
  const show = (id) => onChange(items.map((item) => (item.id === id ? { ...item, hidden: false } : item)));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t('layoutMenu')}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-ring"
        >
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">{t('layoutMenu')}</span>
          {hidden.length > 0 ? <span className="rounded-md bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{hidden.length}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="px-1 pb-1 text-[11px] text-muted-foreground">{t('layoutHint')}</p>
        <p className="px-1 pt-1 text-xs font-medium text-foreground">{t('hiddenWidgets')}</p>
        {hidden.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">{t('noHiddenWidgets')}</p>
        ) : (
          <ul className="py-1">
            {hidden.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground">{widgets[item.id].title}</span>
                <button
                  type="button"
                  onClick={() => show(item.id)}
                  className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
                >
                  <Eye className="h-3 w-3" /> {t('showWidget')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onReset}
          className="mt-1 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {t('resetLayout')}
        </button>
      </PopoverContent>
    </Popover>
  );
}
