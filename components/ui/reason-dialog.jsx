'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

/**
 * Collects a short reason before an action runs. Replaces window.prompt, which
 * blocks the page, ignores the app's styling, and cannot say what is about to
 * happen or which button is destructive.
 *
 * Controlled by a single `request` object so a caller can keep one piece of
 * state per page: pass null to close.
 *   { title, description, placeholder, required, confirmText, tone, onSubmit }
 */
export function ReasonDialog({ request, onClose }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue('');
  }, [request]);

  if (!request) return null;

  const blocked = Boolean(request.required) && !value.trim();

  function submit(event) {
    event.preventDefault();
    if (blocked) return;
    const reason = value.trim();
    onClose();
    request.onSubmit(reason);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/50 animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[9999] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl animate-scale-in"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            e.currentTarget.querySelector('textarea')?.focus();
          }}
        >
          <Dialog.Title className="text-base font-black tracking-tight">{request.title}</Dialog.Title>
          {request.description ? (
            <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
              {request.description}
            </Dialog.Description>
          ) : null}

          <form onSubmit={submit}>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              placeholder={request.placeholder}
              aria-label={request.placeholder || request.title}
              className="mt-4 w-full resize-none rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-brand-primary/50 focus:ring-4 focus:ring-brand-primary/10"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="min-h-[44px] rounded-full border border-border px-5 text-xs font-black uppercase tracking-widest transition-colors hover:bg-muted/60 focus-ring"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={blocked}
                className={`min-h-[44px] rounded-full px-5 text-xs font-black uppercase tracking-widest text-white transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                  request.tone === 'rose' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {request.confirmText || 'Confirm'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
