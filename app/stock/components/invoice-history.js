'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, MessageSquare, Send } from 'lucide-react';
import { ERROR_BOX_CLASS, FORM_INPUT_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';

/**
 * History and comments under an invoice, newest first: the server's log of
 * actions, and what people wrote.
 * A review's summary already lists what changed. Screen only: hidden in print.
 */
export function InvoiceHistory({ invoiceId, t }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/stock/sales-invoices/${invoiceId}/history`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Failed to load history');
        setEvents(json.events || []);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [invoiceId]);
  useEffect(load, [load]);

  const post = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/stock/sales-invoices/${invoiceId}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to add comment');
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="glass-panel mx-auto w-full max-w-[210mm] space-y-4 rounded-xl p-4 print:hidden">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <History className="h-4 w-4" /> {t('history')}
      </h2>

      <form onSubmit={post} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e); }}
          maxLength={1000}
          rows={2}
          placeholder={t('addComment')}
          aria-label={t('addComment')}
          className={FORM_INPUT_CLASS}
        />
        <div className="flex justify-end">
          <button type="submit" disabled={posting || !text.trim()} className={PILL_PRIMARY_BUTTON_CLASS}>
            <Send className="h-3.5 w-3.5" /> {t('postComment')}
          </button>
        </div>
      </form>

      {error ? <p role="alert" className={ERROR_BOX_CLASS}>{error}</p> : null}

      {events === null ? (
        <div className="h-12 skeleton rounded-lg" aria-busy="true" />
      ) : !events.length ? (
        <p className="text-sm text-muted-foreground">{t('noHistory')}</p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const isComment = event.details?.action === 'comment';
            return (
              <li key={event.id} className="flex gap-3">
                <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isComment ? 'bg-sky-500/10 text-sky-600' : 'bg-slate-500/10 text-slate-500'}`}>
                  {isComment ? <MessageSquare className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{event.user_name || '—'}</span> · {event.occurred_text}
                  </p>
                  <p className={`whitespace-pre-wrap break-words text-sm ${isComment ? 'mt-1 rounded-lg bg-muted px-3 py-2 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                    {event.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
