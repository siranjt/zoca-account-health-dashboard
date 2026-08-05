import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { neonUrl } from "@/lib/neon";
import { getAmTrend } from "@/lib/amSnapshot";
import { getAmDetail } from "@/lib/amDetail";
import { buildAmReportView, parseTrend } from "@/lib/amMetrics";
import { buildAmReportXlsx } from "@/lib/amExcel";

// Admin-facing xlsx download of the AM report. SSO-gated by src/middleware.ts
// (this path is NOT under the /api/cron exemption) plus the admin check below —
// the sibling /api/cron/am-report/export is a bearer-secret JSON feed for the
// laptop workbook, a different consumer. Reads the same snapshot view the page
// renders; recomputes nothing.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return new NextResponse("forbidden", { status: 403 });
  if (!neonUrl()) return new NextResponse("no database configured", { status: 503 });

  const view = buildAmReportView(parseTrend(await getAmTrend()));
  // Drill-down sheets for the same day the Summary describes. Empty (never
  // throws) when nothing has been ingested yet — the export stays Summary-only.
  const detail = await getAmDetail(view.latest ?? undefined);
  const buf = await buildAmReportXlsx(view, detail.sheets);
  const fname = `AM_Daily_Report_${view.latest ?? "latest"}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
