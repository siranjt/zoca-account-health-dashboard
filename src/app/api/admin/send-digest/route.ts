import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { sendAmDigests } from "@/lib/digestSend";

// Admin-only "Send the AM digest now" — session-gated (no CRON_SECRET needed),
// powers the button on the Impact page. Same real send as the Monday cron.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const result = await sendAmDigests();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
