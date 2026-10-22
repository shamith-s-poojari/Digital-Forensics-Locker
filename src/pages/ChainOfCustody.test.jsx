// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChainOfCustody from "./ChainOfCustody";

// 40 generated events: 5 CIDs rotate every event, 3 event types rotate every event.
//   Submit: 14 events, Access: 13, Verify: 13. Each CID appears on 8 events.
const { logs } = vi.hoisted(() => {
  const cidNames = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  const types = ["Submit", "Access", "Verify"];
  return {
    logs: Array.from({ length: 40 }, (_, i) => ({
      id: `LOG-${String(i + 1).padStart(3, "0")}`,
      eventType: types[i % 3],
      cidHash: `Qm${cidNames[i % 5]}${"0".repeat(30)}`,
      actor: `0x71C7656EC7ab88b098defB751B7401B5f6d8${String(1000 + i)}`,
      timestamp: `2025-06-01 09:${String(i).padStart(2, "0")}:00`,
      txHash: `0x${(i + 1).toString(16).padStart(64, "0")}`,
      blockNumber: 7000000 + i,
    })),
  };
});

vi.mock("../data/mockData", () => ({ mockCustodyLog: logs }));

const EN_DASH = String.fromCharCode(0x2013);
const showing = (from, to, total) => `Showing ${from}${EN_DASH}${to} of ${total}`;

const paginationText = () => screen.getByRole("navigation", { name: "Pagination" }).textContent;
const bodyRows = () => screen.getAllByRole("row").slice(1); // first row is the header
const cidInput = () => screen.getByLabelText("Filter by IPFS CID");
const typeSelect = () => screen.getByLabelText("Event Type");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("ChainOfCustody: structure and honesty", () => {
  it("has a level-1 heading and does not claim an immutable or blockchain record", () => {
    render(<ChainOfCustody />);
    expect(screen.getByRole("heading", { level: 1, name: "Chain of Custody Audit Log" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/immutable/i);
    expect(document.body.textContent).toMatch(/not recorded on a blockchain/i);
  });

  it("states that block numbers and transaction hashes are sample values", () => {
    render(<ChainOfCustody />);
    expect(screen.getByText(/sample values for demonstration; these transactions do not exist/i)).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /transaction hash \(sample\)/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /block \(sample\)/i })).toBeTruthy();
  });

  it("associates a visible label with the filter input and the event type select", () => {
    render(<ChainOfCustody />);
    expect(cidInput().tagName).toBe("INPUT");
    expect(cidInput().id).toBe(screen.getByText("Filter by IPFS CID").getAttribute("for"));
    expect(typeSelect().tagName).toBe("SELECT");
    expect(typeSelect().id).toBe(screen.getByText("Event Type", { selector: "label" }).getAttribute("for"));
    const options = within(typeSelect()).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["All", "Submit", "Access", "Verify"]);
  });

  it("does not remove the keyboard focus indicator from the controls", () => {
    render(<ChainOfCustody />);
    for (const control of [cidInput(), typeSelect()]) {
      expect(control.style.outline).not.toBe("none");
      expect(control.className).toContain("coc-field");
    }
    const css = document.querySelector("style").textContent;
    expect(css).toMatch(/\.coc-field:focus-visible/);
    expect(css).toMatch(/outline:\s*2px solid/);
  });

  it("uses a real table with column headers, in a keyboard-focusable horizontally scrollable region", () => {
    render(<ChainOfCustody />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(6);
    for (const header of headers) expect(header.getAttribute("scope")).toBe("col");

    const region = screen.getByRole("region", { name: /custody log events/i });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.style.overflowX).toBe("auto");
    expect(within(region).getByRole("table")).toBeTruthy();
  });

  it("shows event types with the shared StatusBadge (text, not just color)", () => {
    render(<ChainOfCustody />);
    const first = bodyRows()[0];
    expect(within(first).getByText("Submit")).toBeTruthy();
    expect(first.textContent).toContain("Event type: Submit");
  });

  it("shows summary counts for the data", () => {
    render(<ChainOfCustody />);
    expect(screen.getByText("Total Events").nextSibling.textContent).toBe("40");
    expect(screen.getByText("Verify Events").nextSibling.textContent).toBe("13");
    expect(screen.getByText("Unique CIDs").nextSibling.textContent).toBe("5");
  });
});

describe("ChainOfCustody: pagination", () => {
  it("shows 10 rows per page and pages with Next and Previous", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    expect(bodyRows()).toHaveLength(10);
    expect(paginationText()).toContain(showing(1, 10, 40));
    expect(paginationText()).toContain("Page 1 of 4");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(paginationText()).toContain(showing(11, 20, 40));
    expect(paginationText()).toContain("Page 2 of 4");
    expect(within(bodyRows()[0]).getByRole("button", { name: /transaction hash for event LOG-011$/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(paginationText()).toContain("Page 1 of 4");
  });
});

describe("ChainOfCustody: filtering", () => {
  it("filters by CID, ignoring case and surrounding spaces", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    await user.type(cidInput(), "  bRaVo ");
    const rows = bodyRows();
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(within(row).getAllByRole("cell")[1].textContent).toContain("QmBravo");
    expect(paginationText()).toContain(showing(1, 8, 8));
  });

  it("filters by event type", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    await user.selectOptions(typeSelect(), "Verify");
    expect(paginationText()).toContain(showing(1, 10, 13));
    for (const row of bodyRows()) expect(within(row).getByText("Verify")).toBeTruthy();

    await user.selectOptions(typeSelect(), "All");
    expect(paginationText()).toContain(showing(1, 10, 40));
  });

  it("combines the CID and event type filters", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    await user.type(cidInput(), "QmAlpha");
    await user.selectOptions(typeSelect(), "Submit");
    // Events 0, 15 and 30 are both Submit and Alpha.
    expect(bodyRows()).toHaveLength(3);
    for (const row of bodyRows()) {
      expect(within(row).getByText("Submit")).toBeTruthy();
      expect(within(row).getAllByRole("cell")[1].textContent).toContain("QmAlpha");
    }
  });

  it("shows an empty state and hides pagination when nothing matches", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    await user.type(cidInput(), "does-not-exist");
    expect(screen.getByText("No events match your filters")).toBeTruthy();
    expect(bodyRows()).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  it("returns to page 1 when the CID filter changes", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(paginationText()).toContain("Page 2 of 4");

    // "Qm" matches all 40 events, so page 2 would still be valid: only an explicit reset gets us back.
    await user.type(cidInput(), "Qm");
    expect(paginationText()).toContain("Page 1 of 4");
    expect(paginationText()).toContain(showing(1, 10, 40));
  });

  it("returns to page 1 when the event type changes", async () => {
    const user = userEvent.setup();
    render(<ChainOfCustody />);

    await user.selectOptions(typeSelect(), "Submit");
    expect(paginationText()).toContain("Page 1 of 2");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(paginationText()).toContain(showing(11, 14, 14));

    // Access also has two pages (13 events), so staying on page 2 would still be valid.
    await user.selectOptions(typeSelect(), "Access");
    expect(paginationText()).toContain("Page 1 of 2");
    expect(paginationText()).toContain(showing(1, 10, 13));
  });
});

describe("ChainOfCustody: copy buttons", () => {
  let writeText;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("gives every icon-only button a unique accessible name", () => {
    render(<ChainOfCustody />);
    const buttons = screen.getAllByRole("button", { name: /^copy/i });
    expect(buttons).toHaveLength(30); // 10 rows x (CID, address, transaction hash)
    const names = buttons.map((button) => button.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(30);
  });

  it("copies the full transaction hash, confirms it in a live region and resets after 2 seconds", async () => {
    vi.useFakeTimers();
    render(<ChainOfCustody />);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    const button = screen.getByRole("button", { name: "Copy transaction hash for event LOG-001" });
    expect(button.getAttribute("data-copied")).toBe("false");

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(logs[0].txHash);
    expect(status.textContent).toBe("Copied transaction hash for LOG-001 to the clipboard.");
    expect(button.getAttribute("data-copied")).toBe("true");
    // Only the button that was used shows the confirmation.
    expect(screen.getByRole("button", { name: "Copy transaction hash for event LOG-002" }).getAttribute("data-copied")).toBe("false");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(status.textContent).toBe("");
    expect(button.getAttribute("data-copied")).toBe("false");
  });

  it("copies the full CID and the full wallet address", async () => {
    render(<ChainOfCustody />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy full CID for event LOG-002" }));
    });
    expect(writeText).toHaveBeenLastCalledWith(logs[1].cidHash);
    expect(screen.getByRole("status").textContent).toBe("Copied CID for LOG-002 to the clipboard.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy full wallet address for event LOG-003" }));
    });
    expect(writeText).toHaveBeenLastCalledWith(logs[2].actor);
    expect(screen.getByRole("status").textContent).toBe("Copied wallet address for LOG-003 to the clipboard.");
  });

  it("reports a failed copy instead of silently pretending it worked", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<ChainOfCustody />);

    const button = screen.getByRole("button", { name: "Copy transaction hash for event LOG-001" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole("status").textContent).toMatch(/could not copy/i);
    expect(button.getAttribute("data-copied")).toBe("false");
  });

  it("leaves no timers behind when it unmounts right after a copy", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<ChainOfCustody />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy transaction hash for event LOG-001" }));
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
