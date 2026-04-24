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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark bg-dark px-3 py-2 text-xs text-dark dark:text-slate-300">
      <div className="flex items-center gap-4">
        <span>
          {copy.showing} {start}-{end} {copy.of} {total}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{copy.rowsPerPage}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded border border-primary/20 bg-dark text-slate-300 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary px-1 py-0.5"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-md border border-primary bg-primary px-2.5 py-1.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.previous}
        </button>
        <span className="font-medium text-dark dark:text-slate-300">
          {copy.page} {page} {copy.of} {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="rounded-md border border-primary bg-primary px-2.5 py-1.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.next}
        </button>
      </div>
    </div>
  );
}
