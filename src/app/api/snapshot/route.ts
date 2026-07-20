import { NextResponse } from "next/server";
import { takeSnapshot } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily snapshot of the book (Vercel cron hits this). Idempotent per day.
async function run() {
  try {
    const r = await takeSnapshot();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
export async function GET() { return run(); }
export async function POST() { return run(); }
