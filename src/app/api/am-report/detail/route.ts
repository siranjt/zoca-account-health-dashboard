import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { neonUrl } from "@/lib/neon";
import { getAmTrend } from "@/lib/amSnapshot";
import { getAmDetail } from "@/lib/amDetail";
import { buildAmReportView, parseTrend } from "@/lib/amMetrics";

// Account-level drill-down JSON for the /am-report table island. Lazy — the page
// stays light and only fetches this the first time a user clicks into a metric.
// Same admin SSO gate as the sibling xlsx export (this path is NOT under the
// /api/cron exemption), and it serves the detail for the SAME day the table
// shows (view.latest) so a cell and its account list can never disagree.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

export async function GET() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return new NextResponse("forbidden", { status: 403 });
  if (!neonUrl()) return NextResponse.json({ date: null, sheets: [] });

  const view = buildAmReportView(parseTrend(await getAmTrend()));
  const detail = await getAmDetail(view.latest ?? undefined);
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
