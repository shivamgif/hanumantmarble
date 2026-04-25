'use client';

import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />,
  error: <XCircle className="h-5 w-5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />,
};

const COLORS = {
  success: 'border-emerald-500/30 bg-slate-900/95',
  error: 'border-red-500/30 bg-slate-900/95',
  warning: 'border-amber-500/30 bg-slate-900/95',
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
      className={`fixed bottom-6 right-6 z-[9999] flex items-start gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-xl transition-all duration-300 max-w-sm ${COLORS[toast.type] ?? COLORS.success}`}
      role="status"
      aria-live="polite"
    >
      {ICONS[toast.type] ?? ICONS.success}
      <p className="text-sm font-semibold text-white leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 text-slate-400 hover:text-white transition-colors text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
