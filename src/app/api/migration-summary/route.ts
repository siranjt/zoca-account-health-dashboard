import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getMigrationSummary } from "@/lib/metabase";

// Book-wide Discovery & Scheduling migration roll-up (card 5393), fetched
// client-side so a cold ~30s run never blocks the account detail page. Returns
// only the requested AM's row + the ALL-ACCOUNTS benchmark (no other-AM rows).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const am = (new URL(req.url).searchParams.get("am") || "").trim();
  const pick = (r: Record<string, unknown>) => ({
    label: String(r.am_name), accounts: Number(r.accounts) || 0,
    schedOptedInPct: num(r.sched_opted_in_pct), schedEnabledPct: num(r.sched_enabled_pct),
    webActivePct: num(r.web_active_pct), keywordsPct: num(r.keywords_pct),
    contentPct: num(r.content_pct), fullyActivatedPct: num(r.fully_activated_pct),
  });
  try {
    const rows = await getMigrationSummary();
    const amRow = rows.find((r) => String(r.am_name) === am);
    const allRow = rows.find((r) => String(r.am_name) === "ALL ACCOUNTS");
    return NextResponse.json({ am: amRow ? pick(amRow) : null, all: allRow ? pick(allRow) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 140), am: null, all: null });
  }
}
