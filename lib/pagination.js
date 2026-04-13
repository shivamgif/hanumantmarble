export const DEFAULT_PAGE_SIZE = 10;

export function getPageCount(totalItems, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateRows(rows = [], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const pageCount = getPageCount(rows.length, pageSize);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const startIndex = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageCount,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, rows.length),
    rows: rows.slice(startIndex, startIndex + pageSize),
    total: rows.length,
  };
}
