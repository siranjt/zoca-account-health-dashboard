// Styled xlsx export of the AM report's aggregate view — Phase A. Mirrors the
// look of the local workbook (~/scripts/daily_am_report_detailed.py): dark
// headers, a caveat note row, a bold total row, frozen panes. It exports only
// what the app HAS (Summary + Definitions); the account-level drill-down sheets
// are Phase B (persist the Python's drill-downs to Neon, then read them here —
// never a second implementation of the metric queries).

import ExcelJS from "exceljs";
import { AM_METRICS, ddmmyy, type AmReportView, type MetricFormat } from "@/lib/amMetrics";
import type { DetailSheet } from "@/lib/amDetail";

const HDR_FILL = "FF1F2937"; // slate-800
const HDR_TEXT = "FFFFFFFF";
const TOT_FILL = "FFE5E7EB"; // gray-200
const NOTE_TEXT = "FF6B7280"; // gray-500

function numFmt(f: MetricFormat): string {
  return f === "money" ? "#,##0" : f === "pct" ? '0.0"%"' : "#,##0";
}

// The app owns Summary (from alfred.am_daily) and Definitions (from AM_METRICS);
// the workbook sends its own copies of both. Skip them so the export shows one
// authoritative version of each and inserts only the account-level sheets.
const APP_OWNED = new Set(["Summary", "Definitions"]);

/**
 * Render one drill-down sheet exactly as the laptop workbook's `sheet()` helper
 * lays it out (~/scripts/daily_am_report_detailed.py): an italic grey note on
 * row 1, dark centred headers, the account rows, then a bold grey TOTAL — frozen
 * below the header. The rows arrive already computed; nothing is derived here.
 */
function renderDetailSheet(wb: ExcelJS.Workbook, sheet: DetailSheet): void {
  const hasNotes = !!sheet.notes;
  const headerRow = hasNotes ? 3 : 1;
  const ws = wb.addWorksheet(sheet.title, {
    views: [{ state: "frozen", ySplit: hasNotes ? 3 : 1 }],
  });

  if (hasNotes) {
    ws.getCell("A1").value = sheet.notes;
    ws.getCell("A1").font = { italic: true, size: 9, color: { argb: NOTE_TEXT } };
    ws.getCell("A1").alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(1, 1, 1, Math.max(1, sheet.headers.length));
    ws.getRow(1).height = 32;
  }

  const hRow = ws.getRow(headerRow);
  sheet.headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR_FILL } };
    c.font = { bold: true, color: { argb: HDR_TEXT }, size: 10 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  hRow.height = 26;

  const put = (cell: ExcelJS.Cell, v: DetailSheet["rows"][number][number]) => {
    if (v === "" || v === null || v === undefined) return; // leave blank, like the workbook
    cell.value = v as ExcelJS.CellValue;
    cell.alignment = { horizontal: typeof v === "number" ? "right" : "left" };
  };

  sheet.rows.forEach((row, ri) => {
    const xr = ws.getRow(headerRow + 1 + ri);
    row.forEach((v, i) => put(xr.getCell(i + 1), v));
  });

  if (sheet.totalRow) {
    const tr = ws.getRow(headerRow + 1 + sheet.rows.length);
    sheet.totalRow.forEach((v, i) => {
      const cell = tr.getCell(i + 1);
      put(cell, v);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOT_FILL } };
      cell.font = { bold: true };
    });
  }

  const widths = sheet.widths ?? [];
  sheet.headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i] ?? Math.max(10, Math.min(40, h.length + 3));
  });
}

export async function buildAmReportXlsx(
  view: AmReportView,
  details: DetailSheet[] = [],
): Promise<Buffer> {
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

  // ---- Account-level drill-down sheets (Phase B) ----
  // Inserted between Summary and Definitions, in the workbook's own order, so
  // the exported file matches the reference layout. Empty when no detail has
  // been ingested for the day — the export degrades to Summary + Definitions.
  details
    .filter((s) => !APP_OWNED.has(s.title))
    .sort((a, b) => a.seq - b.seq)
    .forEach((s) => renderDetailSheet(wb, s));

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
