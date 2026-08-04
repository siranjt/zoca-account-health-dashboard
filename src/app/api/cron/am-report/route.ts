import { NextResponse } from "next/server";
import { neonUrl } from "@/lib/neon";
import { beginAmRun, finishAmRun, takeAmSnapshot } from "@/lib/amSnapshot";
import { computeAmSnapshot } from "@/lib/amReport";
import { cronAuthFailure } from "@/lib/cronAuth";
import { istDate } from "@/lib/istDate";

// Daily AM report snapshot — one row per AM per day into alfred.am_daily.
// Scheduled at 17:30 IST (12:00 UTC), matching the laptop job it replaces.
//
// The compute (src/lib/amReport.ts) throws rather than returning a partial set,
// and this route records the failure in alfred.am_daily_run rather than writing
// a row of zeros: a report that silently reports nothing is exactly the defect
// this issue exists to fix.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // Vercel Pro; the ported compute targets <120s

export async function GET(req: Request) {
  // Fails CLOSED. The previous `if (secret) { ...verify... }` meant an unset
  // CRON_SECRET left this route fully public — and it both returns book-wide
  // aggregates and overwrites the day's owner-only snapshot.
  const denied = await cronAuthFailure(req);
  if (denied) return denied;
  if (!neonUrl()) return NextResponse.json({ ok: false, reason: "no database configured" });

  // IST, not UTC. A retry or a manual run between 18:30 and 24:00 UTC is
  // already the next day in IST; `toISOString()` stamped it as yesterday and
  // overwrote a snapshot that was already correct. See src/lib/istDate.ts.
  const date = istDate();
  const started = Date.now();
  await beginAmRun(date);
  try {
    const rows = await computeAmSnapshot();
    await takeAmSnapshot({ date, rows, source: "cron" });
    const durationMs = Date.now() - started;
    await finishAmRun(date, { ok: true, durationMs, amRows: rows.length });
    return NextResponse.json({
      ok: true,
      date,
      amRows: rows.length,
      durationMs,
      activeAccounts: rows.reduce((s, r) => s + r.activeAccounts, 0),
      untouchedHuman30d: rows.reduce((s, r) => s + r.untouchedHuman30d, 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishAmRun(date, { ok: false, durationMs: Date.now() - started, amRows: null, error: msg });
    return NextResponse.json({ ok: false, date, error: msg }, { status: 500 });
  }
}
