// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockEvidence } from "../data/mockData";
import { exportCustodyReport } from "../utils/pdf";
import { computeSHA256 } from "../utils/hash";
import EvidenceViewer from "./EvidenceViewer";

// jsPDF is irrelevant here (and is being made async/lazy elsewhere): stub the export.
vi.mock("../utils/pdf", () => ({ exportCustodyReport: vi.fn() }));
// Real hashing by default; individual tests can override a single call.
vi.mock("../utils/hash", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, computeSHA256: vi.fn(actual.computeSHA256) };
});

const NO_ON_CHAIN_NOTICE =
  "No on-chain record exists in this demo, so this check cannot confirm authenticity or integrity of the evidence.";
// Words the check outcome must never use as a conclusion (the disclaimer itself says "authenticity"
// and "integrity" on purpose, so it is removed before scanning).
const outcomeText = (dialog) => dialog.textContent.replace(NO_ON_CHAIN_NOTICE, "");
const OVERCLAIM = /verified|authentic|tamper|intact|matches the stored record/i;
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const evidence = mockEvidence[0];

/** Builds a File; adds Blob.arrayBuffer() if the jsdom version in use lacks it. */
function makeFile(content, name, type = "text/plain") {
  const bytes = new TextEncoder().encode(content);
  const file = new File([bytes], name, { type });
  if (typeof file.arrayBuffer !== "function") {
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return file;
}

const chooseFile = (file) => {
  fireEvent.change(screen.getByLabelText(/click to select file/i), { target: { files: [file] } });
};

const verifyButton = (ev = evidence) => screen.getByRole("button", { name: `Verify hash for ${ev.fileName}` });
const detailsButton = (ev = evidence) => screen.getByRole("button", { name: `Details for ${ev.fileName}` });

describe("EvidenceViewer (demo)", () => {
  beforeEach(() => {
    if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
    vi.mocked(exportCustodyReport).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe("table, search and filters", () => {
    it("renders a real table with column headers scoped to their columns", () => {
      render(<EvidenceViewer />);
      expect(screen.getByRole("table", { name: /evidence records/i })).toBeTruthy();
      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(8);
      for (const th of headers) expect(th.getAttribute("scope")).toBe("col");
    });

    it("labels the search box and the filter groups, and filters rows", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);

      const search = screen.getByLabelText(/search evidence/i);
      const statusGroup = screen.getByRole("group", { name: "Filter by status" });
      screen.getByRole("group", { name: "Filter by type" });

      await user.click(within(statusGroup).getByRole("button", { name: "Pending" }));
      expect(within(statusGroup).getByRole("button", { name: "Pending" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getAllByRole("row")).toHaveLength(1 + mockEvidence.filter((e) => e.status === "Pending").length);

      await user.click(within(statusGroup).getByRole("button", { name: "All" }));
      await user.type(search, "no-such-evidence");
      expect(screen.getByText("No evidence records match your filters.")).toBeTruthy();
    });

    it("names every icon-only and per-row button after the file it acts on", () => {
      render(<EvidenceViewer />);
      expect(screen.getByRole("button", { name: `Copy IPFS CID of ${evidence.fileName}` })).toBeTruthy();
      expect(screen.getByRole("button", { name: `Copy SHA-256 hash of ${evidence.fileName}` })).toBeTruthy();
      expect(detailsButton()).toBeTruthy();
      expect(verifyButton()).toBeTruthy();
    });

    it("shows a pagination summary", () => {
      render(<EvidenceViewer />);
      const nav = screen.getByRole("navigation", { name: "Pagination" });
      expect(nav.textContent).toContain(`Showing 1–${mockEvidence.length} of ${mockEvidence.length}`);
    });
  });

  describe("copy to clipboard", () => {
    it("confirms a successful copy", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(screen.getByRole("button", { name: `Copy IPFS CID of ${evidence.fileName}` }));
      expect(await screen.findByText("Copied to clipboard.")).toBeTruthy();
    });

    it("shows an alert instead of failing silently when the clipboard rejects", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"));
      render(<EvidenceViewer />);
      await user.click(screen.getByRole("button", { name: `Copy SHA-256 hash of ${evidence.fileName}` }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(/could not copy/i);
    });
  });

  describe("verify dialog", () => {
    it("is an accessible modal dialog whose file input is keyboard reachable", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(verifyButton());

      const dialog = screen.getByRole("dialog", { name: /verify file hash/i });
      expect(dialog.getAttribute("aria-modal")).toBe("true");

      const input = screen.getByLabelText(/click to select file/i);
      expect(input.style.display).not.toBe("none");
      expect(input.disabled).toBe(false);
      // Focus moved into the dialog, onto the (visually hidden) file input.
      expect(document.activeElement).toBe(input);
    });

    it("shows the computed hash next to the stored demo hash and the no-on-chain disclaimer", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(verifyButton());
      const dialog = screen.getByRole("dialog");

      chooseFile(makeFile("abc", "abc.txt"));

      await waitFor(() => expect(within(dialog).getByText(ABC_SHA256)).toBeTruthy());
      expect(within(dialog).getByText(evidence.hash)).toBeTruthy();
      expect(within(dialog).getByText("Computed SHA-256 (selected file)")).toBeTruthy();
      expect(within(dialog).getByText("Stored demo hash")).toBeTruthy();
      expect(within(dialog).getByText("Hash differs from the stored demo value")).toBeTruthy();
      expect(within(dialog).getByText(NO_ON_CHAIN_NOTICE)).toBeTruthy();

      // Never presents the outcome as a verification, and nothing is marked as an error.
      expect(outcomeText(dialog)).not.toMatch(OVERCLAIM);
      expect(within(dialog).queryByRole("alert")).toBeNull();
      // Focus follows the content to the result region.
      expect(document.activeElement).toBe(within(dialog).getByRole("region"));
    });

    it("says the hash equals the stored value without claiming anything more", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(verifyButton());
      vi.mocked(computeSHA256).mockResolvedValueOnce(evidence.hash);

      chooseFile(makeFile("abc", "abc.txt"));

      const dialog = screen.getByRole("dialog");
      expect(await within(dialog).findByText("Hash equals the stored demo value")).toBeTruthy();
      expect(within(dialog).getByText(NO_ON_CHAIN_NOTICE)).toBeTruthy();
      expect(outcomeText(dialog)).not.toMatch(OVERCLAIM);
    });

    it("shows an alert, no comparison and no stuck spinner when hashing fails, then recovers", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(verifyButton());
      const dialog = screen.getByRole("dialog");

      const unreadable = makeFile("abc", "broken.bin");
      unreadable.arrayBuffer = () => Promise.reject(new Error("disk unplugged"));
      chooseFile(unreadable);

      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).toContain("disk unplugged");
      expect(alert.textContent).toContain("No comparison was made");
      expect(within(dialog).queryByText(NO_ON_CHAIN_NOTICE)).toBeNull();
      expect(within(dialog).queryByText(/Hash (equals|differs)/)).toBeNull();
      expect(within(dialog).queryByText(/computing hash/i)).toBeNull();

      // The dropzone is still there, so the user can try another file.
      chooseFile(makeFile("abc", "abc.txt"));
      await waitFor(() => expect(within(dialog).getByText(ABC_SHA256)).toBeTruthy());
      expect(within(dialog).queryByRole("alert")).toBeNull();
    });

    it("closes with Escape and returns focus to the button that opened it", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(verifyButton());
      expect(screen.getByRole("dialog")).toBeTruthy();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(verifyButton());
    });

    it("lets the user check another file after a result", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(verifyButton());
      chooseFile(makeFile("abc", "abc.txt"));
      await screen.findByText(ABC_SHA256);

      await user.click(screen.getByRole("button", { name: "Check another file" }));

      expect(screen.queryByText(ABC_SHA256)).toBeNull();
      expect(document.activeElement).toBe(screen.getByLabelText(/click to select file/i));
    });
  });

  describe("details panel", () => {
    it("is a labelled modal dialog with focus inside, and Escape closes it and restores focus", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(detailsButton());

      const dialog = screen.getByRole("dialog", { name: evidence.fileName });
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(within(dialog).getByRole("link").getAttribute("rel")).toBe("noopener noreferrer");

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(detailsButton());
    });

    it("closes on a backdrop click but not on a click inside the dialog", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(detailsButton());
      const dialog = screen.getByRole("dialog");

      await user.click(dialog);
      expect(screen.getByRole("dialog")).toBeTruthy();

      await user.click(dialog.parentElement);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps Tab and Shift+Tab inside the dialog", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(detailsButton());
      const dialog = screen.getByRole("dialog");

      for (let i = 0; i < 8; i += 1) {
        await user.tab();
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
      for (let i = 0; i < 8; i += 1) {
        await user.tab({ shift: true });
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    it("does not present the stored hash or the evidence status as a verification result", async () => {
      const user = userEvent.setup();
      render(<EvidenceViewer />);
      await user.click(detailsButton());
      const dialog = screen.getByRole("dialog");

      expect(within(dialog).getByText("SHA-256 Hash (stored demo value)")).toBeTruthy();
      expect(within(dialog).getByText(evidence.hash)).toBeTruthy();
      expect(within(dialog).getByText(/nothing was uploaded to ipfs/i)).toBeTruthy();
    });

    it("exports the custody report for the evidence's case", async () => {
      const user = userEvent.setup();
      vi.mocked(exportCustodyReport).mockResolvedValueOnce(undefined);
      render(<EvidenceViewer />);
      await user.click(detailsButton());

      await user.click(screen.getByRole("button", { name: "Export PDF" }));

      await waitFor(() => expect(exportCustodyReport).toHaveBeenCalledTimes(1));
      const [caseData, list] = vi.mocked(exportCustodyReport).mock.calls[0];
      expect(caseData.id).toBe(evidence.caseId);
      expect(list.every((e) => e.caseId === evidence.caseId)).toBe(true);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Export PDF" }).disabled).toBe(false);
    });

    it("shows an alert when the PDF export fails and re-enables the button", async () => {
      const user = userEvent.setup();
      vi.mocked(exportCustodyReport).mockRejectedValueOnce(new Error("jsPDF failed to load"));
      render(<EvidenceViewer />);
      await user.click(detailsButton());

      await user.click(screen.getByRole("button", { name: "Export PDF" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("jsPDF failed to load");
      expect(screen.getByRole("button", { name: "Export PDF" }).disabled).toBe(false);
    });
  });
});
