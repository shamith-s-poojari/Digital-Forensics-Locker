// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery.js";

function fakeList(initial, { legacy = false } = {}) {
  const listeners = new Set();
  const list = {
    matches: initial,
    media: "",
  };
  if (legacy) {
    list.addListener = vi.fn((cb) => listeners.add(cb));
    list.removeListener = vi.fn((cb) => listeners.delete(cb));
  } else {
    list.addEventListener = vi.fn((_type, cb) => listeners.add(cb));
    list.removeEventListener = vi.fn((_type, cb) => listeners.delete(cb));
  }
  list.set = (value) => {
    list.matches = value;
    act(() => listeners.forEach((cb) => cb()));
  };
  list.listeners = listeners;
  return list;
}

afterEach(() => {
  cleanup();
  delete window.matchMedia;
});

describe("useMediaQuery", () => {
  it("returns the default (false) and never throws when matchMedia is missing", () => {
    expect(window.matchMedia).toBeUndefined();
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(false);
  });

  it("honours a custom default when matchMedia is missing", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)", true));
    expect(result.current).toBe(true);
  });

  it("returns the current match on the first render and follows changes", () => {
    const list = fakeList(true);
    window.matchMedia = vi.fn(() => list);

    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(true);

    list.set(false);
    expect(result.current).toBe(false);
    list.set(true);
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const list = fakeList(false);
    window.matchMedia = vi.fn(() => list);

    const { unmount } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(list.listeners.size).toBe(1);
    unmount();
    expect(list.listeners.size).toBe(0);
  });

  it("supports the legacy addListener API of older Safari", () => {
    const list = fakeList(false, { legacy: true });
    window.matchMedia = vi.fn(() => list);

    const { result, unmount } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(list.addListener).toHaveBeenCalledTimes(1);
    list.set(true);
    expect(result.current).toBe(true);
    unmount();
    expect(list.removeListener).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default if matchMedia throws", () => {
    window.matchMedia = vi.fn(() => {
      throw new Error("bad query");
    });
    const { result } = renderHook(() => useMediaQuery("nonsense"));
    expect(result.current).toBe(false);
  });

  it("re-subscribes when the query changes", () => {
    const narrow = fakeList(true);
    const wide = fakeList(false);
    window.matchMedia = vi.fn((query) => (query.includes("767") ? narrow : wide));

    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(max-width: 767px)" },
    });
    expect(result.current).toBe(true);

    rerender({ query: "(min-width: 1200px)" });
    expect(result.current).toBe(false);
    expect(narrow.listeners.size).toBe(0);
    expect(wide.listeners.size).toBe(1);
  });
});
