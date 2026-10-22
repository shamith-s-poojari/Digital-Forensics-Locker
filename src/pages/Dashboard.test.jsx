// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import { mockEvidence, mockCases, mockCustodyLog } from "../data/mockData";

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

const setClipboard = (clipboard) =>
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true, writable: true });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete navigator.clipboard;
});

describe("Dashboard", () => {
  it("renders without throwing and has a single h1 with section h2s", () => {
    renderDashboard();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    for (const name of ["Recent Evidence Submissions", "Recent Custody Events", "Quick Actions"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
  });

  it("derives the summary cards from the sample data", () => {
    renderDashboard();
    const summary = screen.getByRole("list", { name: "Summary" });
    const cards = within(summary).getAllByRole("listitem");
    expect(cards).toHaveLength(4);

    const openCases = mockCases.filter((c) => c.status !== "Closed").length;
    const needsAttention = mockEvidence.filter((ev) => ev.status !== "Verified").length;
    const text = cards.map((card) => card.textContent);
    expect(text[0]).toContain(`${mockEvidence.length}Total Evidence`);
    expect(text[1]).toContain(`${openCases}Open Cases`);
    expect(text[2]).toContain(`${mockCustodyLog.length}Custody Events`);
    expect(text[3]).toContain(`${needsAttention}Needs Attention`);
  });

  it("renders the evidence table with column headers and StatusBadge labels", () => {
    renderDashboard();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["CID", "Case ID", "File Name", "Type", "SHA-256", "Status"]);

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + 5);
    // StatusBadge adds a visually hidden "Evidence status: " prefix for screen readers.
    expect(within(rows[1]).getByText("Verified")).toBeTruthy();
    expect(rows[1].textContent).toContain("Evidence status: ");
  });

  it("puts the table in a keyboard-focusable scroll region so narrow screens can pan it", () => {
    renderDashboard();
    const region = screen.getByRole("region", { name: "Recent evidence table" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.style.overflowX).toBe("auto");
    expect(region.contains(screen.getByRole("table"))).toBe(true);
  });

  it("does not claim a live blockchain connection or IPFS storage", () => {
    renderDashboard();
    const text = document.body.textContent;
    expect(text).not.toMatch(/sepolia/i);
    expect(text).not.toMatch(/real-time/i);
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).not.toMatch(/IPFS Network/);
  });

  it("links to the main workflows with decorative icons hidden from screen readers", () => {
    const { container } = renderDashboard();
    expect(screen.getByRole("link", { name: "Upload New Evidence" }).getAttribute("href")).toBe("/upload");
    expect(screen.getByRole("link", { name: "Search Evidence" }).getAttribute("href")).toBe("/evidence");
    expect(screen.getByRole("link", { name: "View Custody Chain" }).getAttribute("href")).toBe("/custody");
    expect(screen.getByRole("link", { name: /View all evidence/ }).getAttribute("href")).toBe("/evidence");

    const icons = container.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the evidence behind each custody event instead of showing an empty cell", () => {
    renderDashboard();
    const events = within(screen.getByRole("heading", { name: "Recent Custody Events" }).closest("section")).getAllByRole(
      "listitem"
    );
    expect(events).toHaveLength(4);
    const first = mockCustodyLog[0];
    const evidence = mockEvidence.find((ev) => ev.cid === first.cidHash);
    expect(events[0].textContent).toContain(evidence.id);
    expect(events[0].textContent).toContain(evidence.fileName);
  });
});

describe("Dashboard copy buttons", () => {
  const first = mockEvidence[0];

  it("labels every icon-only copy button", () => {
    renderDashboard();
    const copyButtons = screen.getAllByRole("button", { name: /^Copy / });
    expect(copyButtons).toHaveLength(5 * 2);
    expect(screen.getByRole("button", { name: `Copy full CID for ${first.id}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Copy full SHA-256 hash for ${first.id}` })).toBeTruthy();
  });

  it("copies the full value and announces it in a polite status region, then clears it", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderDashboard();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Copy full CID for ${first.id}` }));
    });

    expect(writeText).toHaveBeenCalledWith(first.cid);
    expect(status.textContent).toBe(`Copied CID for ${first.id} to the clipboard.`);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Copy full SHA-256 hash for ${first.id}` }));
    });
    expect(writeText).toHaveBeenLastCalledWith(first.hash);
    expect(status.textContent).toBe(`Copied SHA-256 hash for ${first.id} to the clipboard.`);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(status.textContent).toBe("");
  });

  it("announces a failure when the clipboard is unavailable", async () => {
    // jsdom has no navigator.clipboard, which also covers insecure contexts.
    renderDashboard();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Copy full CID for ${first.id}` }));
    });

    expect(screen.getByRole("status").textContent).toBe(`Could not copy CID for ${first.id}.`);
  });

  it("leaves no timer behind when unmounted right after copying", async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const { unmount } = renderDashboard();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Copy full CID for ${first.id}` }));
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
