import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { buildAmDroughtDigests, sendAmDroughtDigests } from "@/lib/droughtDigest";

// Admin-triggered lead-drought AM alert. GET ?dry=1 previews targeting (sends
// nothing); POST performs the real per-AM Slack send. Powers the "Send AM
// alerts" button on the Lead Droughts page.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (new URL(req.url).searchParams.get("dry") !== "1") return NextResponse.json({ error: "use POST to send, or ?dry=1 to preview" }, { status: 400 });
  const digests = await buildAmDroughtDigests();
  return NextResponse.json({
    ok: true, dry: true, candidates: digests.length,
    totalAccounts: digests.reduce((s, d) => s + d.total, 0),
    preview: digests.map((d) => ({ am: d.amName, email: d.email, accounts: d.total, bands: d.bands.map((b) => `${b.label}: ${b.count}`) })),
  });
}

export async function POST() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await sendAmDroughtDigests());
}
