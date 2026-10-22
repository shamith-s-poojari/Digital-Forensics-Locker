// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Clock from "./Clock";

describe("Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Local-time constructor so the expected text does not depend on the machine's time zone.
    vi.setSystemTime(new Date(2026, 0, 5, 10, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the formatted time as a quiet timer, not a live region", () => {
    render(<Clock />);
    const clock = screen.getByRole("timer");
    expect(clock.tagName).toBe("TIME");
    expect(clock.textContent).toMatch(/Jan.*05.*2026.*10:00:00/);
    expect(clock.getAttribute("aria-live")).toBe("off");
    expect(clock.getAttribute("datetime")).toBe(new Date(2026, 0, 5, 10, 0, 0).toISOString());
  });

  it("says it is the device clock, not a trusted timestamp", () => {
    render(<Clock />);
    expect(screen.getByRole("timer").getAttribute("title")).toMatch(/not a trusted timestamp/i);
  });

  it("ticks once per second", () => {
    render(<Clock />);
    expect(screen.getByRole("timer").textContent).toMatch(/10:00:00/);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("timer").textContent).toMatch(/10:00:01/);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("timer").textContent).toMatch(/10:00:03/);
  });

  it("clears its interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(<Clock />);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts exactly one interval per mounted clock and survives re-renders", () => {
    const { rerender } = render(<Clock />);
    rerender(<Clock style={{ color: "red" }} />);
    rerender(<Clock />);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("merges a style override over the defaults", () => {
    render(<Clock style={{ fontSize: "20px" }} />);
    expect(screen.getByRole("timer").style.fontSize).toBe("20px");
  });
});
