"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

function formatPreviewValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function PreviewKeyValueGrid({ items = [] }) {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visibleItems.map((item, i) => (
        <div key={item.label ?? i} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{formatPreviewValue(item.value)}</dd>
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
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="mb-6 pr-8 text-left">
          <SheetTitle className="text-2xl font-black text-slate-450">{title}</SheetTitle>
          {description ? <SheetDescription className="text-sm text-slate-500">{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="space-y-6">
          {summary ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              {summary}
            </div>
          ) : null}

          {visibleSections.map((section, i) => (
            <section key={section.title ?? i} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{section.title}</h3>
                {section.description ? <p className="mt-1 text-sm text-slate-500">{section.description}</p> : null}
              </div>
              {section.children}
            </section>
          ))}

          {footer ? <div className="pt-2">{footer}</div> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
