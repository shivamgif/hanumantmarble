'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { moveById } from '@/lib/layout-prefs.mjs';

const EDGE = 60; // px from the viewport edge where a drag starts scrolling
const SCROLL_STEP = 16;

/**
 * Drag-to-reorder from a grip, with pointer events so mouse and touch both
 * work. The list reorders live while the pointer moves (the others slide out
 * of the way) and is committed once, on release; Esc or a cancelled pointer
 * puts it back.
 *
 * Each sortable element carries data-sort-scope={scope} data-sort-id={id};
 * the grip gets {...gripProps(id, label)}. Arrow keys on a focused grip move
 * one place and commit, which is the keyboard way to do the same thing.
 *
 * items: the full list (hidden ones too, so they keep their place).
 * isVisible: which items are on screen, for keyboard steps.
 * pinned: ids that neither move nor take a drop.
 */
export function usePointerSort(items, onCommit, { scope, getId = (item) => item.id, isVisible = () => true, pinned } = {}) {
  const [drag, setDragState] = useState(null); // { id, list, label, x, y }
  // Written on every update, not on render: two pointer moves can land before
  // React re-renders, and the second must build on the first.
  const dragRef = useRef(null);
  const setDrag = useCallback((next) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  const start = useRef(null);
  // The item last swapped with. Cards differ in size, so after a swap the
  // pointer can still sit on that card; swapping straight back would flicker.
  // It can take the drag again once the pointer has been somewhere else.
  const lastSwap = useRef(null);

  const finish = useCallback((commit) => {
    const current = dragRef.current;
    setDrag(null);
    if (!current || !commit) return;
    const before = start.current.map(getId).join('|');
    if (current.list.map(getId).join('|') !== before) onCommit(current.list);
  }, [getId, onCommit, setDrag]);

  // Esc anywhere while dragging cancels it.
  useEffect(() => {
    if (!drag) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag, finish]);

  const gripProps = (id, label, name = label) => ({
    type: 'button',
    'aria-label': label,
    title: label,
    style: { touchAction: 'none' },
    onPointerDown: (event) => {
      if (pinned?.has(id) || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = items;
      lastSwap.current = null;
      setDrag({ id, list: items, label: name, x: event.clientX, y: event.clientY });
    },
    onPointerMove: (event) => {
      const current = dragRef.current;
      if (!current || current.id !== id) return;
      const { clientX: x, clientY: y } = event;
      if (y < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (window.innerHeight - y < EDGE) window.scrollBy(0, SCROLL_STEP);
      const target = document.elementFromPoint(x, y)?.closest(`[data-sort-scope="${scope}"][data-sort-id]`);
      const targetId = target?.getAttribute('data-sort-id');
      let { list } = current;
      if (targetId !== lastSwap.current) lastSwap.current = null;
      if (targetId && targetId !== id && !pinned?.has(targetId) && lastSwap.current !== targetId) {
        list = moveById(list, id, targetId, getId);
        lastSwap.current = targetId;
      }
      setDrag({ ...current, list, x, y });
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onKeyDown: (event) => {
      const dir = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
      if (!dir || pinned?.has(id)) return;
      event.preventDefault();
      const shown = items.filter(isVisible);
      const neighbour = shown[shown.findIndex((item) => getId(item) === id) + dir];
      if (neighbour && !pinned?.has(getId(neighbour))) onCommit(moveById(items, id, getId(neighbour), getId));
    },
  });

  return { list: drag?.list ?? items, dragId: drag?.id ?? null, ghost: drag, gripProps };
}

/** The name chip that follows the pointer during a drag. */
export function DragGhost({ ghost }) {
  if (!ghost) return null;
  return (
    <div
      className="pointer-events-none fixed z-[100] -translate-y-1/2 translate-x-3 rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-float"
      style={{ left: ghost.x, top: ghost.y }}
    >
      {ghost.label}
    </div>
  );
}
