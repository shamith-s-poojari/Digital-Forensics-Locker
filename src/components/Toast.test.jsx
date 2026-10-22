// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Toast from "./Toast";

// WCAG relative luminance / contrast ratio, computed from the colors Toast actually renders.
function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Cannot parse color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when the message is empty", () => {
    const { container, rerender } = render(<Toast message="" onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
    rerender(<Toast onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
    rerender(<Toast message={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the message and a labelled dismiss button", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved the thing" onDismiss={onDismiss} />);
    expect(screen.getByText("Saved the thing")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each(["info", "success"])("announces %s politely with role=status", (type) => {
    render(<Toast message="Hello" type={type} onDismiss={() => {}} />);
    const toast = screen.getByRole("status");
    expect(toast.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["error", "warning"])("announces %s assertively with role=alert", (type) => {
    render(<Toast message="Careful" type={type} onDismiss={() => {}} />);
    const toast = screen.getByRole("alert");
    expect(toast.getAttribute("aria-live")).toBe("assertive");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("defaults to info and falls back to info for an unknown type", () => {
    const { rerender } = render(<Toast message="Default" onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<Toast message="Mystery" type="nonsense" onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("switches role when the type changes", () => {
    const { rerender } = render(<Toast message="Working" type="info" onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<Toast message="Failed" type="error" onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("auto-dismisses after 5000 ms by default", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Soon gone" onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(4999));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("honours a custom duration", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Quick" duration={1000} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays until dismissed when duration is 0", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Sticky" duration={0} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("Sticky")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clears the timer on unmount", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast message="Bye" onDismiss={onDismiss} />);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(10000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does not schedule anything when the message is empty or there is no handler", () => {
    const { rerender } = render(<Toast message="" onDismiss={() => {}} />);
    expect(vi.getTimerCount()).toBe(0);
    rerender(<Toast message="No handler" />);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByText("No handler")).toBeTruthy();
  });

  it("restarts the timer for a new message but not for a new onDismiss function", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Toast message="One" onDismiss={first} />);

    act(() => vi.advanceTimersByTime(3000));
    // Same message, new handler identity: the clock keeps running and the newest handler is used.
    rerender(<Toast message="One" onDismiss={second} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    // A different message starts a fresh 5000 ms countdown.
    const third = vi.fn();
    rerender(<Toast message="Two" onDismiss={third} />);
    act(() => vi.advanceTimersByTime(4999));
    expect(third).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("pauses while hovered or focused and restarts the countdown afterwards", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Read me" onDismiss={onDismiss} />);
    const toast = screen.getByRole("status");

    act(() => vi.advanceTimersByTime(4000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(4999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
    const onDismissFocus = vi.fn();
    render(<Toast message="Focus me" onDismiss={onDismissFocus} />);
    const button = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.focus(button);
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismissFocus).not.toHaveBeenCalled();
    fireEvent.blur(button);
    act(() => vi.advanceTimersByTime(5000));
    expect(onDismissFocus).toHaveBeenCalledTimes(1);
  });

  it("is fixed bottom-right and wraps long text within the viewport", () => {
    render(<Toast message={"x".repeat(300)} onDismiss={() => {}} />);
    const toast = screen.getByRole("status");
    expect(toast.style.position).toBe("fixed");
    expect(toast.style.right).toBe("16px");
    expect(toast.style.bottom).toBe("16px");
    expect(toast.style.maxWidth).toContain("100vw");
    expect(screen.getByText("x".repeat(300)).style.overflowWrap).toBe("anywhere");
  });

  it.each(["info", "success", "error", "warning"])("keeps %s text at WCAG AA contrast (4.5:1)", (type) => {
    render(<Toast message="Contrast" type={type} onDismiss={() => {}} />);
    const toast = screen.getByText("Contrast").parentElement;
    const ratio = contrast(parseRgb(toast.style.color), parseRgb(toast.style.backgroundColor));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
