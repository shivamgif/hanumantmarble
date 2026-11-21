'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from 'lucide-react';
import { moveItem, SPANS } from '@/lib/layout-prefs.mjs';

// Static strings so Tailwind keeps them.
const SPAN_CLASS = { 4: 'lg:col-span-4', 6: 'lg:col-span-6', 8: 'lg:col-span-8', 12: 'lg:col-span-12' };
const SPAN_LABEL = { 4: '⅓', 6: '½', 8: '⅔', 12: 'Full' };

/**
 * A tab's widgets on a 12-column grid. Rows stretch to the tallest widget, so
 * a short card never leaves a hole under it. In edit mode each widget gets a
 * bar to drag it, resize it (snapped to 4/6/8/12 columns), move it with the
 * arrow buttons (keyboard and touch), or hide it.
 *
 * items: [{ id, span, hidden }] from useLayoutPref. widgets: { id: { title, node } }.
 */
export function WidgetGrid({ items, widgets, editing, onChange, t }) {
  const [dragId, setDragId] = useState(null);
  const shown = items.filter((item) => widgets[item.id] && (editing || !item.hidden));

  const update = (id, patch) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const moveTo = (id, toId) => {
    const from = items.findIndex((item) => item.id === id);
    const to = items.findIndex((item) => item.id === toId);
    if (from !== -1 && to !== -1) onChange(moveItem(items, from, to));
  };
  // Arrows step over hidden-and-absent ids too, to the neighbour on screen.
  const step = (id, dir) => {
    const at = shown.findIndex((item) => item.id === id);
    const neighbour = shown[at + dir];
    if (neighbour) moveTo(id, neighbour.id);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      {shown.map((item, index) => {
        const { title, node } = widgets[item.id];
        return (
          <div
            key={item.id}
            id={`widget-${item.id}`}
            className={`flex min-w-0 flex-col ${SPAN_CLASS[item.span]} ${editing ? 'rounded-xl outline-dashed outline-1 outline-offset-2 outline-border' : ''} ${dragId === item.id ? 'opacity-50' : ''}`}
            draggable={editing}
            onDragStart={(event) => { setDragId(item.id); event.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(event) => { if (dragId) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); if (dragId && dragId !== item.id) moveTo(dragId, item.id); setDragId(null); }}
          >
            {editing ? (
              <div className="flex flex-wrap items-center gap-1 rounded-t-xl border border-b-0 border-border bg-muted px-2 py-1.5 text-xs">
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden="true" />
                <span className={`mr-auto truncate font-medium ${item.hidden ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{title}</span>
                <div className="flex rounded-md bg-card p-0.5" role="group" aria-label={t('widgetSize')}>
                  {SPANS.map((span) => (
                    <button
                      key={span}
                      type="button"
                      onClick={() => update(item.id, { span })}
                      aria-pressed={item.span === span}
                      className={`hidden h-6 min-w-7 rounded px-1.5 font-medium lg:block ${item.span === span ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {SPAN_LABEL[span]}
                    </button>
                  ))}
                </div>
                <IconButton label={t('moveUp')} disabled={index === 0} onClick={() => step(item.id, -1)}><ArrowUp /></IconButton>
                <IconButton label={t('moveDown')} disabled={index === shown.length - 1} onClick={() => step(item.id, 1)}><ArrowDown /></IconButton>
                <IconButton label={item.hidden ? t('showWidget') : t('hideWidget')} onClick={() => update(item.id, { hidden: !item.hidden })}>
                  {item.hidden ? <EyeOff /> : <Eye />}
                </IconButton>
              </div>
            ) : null}
            {/* The widget's own card fills the row height. */}
            <div className={`flex min-w-0 flex-1 flex-col [&>*]:flex-1 ${editing ? 'pointer-events-none select-none' : ''} ${editing && item.hidden ? 'opacity-40' : ''}`}>
              {node}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30 [&>svg]:h-3.5 [&>svg]:w-3.5"
      {...props}
    >
      {children}
    </button>
  );
}
