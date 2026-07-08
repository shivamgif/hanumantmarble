'use client';

import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400 shrink-0" />,
  error: <XCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />,
};

const COLORS = {
  success: 'border-emerald-500/40',
  error: 'border-red-500/40',
  warning: 'border-amber-500/40',
};

export function StockToast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] flex items-start gap-3 rounded-xl border bg-card text-card-foreground px-5 py-4 shadow-card-hover transition-all duration-200 max-w-sm ${COLORS[toast.type] ?? COLORS.success}`}
      role="status"
      aria-live="polite"
    >
      {ICONS[toast.type] ?? ICONS.success}
      <p className="text-sm font-semibold text-foreground leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none focus-ring rounded"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
