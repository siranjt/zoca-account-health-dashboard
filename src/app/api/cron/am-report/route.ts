import { NextResponse } from "next/server";
import { neonUrl } from "@/lib/neon";
import { beginAmRun, finishAmRun } from "@/lib/amSnapshot";

// Daily AM report snapshot — one row per AM per day into alfred.am_daily.
// Scheduled at 17:30 IST (12:00 UTC), matching the laptop job it replaces.
//
// PHASE 1: the schema, the run log and the auth gate are live; the compute
// itself (port of daily_am_report_detailed.py — 12 metrics, 8 sources) lands in
// phase 2. Until then this route logs an honest failed run rather than writing
// a row of zeros: a report that silently reports nothing is exactly the defect
// this issue exists to fix.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // Vercel Pro; the ported compute targets <120s

const NOT_IMPLEMENTED = "compute not ported yet (phase 2)";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  }
  if (!neonUrl()) return NextResponse.json({ ok: false, reason: "no database configured" });

  const date = new Date().toISOString().slice(0, 10);
  const started = Date.now();
  await beginAmRun(date);
  try {
    // Phase 2 replaces this block with:
    //   const rows = await computeAmSnapshot();
    //   await takeAmSnapshot({ date, rows, source: "cron" });
    throw new Error(NOT_IMPLEMENTED);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishAmRun(date, { ok: false, durationMs: Date.now() - started, amRows: null, error: msg });
    if (msg === NOT_IMPLEMENTED) return NextResponse.json({ ok: false, date, pending: msg });
    return NextResponse.json({ ok: false, date, error: msg }, { status: 500 });
  }
}
