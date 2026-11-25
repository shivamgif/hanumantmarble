'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  error: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />,
};

// ponytail: the 4 newest; older ones drop off the top of the stack.
const MAX_STACK = 4;
let nextId = 0;

function ToastItem({ toast, onDismiss }) {
  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);
  // Errors stay until dismissed. Auto-hiding the one message someone has to
  // act on is how a failed save goes unnoticed.
  useEffect(() => {
    if (toast.type === 'error') return undefined;
    const timer = setTimeout(dismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast.type, dismiss]);

  return (
    <div
      className="pointer-events-auto flex w-full items-start gap-2 rounded-lg border border-border bg-popover px-4 py-2 text-popover-foreground shadow-float animate-in fade-in-0 slide-in-from-bottom-2 duration-150"
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <span className="flex h-5 items-center">{ICONS[toast.type] ?? ICONS.success}</span>
      <p className="flex-1 text-sm font-medium leading-5">{toast.message}</p>
      <button
        type="button"
        onClick={dismiss}
        className="-mr-2 rounded-lg px-2 text-lg leading-none text-muted-foreground transition-colors hover:text-foreground focus-ring"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// Pass each new message as a fresh `toast` object; they stack, newest at the
// bottom, and each one leaves on its own.
export function StockToast({ toast }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  useEffect(() => {
    if (toast) setItems((list) => [...list, { ...toast, id: ++nextId }].slice(-MAX_STACK));
  }, [toast]);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex w-[min(24rem,calc(100vw-3rem))] flex-col items-end gap-2" aria-live="polite">
      {items.map((item) => (
        <ToastItem key={item.id} toast={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
