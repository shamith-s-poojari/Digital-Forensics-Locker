// @vitest-environment node
import { describe, expect, it } from "vitest";
import { paginate } from "./usePagination";

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the first page of a longer list", () => {
    const result = paginate(range(25), 1, 10);
    expect(result.pageItems).toEqual(range(10));
    expect(result).toMatchObject({ page: 1, totalPages: 3, showingFrom: 1, showingTo: 10, totalItems: 25 });
  });

  it("returns a partial last page", () => {
    const result = paginate(range(25), 3, 10);
    expect(result.pageItems).toEqual([21, 22, 23, 24, 25]);
    expect(result).toMatchObject({ page: 3, showingFrom: 21, showingTo: 25 });
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(range(25), 99, 10).page).toBe(3);
    expect(paginate(range(25), 0, 10).page).toBe(1);
    expect(paginate(range(25), -4, 10).page).toBe(1);
    expect(paginate(range(25), NaN, 10).page).toBe(1);
  });

  it("handles an empty list with one page and a 0-0 range", () => {
    const result = paginate([], 5, 10);
    expect(result).toMatchObject({ page: 1, totalPages: 1, showingFrom: 0, showingTo: 0, totalItems: 0 });
    expect(result.pageItems).toEqual([]);
  });

  it("handles an exact multiple of the page size", () => {
    const result = paginate(range(20), 2, 10);
    expect(result.totalPages).toBe(2);
    expect(result.pageItems).toEqual(range(20).slice(10));
    expect(result.showingTo).toBe(20);
  });

  it("falls back to a page size of 10 for invalid sizes and defaults to 10", () => {
    expect(paginate(range(25), 1, 0).pageItems).toHaveLength(10);
    expect(paginate(range(25), 1, -3).pageItems).toHaveLength(10);
    expect(paginate(range(25), 1, NaN).pageItems).toHaveLength(10);
    expect(paginate(range(25), 1).pageItems).toHaveLength(10);
  });

  it("tolerates non-array input", () => {
    expect(paginate(undefined, 1, 10).totalItems).toBe(0);
    expect(paginate(null, 1, 10).pageItems).toEqual([]);
  });
});
