import { NextResponse } from "next/server";
import { takeSnapshot } from "@/lib/snapshots";
import { neonUrl } from "@/lib/neon";
import { cronAuthFailure } from "@/lib/cronAuth";

// Daily snapshot of the book (Vercel cron hits this). Idempotent per day.
//
// MOVED from /api/snapshot on 03/08/26, and the move IS the bug fix.
// src/middleware.ts:22 exempts only /api/auth, /api/cron, /api/digest/click and
// /signin from the SSO gate. /api/snapshot sat outside that list, so once SSO was
// switched on every Vercel Cron invocation was 307-redirected to /signin and the
// handler never executed. alfred.book_daily therefore stopped writing after
// 23/07 with no error, no log and no row — eleven days of silence that nothing
// surfaced. Everything under /api/cron is exempt, so the path is the fix.
//
// The CRON_SECRET gate is new. The old route had NO auth of its own; its only
// protection was the middleware that was breaking it, so exempting it as-is
// would have made a database write publicly triggerable by URL.
//
// maxDuration is raised 60 -> 300 (Vercel Pro) as insurance, not diagnosis: the
// redirect explains the failure on its own, but the book payload has grown and a
// 60s ceiling is a plausible second failure mode not worth waiting to discover.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

async function run(req: Request) {
  // Fails CLOSED: an unset CRON_SECRET now refuses rather than opening the route.
  // The previous `if (secret) { ...verify... }` left this endpoint — a Metabase
  // pull plus a Neon write, exempt from SSO by the /api/cron prefix — completely
  // public whenever the env var was missing.
  const denied = await cronAuthFailure(req);
  if (denied) return denied;
  if (!neonUrl()) return NextResponse.json({ ok: false, reason: "no database configured" });
  try {
    const r = await takeSnapshot();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message || e).slice(0, 200) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
