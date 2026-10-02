"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const EMPTY = new Set([null, undefined, '', '—', '-']);

function formatPreviewValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—';
  }

  if (value !== null && typeof value === 'object' && !value.$$typeof) {
    return JSON.stringify(value, null, 2);
  }

  return value;
}

const isEmpty = (value) => EMPTY.has(value) || (Array.isArray(value) && value.length === 0);

// Label left, value right, two columns from sm up. Empty values are dropped:
// a sheet of dashes is scrolling for nothing. Long text (notes, addresses)
// takes the full row and stacks under its label.
export function PreviewKeyValueGrid({ items = [], hideEmpty = true }) {
  const visibleItems = items.filter((item) => item && !(hideEmpty && isEmpty(item.value)));

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {visibleItems.map((item, i) => {
        const value = formatPreviewValue(item.value);
        const wide = item.wide || (typeof value === 'string' && value.length > 40);
        return (
          <div
            key={item.label ?? i}
            className={wide
              ? 'border-b border-border py-2 sm:col-span-2'
              : 'flex items-baseline justify-between gap-4 border-b border-border py-2'}
          >
            <dt className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{item.label}</dt>
            <dd className={`min-w-0 whitespace-pre-wrap break-words text-sm font-medium text-slate-900 dark:text-slate-100 ${wide ? 'mt-0.5' : 'text-right'}`}>
              {value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// The few numbers a preview is opened for, side by side above the details.
export function PreviewStats({ items = [] }) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;
  return (
    <dl className={`grid gap-px overflow-hidden rounded-lg border border-border bg-border ${visibleItems.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : visibleItems.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {visibleItems.map((item, i) => (
        <div key={item.label ?? i} className="min-w-0 bg-card px-3 py-2.5">
          <dt className="truncate text-xs text-slate-500 dark:text-slate-400" title={typeof item.label === 'string' ? item.label : undefined}>{item.label}</dt>
          <dd className={`mt-0.5 truncate text-base font-semibold tabular-nums ${item.tone || 'text-slate-900 dark:text-slate-50'}`}>{item.value}</dd>
          {item.sub ? <dd className="truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">{item.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export default function EntryPreviewSheet({
  open,
  onOpenChange,
  title,
  description,
  summary,
  sections = [],
  footer,
}) {
  const visibleSections = sections.filter(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Header and actions stay put; only the body scrolls. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</SheetTitle>
          {description ? (
            <SheetDescription asChild>
              <div className="text-sm text-slate-500 dark:text-slate-400">{description}</div>
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {summary ? <div>{summary}</div> : null}

          {visibleSections.map((section, i) => (
            <section key={section.title ?? i} className="space-y-2">
              {section.title ? (
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{section.title}</h3>
                  {section.description ? <p className="text-xs text-slate-500">{section.description}</p> : null}
                </div>
              ) : null}
              {section.children}
            </section>
          ))}
        </div>

        {/* empty:hidden: a footer component that renders nothing leaves no bare bar. */}
        {footer ? <div className="border-t border-border bg-card px-5 py-3 empty:hidden">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}
