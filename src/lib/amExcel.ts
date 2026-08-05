// Styled xlsx export of the AM report's aggregate view — Phase A. Mirrors the
// look of the local workbook (~/scripts/daily_am_report_detailed.py): dark
// headers, a caveat note row, a bold total row, frozen panes. It exports only
// what the app HAS (Summary + Definitions); the account-level drill-down sheets
// are Phase B (persist the Python's drill-downs to Neon, then read them here —
// never a second implementation of the metric queries).

import ExcelJS from "exceljs";
import { AM_METRICS, ddmmyy, type AmReportView, type MetricFormat } from "@/lib/amMetrics";

const HDR_FILL = "FF1F2937"; // slate-800
const HDR_TEXT = "FFFFFFFF";
const TOT_FILL = "FFE5E7EB"; // gray-200
const NOTE_TEXT = "FF6B7280"; // gray-500

function numFmt(f: MetricFormat): string {
  return f === "money" ? "#,##0" : f === "pct" ? '0.0"%"' : "#,##0";
}

export async function buildAmReportXlsx(view: AmReportView): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAVE//OS · Account Health Platform";
  wb.created = new Date(0); // deterministic; the snapshot date is the real timestamp

  // ---- Summary ----
  const ws = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
  });
  const dateLabel = view.latest ? ddmmyy(view.latest) : "—";
  ws.getCell("A1").value =
    `Daily AM report — ${dateLabel}. One row per account manager, read straight from the daily snapshot (alfred.am_daily) — nothing is recomputed here. Churn % is blank where the AM holds no live book, because a rate on an empty denominator is arithmetic, not performance. See the Definitions sheet.`;
  ws.getCell("A1").font = { italic: true, size: 9, color: { argb: NOTE_TEXT } };
  ws.getCell("A1").alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(1, 1, 1, AM_METRICS.length + 1);
  ws.getRow(1).height = 42;

  const headers = ["AM", ...AM_METRICS.map((m) => m.label)];
  const hRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR_FILL } };
    c.font = { bold: true, color: { argb: HDR_TEXT }, size: 10 };
    c.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle", wrapText: true };
  });
  hRow.height = 28;

  const rows = view.totalRow ? [view.totalRow, ...view.amRows] : view.amRows;
  rows.forEach((row, ri) => {
    const xr = ws.getRow(4 + ri);
    xr.getCell(1).value = row.amName;
    xr.getCell(1).alignment = { horizontal: "left" };
    AM_METRICS.forEach((m, i) => {
      const cell = xr.getCell(i + 2);
      const v = row.values[m.key];
      if (v !== null && v !== undefined) {
        cell.value = v;
        cell.numFmt = numFmt(m.format);
      }
      cell.alignment = { horizontal: "right" };
    });
    if (row.isTotal) {
      for (let c = 1; c <= AM_METRICS.length + 1; c++) {
        const cell = xr.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOT_FILL } };
        cell.font = { bold: true };
      }
    }
  });

  ws.getColumn(1).width = 22;
  AM_METRICS.forEach((m, i) => {
    ws.getColumn(i + 2).width = Math.max(11, Math.min(22, m.label.length + 3));
  });

  // ---- Definitions ----
  const def = wb.addWorksheet("Definitions", { views: [{ state: "frozen", ySplit: 1 }] });
  ["Metric", "How it is computed"].forEach((h, i) => {
    const c = def.getRow(1).getCell(i + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR_FILL } };
    c.font = { bold: true, color: { argb: HDR_TEXT }, size: 10 };
  });
  AM_METRICS.forEach((m, i) => {
    const r = 2 + i;
    def.getCell(r, 1).value = m.label;
    def.getCell(r, 1).font = { bold: true };
    def.getCell(r, 1).alignment = { vertical: "top" };
    const c2 = def.getCell(r, 2);
    c2.value = m.definition + (m.caveat ? `  ⚠ ${m.caveat}` : "");
    c2.alignment = { wrapText: true, vertical: "top" };
  });
  def.getColumn(1).width = 26;
  def.getColumn(2).width = 96;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
