import { SelectField } from '@/components/ui/select';

export default function PaginationControls({
  page,
  pageCount,
  total,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  labels,
}) {
  const copy = {
    showing: labels?.showing || 'Showing',
    of: labels?.of || 'of',
    previous: labels?.previous || 'Previous',
    next: labels?.next || 'Next',
    page: labels?.page || 'Page',
    rowsPerPage: labels?.rowsPerPage || 'Rows per page:',
  };

  if (total <= 0) {
    return null;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-4">
        <span className="tabular-nums">
          {copy.showing} <span className="font-medium text-slate-900 dark:text-slate-100">{start}–{end}</span> {copy.of} {total}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">{copy.rowsPerPage}</span>
            <SelectField
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-8 w-[4.5rem] rounded-md px-2 text-xs font-medium"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </SelectField>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card dark:text-slate-200"
        >
          {copy.previous}
        </button>
        <span className="tabular-nums">
          {copy.page} {page} {copy.of} {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card dark:text-slate-200"
        >
          {copy.next}
        </button>
      </div>
    </div>
  );
}
