export default function PaginationControls({
  page,
  pageCount,
  total,
  pageSize = 10,
  onPageChange,
}) {
  if (total <= pageSize) {
    return null;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span>
        Showing {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="font-medium text-slate-700">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
