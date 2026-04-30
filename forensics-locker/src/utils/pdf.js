import jsPDF from "jspdf";

export function exportCustodyReport(caseData, evidenceList, custodyLog) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Chain of Custody Report", 20, 20);
  doc.setFontSize(12);
  doc.text("Case ID: " + caseData.id, 20, 35);
  doc.text("Case Title: " + caseData.title, 20, 45);
  doc.text("Investigating Officer: " + caseData.officer, 20, 55);
  doc.text("Date Opened: " + caseData.dateOpened, 20, 65);
  doc.text("Status: " + caseData.status, 20, 75);
  doc.text("Evidence Files:", 20, 90);
  evidenceList.forEach((ev, i) => {
    doc.text((i + 1) + ". " + ev.fileName + " | Hash: " + ev.hash.slice(0, 20) + "...", 25, 100 + i * 10);
  });
  doc.save("custody-report-" + caseData.id + ".pdf");
}
