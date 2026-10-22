import { useCallback, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Pure pagination math behind `usePagination` (exported so it can be unit-tested without React).
 *
 * @template T
 * @param {T[]} items The full list.
 * @param {number} page Requested 1-based page; clamped into [1, totalPages].
 * @param {number} [pageSize=10] Items per page; values below 1 fall back to 10.
 * @returns {{ page: number, totalPages: number, pageItems: T[], showingFrom: number, showingTo: number, totalItems: number }}
 */
export function paginate(items, page, pageSize = DEFAULT_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1;
  const currentPage = clamp(requested, 1, totalPages);
  const startIndex = (currentPage - 1) * size;

  return {
    page: currentPage,
    totalPages,
    pageItems: list.slice(startIndex, startIndex + size),
    showingFrom: totalItems === 0 ? 0 : startIndex + 1,
    showingTo: Math.min(startIndex + size, totalItems),
    totalItems,
  };
}

/**
 * Client-side pagination over an in-memory array.
 *
 * - Pages are 1-based. `page` is always clamped into [1, totalPages], so it stays valid even
 *   if `items` shrinks (for example after filtering).
 * - `setPage` accepts a number or an updater function and clamps the result. Resetting to the
 *   first page when a filter or search changes is the caller's job: call `setPage(1)`.
 * - `showingFrom` / `showingTo` are 1-based and inclusive, and both are 0 when there are no items.
 * - There is always at least one page, so `totalPages` is 1 for an empty list.
 *
 * @template T
 * @param {T[]} items The full (already filtered/sorted) list.
 * @param {number} [pageSize=10] Items per page; values below 1 fall back to 10.
 * @returns {{
 *   page: number,
 *   setPage: (next: number | ((current: number) => number)) => void,
 *   totalPages: number,
 *   pageItems: T[],
 *   showingFrom: number,
 *   showingTo: number,
 *   totalItems: number,
 * }}
 */
export function usePagination(items, pageSize = DEFAULT_PAGE_SIZE) {
  const [requestedPage, setRequestedPage] = useState(1);

  const result = useMemo(() => paginate(items, requestedPage, pageSize), [items, requestedPage, pageSize]);
  const { totalPages } = result;

  const setPage = useCallback(
    (next) => {
      setRequestedPage((current) => {
        const value = typeof next === "function" ? next(clamp(current, 1, totalPages)) : next;
        return Number.isFinite(value) ? clamp(Math.trunc(value), 1, totalPages) : 1;
      });
    },
    [totalPages]
  );

  return { ...result, setPage };
}
