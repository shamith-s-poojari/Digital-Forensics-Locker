// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaseManagement from "./CaseManagement";
import { mockCases, mockCustodyLog, mockEvidence } from "../data/mockData";

const { exportCustodyReport } = vi.hoisted(() => ({ exportCustodyReport: vi.fn() }));
vi.mock("../utils/pdf", () => ({ exportCustodyReport }));

const SEARCH_LABEL = "Search cases by ID or title";
const EXPORT_NAME = "Export Demo PDF Report";
const SUCCESS_TEXT = "Demo report downloaded.";
const FAILURE_TEXT = "Could not generate the report. Please try again.";

const firstCase = mockCases[0];
const evidenceOf = (caseData) => mockEvidence.filter((e) => e.caseId === caseData.id);
const viewButton = (caseData) => screen.getByRole("button", { name: `View Case Details for ${caseData.id}` });
const caseHeading = (caseData) => screen.queryByRole("heading", { level: 2, name: caseData.title });
const openCase = async (user, caseData) => {
  await user.click(viewButton(caseData));
  return screen.getByRole("dialog");
};

/** A promise that the test settles by hand, to observe the "exporting" state. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("CaseManagement (demo)", () => {
  beforeEach(() => {
    exportCustodyReport.mockReset();
    exportCustodyReport.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("lists every case with a labelled search box, a labelled status filter and a result count", () => {
      render(<CaseManagement />);

      expect(screen.getByRole("heading", { level: 1, name: "Case Management" })).toBeTruthy();
      expect(screen.getByLabelText(SEARCH_LABEL)).toBeTruthy();
      const group = screen.getByRole("group", { name: "Filter by case status" });
      for (const name of ["All", "Active", "Under Review", "Closed"]) {
        expect(within(group).getByRole("button", { name })).toBeTruthy();
      }
      for (const c of mockCases) expect(caseHeading(c)).toBeTruthy();
      expect(screen.getByText(`Showing ${mockCases.length} of ${mockCases.length} cases`)).toBeTruthy();
    });

    it("uses real buttons with unique names to open a case and the shared StatusBadge for status", () => {
      render(<CaseManagement />);
      for (const c of mockCases) {
        const button = viewButton(c);
        expect(button.tagName).toBe("BUTTON");
        expect(button.getAttribute("type")).toBe("button");
        // The visible text is part of the accessible name (WCAG 2.5.3 Label in Name).
        expect(button.textContent).toContain("View Case Details");
        expect(within(button.closest("li")).getByText(c.status)).toBeTruthy();
      }
      // StatusBadge adds a visually hidden "Case status:" prefix for screen readers.
      expect(screen.getAllByText("Case status:", { exact: false }).length).toBeGreaterThanOrEqual(mockCases.length);
    });

    it("shows officer wallet addresses truncated, with the full value in a title", () => {
      render(<CaseManagement />);
      const card = viewButton(firstCase).closest("li");
      const officer = within(card).getByTitle(firstCase.officer);
      expect(officer.textContent).not.toBe(firstCase.officer);
      expect(officer.textContent).toContain("…");
      expect(officer.textContent.startsWith(firstCase.officer.slice(0, 8))).toBe(true);
      expect(officer.textContent.endsWith(firstCase.officer.slice(-6))).toBe(true);
    });

    it("lays the cards out in a responsive grid that cannot overflow a 375px screen", () => {
      render(<CaseManagement />);
      const list = screen.getByRole("list");
      expect(list.style.gridTemplateColumns).toContain("auto-fill");
      expect(list.style.gridTemplateColumns).toContain("280px");
      expect(list.style.gridTemplateColumns).toContain("min(100%");
    });
  });

  describe("search", () => {
    it("filters by case ID, ignoring case and surrounding spaces", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const target = mockCases[1];

      await user.type(screen.getByLabelText(SEARCH_LABEL), `  ${target.id.toLowerCase()}  `);

      expect(caseHeading(target)).toBeTruthy();
      for (const c of mockCases.filter((c) => c !== target)) expect(caseHeading(c)).toBeNull();
      expect(screen.getByText(`Showing 1 of ${mockCases.length} cases`)).toBeTruthy();
    });

    it("filters by part of the title, ignoring case", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const target = mockCases[2];
      const fragment = target.title.slice(4, 12).toUpperCase();

      await user.type(screen.getByLabelText(SEARCH_LABEL), fragment);

      expect(caseHeading(target)).toBeTruthy();
      expect(screen.getAllByRole("listitem").length).toBe(
        mockCases.filter((c) => (c.id + c.title).toLowerCase().includes(fragment.toLowerCase())).length
      );
    });

    it("shows an empty state when nothing matches, and recovers when the search is cleared", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const input = screen.getByLabelText(SEARCH_LABEL);

      await user.type(input, "no-such-case-anywhere");
      expect(screen.getByText("No cases match your search filters")).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.getByText(`Showing 0 of ${mockCases.length} cases`)).toBeTruthy();

      await user.clear(input);
      expect(screen.queryByText("No cases match your search filters")).toBeNull();
      expect(screen.getAllByRole("listitem")).toHaveLength(mockCases.length);
    });
  });

  describe("status filter", () => {
    const statuses = [...new Set(mockCases.map((c) => c.status))];

    it.each(statuses)("shows only %s cases and marks that button as pressed", async (status) => {
      const user = userEvent.setup();
      render(<CaseManagement />);

      await user.click(screen.getByRole("button", { name: status }));

      for (const c of mockCases) {
        if (c.status === status) expect(caseHeading(c)).toBeTruthy();
        else expect(caseHeading(c)).toBeNull();
      }
      expect(screen.getByRole("button", { name: status }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("returns to every case with All", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);

      await user.click(screen.getByRole("button", { name: statuses[0] }));
      await user.click(screen.getByRole("button", { name: "All" }));

      expect(screen.getAllByRole("listitem")).toHaveLength(mockCases.length);
      expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("combines with the search box", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const other = mockCases.find((c) => c.status !== mockCases[0].status);

      await user.click(screen.getByRole("button", { name: mockCases[0].status }));
      await user.type(screen.getByLabelText(SEARCH_LABEL), other.id);

      expect(screen.getByText("No cases match your search filters")).toBeTruthy();
    });
  });

  describe("detail dialog", () => {
    it("opens as a modal dialog named by the case title, with focus inside and the case's evidence", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      expect(screen.queryByRole("dialog")).toBeNull();

      const dialog = await openCase(user, firstCase);

      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(screen.getByRole("dialog", { name: firstCase.title })).toBe(dialog);
      expect(document.activeElement).toBe(dialog);

      const evidence = evidenceOf(firstCase);
      expect(within(dialog).getByText(`Associated Evidence (${evidence.length})`)).toBeTruthy();
      const rows = within(dialog).getAllByRole("row");
      expect(rows).toHaveLength(evidence.length + 1); // header row + one per evidence item
      for (const ev of evidence) expect(within(dialog).getByText(ev.fileName)).toBeTruthy();
      expect(within(dialog).getByText(firstCase.officer)).toBeTruthy();
      expect(within(dialog).getByText(/nothing here is recorded on a blockchain/i)).toBeTruthy();
    });

    it("closes with Escape and gives focus back to the button that opened it", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const trigger = viewButton(mockCases[1]);

      await user.click(trigger);
      expect(screen.getByRole("dialog")).toBeTruthy();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("closes with the icon button, the Close button and a click on the backdrop, but not a click inside", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);

      let dialog = await openCase(user, firstCase);
      await user.click(within(dialog).getByRole("button", { name: "Close case details" }));
      expect(screen.queryByRole("dialog")).toBeNull();

      dialog = await openCase(user, firstCase);
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();

      dialog = await openCase(user, firstCase);
      await user.click(within(dialog).getByRole("heading", { level: 2 }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(dialog.parentElement);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps Tab and Shift+Tab inside the dialog", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const dialog = await openCase(user, firstCase);
      const closeIcon = within(dialog).getByRole("button", { name: "Close case details" });
      const closeButton = within(dialog).getByRole("button", { name: "Close" });

      await user.tab({ shift: true }); // from the dialog itself, wraps to the last control
      expect(document.activeElement).toBe(closeButton);

      await user.tab(); // from the last control, wraps to the first
      expect(document.activeElement).toBe(closeIcon);

      await user.tab({ shift: true }); // from the first control, wraps to the last
      expect(document.activeElement).toBe(closeButton);
    });

    it("lets the evidence table scroll sideways on narrow screens", async () => {
      const user = userEvent.setup();
      render(<CaseManagement />);
      const dialog = await openCase(user, firstCase);
      const region = within(dialog).getByRole("region", { name: "Associated evidence table" });
      expect(region.style.overflowX).toBe("auto");
      expect(region.getAttribute("tabindex")).toBe("0");
    });
  });

  describe("PDF export", () => {
    it("is disabled and busy while running, then reports success", async () => {
      const user = userEvent.setup();
      const pending = deferred();
      exportCustodyReport.mockReturnValue(pending.promise);
      render(<CaseManagement />);
      await openCase(user, firstCase);

      const button = screen.getByRole("button", { name: EXPORT_NAME });
      expect(button.getAttribute("aria-busy")).toBe("false");
      await user.click(button);

      expect(exportCustodyReport).toHaveBeenCalledTimes(1);
      expect(exportCustodyReport).toHaveBeenCalledWith(firstCase, evidenceOf(firstCase), mockCustodyLog);
      const busy = screen.getByRole("button", { name: "Generating report…" });
      expect(busy).toBe(button);
      expect(busy.disabled).toBe(true);
      expect(busy.getAttribute("aria-busy")).toBe("true");
      expect(screen.queryByText(SUCCESS_TEXT)).toBeNull();

      fireEvent.click(busy); // a second click while running must not start a second export
      expect(exportCustodyReport).toHaveBeenCalledTimes(1);

      await act(async () => pending.resolve());

      const toast = screen.getByRole("status");
      expect(toast.textContent).toContain(SUCCESS_TEXT);
      expect(screen.queryByRole("alert")).toBeNull();
      const idle = screen.getByRole("button", { name: EXPORT_NAME });
      expect(idle.disabled).toBe(false);
      expect(idle.getAttribute("aria-busy")).toBe("false");
    });

    it("shows an error toast when the report promise rejects, and lets the user try again", async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      exportCustodyReport.mockRejectedValueOnce(new Error("jsPDF failed to load"));
      render(<CaseManagement />);
      await openCase(user, firstCase);

      await user.click(screen.getByRole("button", { name: EXPORT_NAME }));

      const toast = await screen.findByRole("alert");
      expect(toast.textContent).toContain(FAILURE_TEXT);
      expect(screen.queryByText(SUCCESS_TEXT)).toBeNull();
      expect(consoleError).toHaveBeenCalled();
      const retry = screen.getByRole("button", { name: EXPORT_NAME });
      expect(retry.disabled).toBe(false);
      expect(retry.getAttribute("aria-busy")).toBe("false");

      await user.click(retry);
      expect(exportCustodyReport).toHaveBeenCalledTimes(2);
      expect((await screen.findByRole("status")).textContent).toContain(SUCCESS_TEXT);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("also handles a synchronous throw", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      exportCustodyReport.mockImplementation(() => {
        throw new Error("sync failure");
      });
      render(<CaseManagement />);
      await openCase(user, firstCase);

      await user.click(screen.getByRole("button", { name: EXPORT_NAME }));

      expect((await screen.findByRole("alert")).textContent).toContain(FAILURE_TEXT);
      expect(screen.getByRole("button", { name: EXPORT_NAME }).disabled).toBe(false);
    });

    it("puts keyboard focus back on the export button when it is re-enabled", async () => {
      const user = userEvent.setup();
      const pending = deferred();
      exportCustodyReport.mockReturnValue(pending.promise);
      render(<CaseManagement />);
      await openCase(user, firstCase);

      const button = screen.getByRole("button", { name: EXPORT_NAME });
      await user.click(button);
      // Browsers drop focus from a button that becomes disabled, so focus can end up behind the
      // dialog. Imitate that by focusing the search box.
      const search = screen.getByLabelText(SEARCH_LABEL);
      act(() => search.focus());
      expect(document.activeElement).toBe(search);

      await act(async () => pending.resolve());

      expect(document.activeElement).toBe(button);
    });

    it("dismisses the toast by itself, or on request, and keeps it after the dialog closes", async () => {
      vi.useFakeTimers();
      render(<CaseManagement />);

      fireEvent.click(viewButton(firstCase));
      fireEvent.click(screen.getByRole("button", { name: EXPORT_NAME }));
      await act(async () => {});
      expect(screen.getByRole("status").textContent).toContain(SUCCESS_TEXT);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain(SUCCESS_TEXT);

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByRole("status")).toBeNull();

      fireEvent.click(viewButton(firstCase));
      fireEvent.click(screen.getByRole("button", { name: EXPORT_NAME }));
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("source hygiene", () => {
    it("has no byte order mark and no mojibake in the page source", () => {
      const source = readFileSync(join(process.cwd(), "src", "pages", "CaseManagement.jsx"), "utf8");
      expect(source.charCodeAt(0)).not.toBe(0xfeff);
      expect(source).not.toMatch(/[ΓÃâ]/);
      expect(source).not.toContain("�");
    });
  });
});
