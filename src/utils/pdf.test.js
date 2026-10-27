import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_DISCLAIMER,
  buildReportLines,
  exportCustodyReport,
  getCaseCustodyEvents,
  reportFileName,
} from "./pdf";

// A recording stand-in for jsPDF: no real PDF is produced, but every call the report makes is kept.
const { instances } = vi.hoisted(() => ({ instances: [] }));

vi.mock("jspdf", () => {
  class FakeJsPDF {
    constructor(options) {
      this.options = options;
      this.pages = [[]];
      this.current = 0;
      this.fontSize = 10;
      this.splitCalls = [];
      this.saved = [];
      this.internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } };
      instances.push(this);
    }
    setProperties(properties) {
      this.properties = properties;
    }
    setFont() {}
    setFontSize(size) {
      this.fontSize = size;
    }
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    // Greedy word wrap (long words are cut), like jsPDF's: enough to exercise the layout code.
    splitTextToSize(text, width) {
      this.splitCalls.push({ text, width });
      const perLine = Math.max(8, Math.floor(width / (this.fontSize * 0.6)));
      const chunk = new RegExp(`.{1,${perLine}}`, "gs");
      const pieces = String(text)
        .split(" ")
        .flatMap((word) => word.match(chunk) ?? [""]);
      const rows = [];
      for (const piece of pieces) {
        const last = rows[rows.length - 1];
        if (last !== undefined && last.length + 1 + piece.length <= perLine) rows[rows.length - 1] = `${last} ${piece}`;
        else rows.push(piece);
      }
      return rows.length > 0 ? rows : [""];
    }
    text(value, x, y, options) {
      this.pages[this.current].push({ text: String(value), x, y, options });
    }
    addPage() {
      this.pages.push([]);
      this.current = this.pages.length - 1;
    }
    getNumberOfPages() {
      return this.pages.length;
    }
    setPage(page) {
      this.current = page - 1;
    }
    save(name) {
      this.saved.push(name);
    }
  }
  return { jsPDF: FakeJsPDF };
});

const hex64 = (seed) => seed.repeat(64).slice(0, 64);

const evidenceA = {
  id: "EVD-1",
  caseId: "CASE-1",
  fileName: "photo_01.jpg",
  fileType: "Digital Image",
  hash: hex64("a3f5c2d1"),
  cid: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
  submittedBy: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  timestamp: "2025-06-01 09:23:11",
  status: "Verified",
};
const evidenceB = {
  ...evidenceA,
  id: "EVD-2",
  fileName: "device_log.txt",
  fileType: "Device Log",
  hash: hex64("b4e6d3f2"),
  cid: "bafybeigdyrzt5sfp7edupa6g6csmvefqwuzrqqqsmjhl6sjw37jqyw33iq",
  status: "Pending",
};
const caseData = {
  id: "CASE-1",
  title: "Test case",
  officer: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  dateOpened: "2025-05-28",
  status: "Active",
};

const event = (id, cidHash, extra = {}) => ({
  id,
  eventType: "Access",
  cidHash,
  actor: "0x9C7a34f0B6e1dF8a2C4d5E9f0B3a4C5d6E7f8A9b",
  timestamp: "2025-06-02 10:00:00",
  txHash: `0x${id.replace(/\W/g, "").toLowerCase().padEnd(64, "0")}`,
  blockNumber: 7482910,
  ...extra,
});

const OTHER_CID = "QmUnrelatedCidFromAnotherCase1234567890abcdefghij";
const relevantEvent = event("LOG-1", evidenceA.cid, { txHash: `0x${hex64("abc123de")}`.slice(0, 66) });
const unrelatedEvent = event("LOG-9", OTHER_CID, { txHash: `0x${hex64("deadbeef")}`.slice(0, 66), blockNumber: 9999999 });
const custodyLog = [relevantEvent, unrelatedEvent];

const allText = (lines) => lines.map((line) => line.text).join("\n");
const fakeText = (doc) => doc.pages.flat().map((call) => call.text).join("\n");

describe("reportFileName", () => {
  it("builds custody-report-<caseId>.pdf", () => {
    expect(reportFileName("CASE-2025-0042")).toBe("custody-report-CASE-2025-0042.pdf");
  });

  it("replaces every character outside [A-Za-z0-9_-] with an underscore", () => {
    expect(reportFileName("CASE/2025 0042*.v2")).toBe("custody-report-CASE_2025_0042__v2.pdf");
    expect(reportFileName("../../etc/passwd")).toBe("custody-report-______etc_passwd.pdf");
    expect(reportFileName("a\\b:c")).toBe("custody-report-a_b_c.pdf");
  });

  it("never produces an empty id part", () => {
    expect(reportFileName("")).toBe("custody-report-unknown.pdf");
    expect(reportFileName(undefined)).toBe("custody-report-unknown.pdf");
  });
});

describe("getCaseCustodyEvents", () => {
  it("keeps only events whose cidHash is a CID of the case's evidence", () => {
    expect(getCaseCustodyEvents([evidenceA, evidenceB], custodyLog)).toEqual([relevantEvent]);
  });

  it("returns nothing without evidence or without a log", () => {
    expect(getCaseCustodyEvents([], custodyLog)).toEqual([]);
    expect(getCaseCustodyEvents([evidenceA], undefined)).toEqual([]);
    expect(getCaseCustodyEvents(undefined, custodyLog)).toEqual([]);
  });

  it("matches CIDs exactly, not by prefix", () => {
    const prefixOnly = event("LOG-2", `${evidenceA.cid}-extra`);
    expect(getCaseCustodyEvents([evidenceA], [prefixOnly])).toEqual([]);
  });
});

describe("buildReportLines", () => {
  const generatedAt = new Date("2026-01-02T03:04:05.678Z");
  const lines = buildReportLines(caseData, [evidenceA, evidenceB], custodyLog, { generatedAt });
  const text = allText(lines);

  it("prints the full 64-character hashes and the full CIDs, untruncated", () => {
    expect(evidenceA.hash).toHaveLength(64);
    expect(text).toContain(evidenceA.hash);
    expect(text).toContain(evidenceB.hash);
    expect(text).toContain(evidenceA.cid);
    expect(text).toContain(evidenceB.cid);
    expect(text).not.toMatch(/\.\.\./);
  });

  it("puts hashes, CIDs, addresses and tx hashes on monospace lines", () => {
    const mono = lines.filter((line) => line.style === "mono").map((line) => line.text);
    expect(mono).toEqual(
      expect.arrayContaining([evidenceA.hash, evidenceA.cid, evidenceA.submittedBy, relevantEvent.txHash, relevantEvent.actor])
    );
  });

  it("lists each evidence item with file name, type, status, submitter and timestamp", () => {
    for (const item of [evidenceA, evidenceB]) {
      expect(text).toContain(item.fileName);
      expect(text).toContain(`Type: ${item.fileType}`);
      expect(text).toContain(`Status: ${item.status}`);
      expect(text).toContain(item.submittedBy);
      expect(text).toContain(`Timestamp: ${item.timestamp}`);
    }
  });

  it("includes relevant custody events with type, actor, timestamp, tx hash and block number", () => {
    expect(text).toContain("Access event");
    expect(text).toContain(relevantEvent.actor);
    expect(text).toContain(`Timestamp: ${relevantEvent.timestamp}`);
    expect(text).toContain(relevantEvent.txHash);
    expect(text).toContain("Block number (sample): 7,482,910");
    expect(text).toContain("Evidence: photo_01.jpg");
  });

  it("excludes custody events that belong to other cases", () => {
    expect(text).not.toContain(unrelatedEvent.txHash);
    expect(text).not.toContain(unrelatedEvent.cidHash);
    expect(text).not.toContain("9,999,999");
    expect(text).toContain("Custody events listed: 1");
  });

  it("states the demo disclaimer, the sample-data note and the generation time", () => {
    expect(DEMO_DISCLAIMER).toBe(
      "DEMO REPORT \u2014 generated from sample data. Not evidence-grade; nothing in this report is recorded on a blockchain."
    );
    expect(text).toContain(DEMO_DISCLAIMER);
    expect(text).toMatch(/these transactions do not exist/);
    expect(text).toContain("Generated: 2026-01-02T03:04:05.678Z");
  });

  it("uses the current time as an ISO string when no generation time is given", () => {
    const before = Date.now();
    const generated = allText(buildReportLines(caseData, [], [])).match(/Generated: (\S+)/)[1];
    expect(new Date(generated).toISOString()).toBe(generated);
    expect(new Date(generated).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("says so when there is no evidence or no matching event", () => {
    const empty = allText(buildReportLines(caseData, [], custodyLog));
    expect(empty).toContain("No evidence items are on file for this case.");
    expect(empty).toContain("No events in the sample custody log reference this case's evidence.");
  });

  it("replaces characters the PDF fonts cannot draw", () => {
    const odd = allText(buildReportLines(caseData, [{ ...evidenceA, fileName: "evil\u0000name\u2192.txt" }], []));
    expect(odd).toContain("evil?name?.txt");
  });

  it("copes with missing optional fields", () => {
    expect(() => buildReportLines({}, [{}], [{ cidHash: undefined }])).not.toThrow();
    expect(() => buildReportLines(undefined, undefined, undefined)).not.toThrow();
  });
});

describe("exportCustodyReport", () => {
  beforeEach(() => {
    instances.length = 0;
  });

  it("does not import jsPDF statically, so the PDF library stays out of the main bundle", () => {
    const source = readFileSync(new URL("./pdf.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import[^;]*from\s*["']jspdf["']/m);
    expect(source).toMatch(/await import\(\s*["']jspdf["']\s*\)/);
  });

  it("loads jsPDF on demand, saves exactly once under a sanitised name and resolves after saving", async () => {
    expect(instances).toHaveLength(0);
    const result = await exportCustodyReport({ ...caseData, id: "CASE/2025 7*" }, [evidenceA, evidenceB], custodyLog);

    expect(instances).toHaveLength(1);
    const [doc] = instances;
    expect(doc.saved).toEqual(["custody-report-CASE_2025_7_.pdf"]);
    expect(result).toBe("custody-report-CASE_2025_7_.pdf");
    expect(doc.options).toMatchObject({ unit: "pt", format: "a4" });
  });

  it("wraps full hashes and CIDs, and draws the case's events but not other cases' events", async () => {
    await exportCustodyReport(caseData, [evidenceA, evidenceB], custodyLog);
    const [doc] = instances;
    const text = fakeText(doc);

    for (const value of [evidenceA.hash, evidenceB.hash, evidenceA.cid, relevantEvent.txHash]) {
      expect(text).toContain(value);
      expect(doc.splitCalls.some((call) => call.text === value && call.width < 595.28)).toBe(true);
    }
    expect(text).not.toContain(unrelatedEvent.txHash);
  });

  it("adds pages when the content is long and labels every page 'Page x of y' with the disclaimer", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...evidenceA,
      id: `EVD-${i}`,
      fileName: `evidence_item_${i}.bin`,
      cid: `QmCid${String(i).padStart(2, "0")}${"x".repeat(40)}`,
    }));
    const log = many.map((item, i) => event(`LOG-${i}`, item.cid));

    await exportCustodyReport(caseData, many, log, { generatedAt: new Date("2026-01-02T03:04:05.678Z") });
    const [doc] = instances;
    const total = doc.pages.length;

    expect(total).toBeGreaterThan(1);
    doc.pages.forEach((calls, index) => {
      // The disclaimer may wrap over several rows, so compare with whitespace collapsed.
      const pageText = calls.map((call) => call.text).join("\n");
      expect(pageText.replace(/\s+/g, " ")).toContain(DEMO_DISCLAIMER);
      expect(pageText).toContain(`Page ${index + 1} of ${total}`);
      expect(pageText).toContain("Generated 2026-01-02T03:04:05.678Z");
    });
    expect(fakeText(doc)).toContain("evidence_item_11.bin");
  });

  it("keeps content above the footer area on every page", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...evidenceA, id: `EVD-${i}`, cid: `QmCid${i}` }));
    await exportCustodyReport(caseData, many, []);
    const [doc] = instances;
    const pageHeight = 841.89;
    const footerY = pageHeight - 26;
    for (const call of doc.pages.flat()) {
      expect(call.y === footerY || call.y <= pageHeight - 52).toBe(true);
    }
  });

  it("lets errors propagate to the caller", async () => {
    await expect(exportCustodyReport(undefined, [], [])).rejects.toThrow(/caseData is required/);
  });

  it("rejects when saving fails", async () => {
    const { jsPDF } = await import("jspdf");
    const save = vi.spyOn(jsPDF.prototype, "save").mockImplementation(() => {
      throw new Error("disk full");
    });
    try {
      await expect(exportCustodyReport(caseData, [evidenceA], custodyLog)).rejects.toThrow("disk full");
    } finally {
      save.mockRestore();
    }
  });
});
