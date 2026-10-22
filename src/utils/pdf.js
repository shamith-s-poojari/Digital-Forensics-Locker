// Chain-of-custody report export (DEMO).
//
// The report is generated entirely in the browser from the sample data the app ships with.
// It is NOT evidence-grade and nothing in it is recorded on a blockchain, so every page says so.
//
// jsPDF is large, so it is loaded on demand inside exportCustodyReport(); it never ends up in
// the main bundle. The report content is built by pure helpers (buildReportLines and friends)
// that do not need jsPDF, which keeps the content easy to unit-test.

// Em dash is written as an escape so the string survives any editor/encoding round trip.
export const DEMO_DISCLAIMER =
  "DEMO REPORT \u2014 generated from sample data. Not evidence-grade; nothing in this report is recorded on a blockchain.";

export const SAMPLE_VALUES_NOTE =
  "All hashes, CIDs, transaction hashes and block numbers in this report are sample values; these transactions do not exist.";

// ---------------------------------------------------------------------------------------------
// Pure content helpers
// ---------------------------------------------------------------------------------------------

// jsPDF's built-in fonts only cover Latin-1 plus a few WinAnsi punctuation marks. Anything else
// (control characters, CJK, arrows, ...) would be drawn as garbage, so replace it with "?".
const UNSUPPORTED_CHARS = /[^\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac\u2122]/g;

const clean = (value, fallback = "n/a") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replace(UNSUPPORTED_CHARS, "?");
};

const formatBlock = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : clean(value);

const toDate = (value) => {
  const date = value === undefined || value === null ? new Date() : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

/**
 * File name for the downloaded report: `custody-report-<caseId>.pdf`, where every character of
 * the case id outside [A-Za-z0-9_-] is replaced by "_" so it is always a safe file name.
 *
 * @param {unknown} caseId
 * @returns {string}
 */
export function reportFileName(caseId) {
  const safe = String(caseId ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
  return `custody-report-${safe || "unknown"}.pdf`;
}

/**
 * The custody-log entries that belong to a case: those whose `cidHash` equals the `cid` of one of
 * the case's evidence items. Entries for other cases' evidence are left out. Original log order is kept.
 *
 * @param {Array<{cid?: string}>} evidenceList Evidence of the case.
 * @param {Array<{cidHash?: string}>} custodyLog The full custody log.
 */
export function getCaseCustodyEvents(evidenceList, custodyLog) {
  const evidence = Array.isArray(evidenceList) ? evidenceList : [];
  const log = Array.isArray(custodyLog) ? custodyLog : [];
  const cids = new Set(evidence.map((item) => item?.cid).filter(Boolean));
  return log.filter((entry) => entry && cids.has(entry.cidHash));
}

/**
 * Builds the logical content of the report as an ordered list of `{ text, style, indent }` lines.
 * Nothing is truncated: full SHA-256 hashes, CIDs, wallet addresses and transaction hashes are
 * included, and the renderer wraps them to the page width.
 *
 * `style` is one of "title" | "heading" | "item" | "body" | "note" | "mono" (monospace, used for
 * hashes, CIDs, addresses and transaction hashes). `indent` is in points. A line with
 * `keepWithNext: true` should stay on the same page as the line after it.
 *
 * @param {object} caseData
 * @param {object[]} evidenceList Evidence items of the case.
 * @param {object[]} custodyLog Full custody log; filtered to the case's CIDs.
 * @param {{ generatedAt?: Date | string | number }} [options] `generatedAt` defaults to now.
 * @returns {{ text: string, style: string, indent: number, keepWithNext?: boolean }[]}
 */
export function buildReportLines(caseData, evidenceList, custodyLog, options = {}) {
  const info = caseData ?? {};
  const evidence = Array.isArray(evidenceList) ? evidenceList : [];
  const events = getCaseCustodyEvents(evidence, custodyLog);
  const generatedAt = toDate(options?.generatedAt).toISOString();

  const lines = [];
  const add = (text, style = "body", indent = 0, keepWithNext = false) => {
    const line = { text, style, indent };
    if (keepWithNext) line.keepWithNext = true;
    lines.push(line);
  };
  // Lines added by `build` are kept on one page where possible: every line but the last
  // is flagged keepWithNext, so a record is never split between a label and its value.
  const addGroup = (build) => {
    const start = lines.length;
    build();
    for (let i = start; i < lines.length - 1; i += 1) lines[i].keepWithNext = true;
  };

  add("Chain of Custody Report", "title");
  add(`Generated: ${generatedAt}`, "note");
  add(DEMO_DISCLAIMER, "note");

  add("Case Details", "heading");
  add(`Case ID: ${clean(info.id)}`);
  add(`Title: ${clean(info.title)}`);
  add(`Status: ${clean(info.status)}`);
  add(`Date opened: ${clean(info.dateOpened)}`);
  addGroup(() => {
    add("Investigating officer (wallet address):");
    add(clean(info.officer), "mono", 14);
  });
  add(`Evidence items listed: ${evidence.length}`);
  add(`Custody events listed: ${events.length}`);

  add(`Evidence Items (${evidence.length})`, "heading");
  add(SAMPLE_VALUES_NOTE, "note", 0, true);
  if (evidence.length === 0) {
    add("No evidence items are on file for this case.");
  }
  evidence.forEach((item, index) => {
    const ev = item ?? {};
    addGroup(() => {
      add(`${index + 1}. ${clean(ev.fileName)}`, "item");
      if (ev.id) add(`Evidence ID: ${clean(ev.id)}`, "body", 14);
      add(`Type: ${clean(ev.fileType)}`, "body", 14);
      add(`Status: ${clean(ev.status)}`, "body", 14);
      add(`Timestamp: ${clean(ev.timestamp)}`, "body", 14);
      add("Submitted by (wallet address):", "body", 14);
      add(clean(ev.submittedBy), "mono", 28);
      add("SHA-256 hash:", "body", 14);
      add(clean(ev.hash), "mono", 28);
      add("CID:", "body", 14);
      add(clean(ev.cid), "mono", 28);
    });
  });

  add(`Custody Log Events (${events.length})`, "heading");
  add(
    "Events whose CID matches a CID of this case's evidence. Transaction hashes and block numbers are sample values; these transactions do not exist.",
    "note",
    0,
    true
  );
  if (events.length === 0) {
    add("No events in the sample custody log reference this case's evidence.");
  }
  events.forEach((event, index) => {
    const files = evidence.filter((item) => item?.cid === event.cidHash).map((item) => clean(item.fileName));
    addGroup(() => {
      add(`${index + 1}. ${clean(event.eventType)} event`, "item");
      add(`Timestamp: ${clean(event.timestamp)}`, "body", 14);
      if (files.length > 0) add(`Evidence: ${files.join(", ")}`, "body", 14);
      add("Actor (wallet address):", "body", 14);
      add(clean(event.actor), "mono", 28);
      add("CID:", "body", 14);
      add(clean(event.cidHash), "mono", 28);
      add("Transaction hash (sample):", "body", 14);
      add(clean(event.txHash), "mono", 28);
      add(`Block number (sample): ${formatBlock(event.blockNumber)}`, "body", 14);
    });
  });

  add("End of report.", "note");
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Rendering (needs a jsPDF instance)
// ---------------------------------------------------------------------------------------------

const PAGE_MARGIN = 40; // pt
const HEADER_TOP = 28;
const CONTENT_TOP = 78;
const FOOTER_RESERVE = 52; // space kept free at the bottom of every page for the footer

// font/weight are jsPDF font names; lineHeight and before (extra space above) are in points.
const STYLES = {
  title: { font: "helvetica", weight: "bold", size: 18, color: [15, 23, 42], lineHeight: 24 },
  heading: { font: "helvetica", weight: "bold", size: 12, color: [15, 23, 42], lineHeight: 16, before: 16, keepWithNext: true },
  item: { font: "helvetica", weight: "bold", size: 10, color: [15, 23, 42], lineHeight: 14, before: 10, keepWithNext: true },
  body: { font: "helvetica", weight: "normal", size: 10, color: [30, 41, 59], lineHeight: 14 },
  note: { font: "helvetica", weight: "italic", size: 9, color: [71, 85, 105], lineHeight: 12, before: 4 },
  mono: { font: "courier", weight: "normal", size: 9, color: [15, 23, 42], lineHeight: 12 },
};

function drawContent(doc, lines) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const bottom = pageHeight - FOOTER_RESERVE;
  const usableHeight = bottom - CONTENT_TOP;

  // Measure first: wrap every line with its own font so heights are known before drawing.
  const prepared = lines.map((line) => {
    const style = STYLES[line.style] ?? STYLES.body;
    const indent = line.indent ?? 0;
    // Font must be set before splitTextToSize, which measures with the current font.
    doc.setFont(style.font, style.weight);
    doc.setFontSize(style.size);
    const rows = doc.splitTextToSize(line.text, contentWidth - indent);
    return {
      style,
      indent,
      rows,
      keepWithNext: line.keepWithNext ?? style.keepWithNext ?? false,
      height: (style.before ?? 0) + rows.length * style.lineHeight,
    };
  });

  let y = CONTENT_TOP;
  const startNewPage = () => {
    doc.addPage();
    y = CONTENT_TOP;
  };

  prepared.forEach((item, index) => {
    const { style, indent, rows } = item;

    // At the start of a keep-together chain, move the whole chain to a new page if it would be
    // split, unless it is taller than a page anyway.
    if (index === 0 || !prepared[index - 1].keepWithNext) {
      let chainHeight = 0;
      for (let i = index; i < prepared.length; i += 1) {
        chainHeight += prepared[i].height;
        if (!prepared[i].keepWithNext) break;
      }
      if (y > CONTENT_TOP && chainHeight <= usableHeight && y + chainHeight > bottom) startNewPage();
    }

    // No extra space above the first line of a page.
    if (y > CONTENT_TOP) y += style.before ?? 0;

    doc.setFont(style.font, style.weight);
    doc.setFontSize(style.size);
    doc.setTextColor(...style.color);
    for (const row of rows) {
      if (y + style.lineHeight > bottom) startNewPage();
      doc.text(row, PAGE_MARGIN + indent, y + style.size);
      y += style.lineHeight;
    }
  });
}

function drawHeadersAndFooters(doc, { caseId, generatedAt }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    // Header: the demo disclaimer on every page.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27);
    doc.splitTextToSize(DEMO_DISCLAIMER, contentWidth).forEach((row, index) => {
      doc.text(row, PAGE_MARGIN, HEADER_TOP + 8 + index * 10);
    });
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, CONTENT_TOP - 14, pageWidth - PAGE_MARGIN, CONTENT_TOP - 14);

    // Footer: case, generation time and "Page x of y".
    doc.line(PAGE_MARGIN, pageHeight - 40, pageWidth - PAGE_MARGIN, pageHeight - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const [left = ""] = doc.splitTextToSize(
      `Case ${caseId} | Generated ${generatedAt} | Demo, sample data`,
      contentWidth - 90
    );
    doc.text(left, PAGE_MARGIN, pageHeight - 26);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - PAGE_MARGIN, pageHeight - 26, { align: "right" });
  }
}

/**
 * Builds the demo custody report for a case and downloads it as a PDF.
 *
 * jsPDF is imported lazily, so the first call also downloads the PDF library. The returned
 * promise resolves with the saved file name after `doc.save()`; errors (library failed to load,
 * save failed, ...) are not caught here so the caller can show them.
 *
 * @param {object} caseData The case (id, title, officer, dateOpened, status).
 * @param {object[]} evidenceList Evidence items of that case.
 * @param {object[]} custodyLog Full custody log; only entries for the case's evidence CIDs are printed.
 * @param {{ generatedAt?: Date | string | number }} [options] Override the generation time (mainly for tests).
 * @returns {Promise<string>} The file name that was saved.
 */
export async function exportCustodyReport(caseData, evidenceList, custodyLog, options = {}) {
  if (!caseData) throw new Error("exportCustodyReport: caseData is required");

  const { jsPDF } = await import("jspdf");

  const generatedAt = toDate(options?.generatedAt);
  const lines = buildReportLines(caseData, evidenceList, custodyLog, { generatedAt });
  const fileName = reportFileName(caseData.id);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setProperties({
    title: `Chain of Custody Report (DEMO) - ${clean(caseData.id)}`,
    subject: DEMO_DISCLAIMER,
    creator: "Digital Forensics Locker (demo)",
  });

  drawContent(doc, lines);
  drawHeadersAndFooters(doc, { caseId: clean(caseData.id), generatedAt: generatedAt.toISOString() });

  doc.save(fileName);
  return fileName;
}
