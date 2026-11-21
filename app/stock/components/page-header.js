import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * The one page header in the stock app: optional breadcrumb, an icon chip in
 * the company accent, the title, a subtitle, and actions on the right.
 * crumbs: [{ label, href? }] — the last one is the current page.
 */
export function PageHeader({ icon: Icon, crumbs, title, subtitle, actions }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {crumbs.map(({ label, href }, index) => (
              <span key={label} className="flex items-center gap-1.5">
                {index ? <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" aria-hidden="true" /> : null}
                {href ? (
                  <Link href={href} className="transition-colors hover:text-foreground">{label}</Link>
                ) : (
                  <span className={index === crumbs.length - 1 ? 'text-foreground' : ''}>{label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-brand-primary">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
          ) : null}
          <h1 className="page-title truncate">{title}</h1>
        </div>
        {subtitle ? <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
