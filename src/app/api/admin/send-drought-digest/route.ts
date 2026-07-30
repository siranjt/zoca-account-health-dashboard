import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { buildAmDroughtDigests, renderDroughtBlocks, sendAmDroughtDigests } from "@/lib/droughtDigest";
import { slackConfigured, slackLookup, slackAuthTest, slackDM } from "@/lib/slack";

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

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Test mode: DM ONE sample digest (the AM with the most droughts) to a chosen
  // Slack address only — no real AM is touched. ?test=1&to=<email>.
  const sp = new URL(req.url).searchParams;
  if (sp.get("test") === "1") {
    const to = (sp.get("to") || viewer.email || "").trim();
    if (!to) return NextResponse.json({ ok: false, reason: "no recipient — pass ?to=<email>" });
    if (!slackConfigured()) return NextResponse.json({ ok: false, reason: "Slack not configured (SLACK_BOT_TOKEN missing)" });
    const digests = (await buildAmDroughtDigests()).sort((a, b) => b.total - a.total);
    const picked = digests[0];
    if (!picked) return NextResponse.json({ ok: false, reason: "no drought digest available (no account dry ≥ 3 days on any book)" });
    const look = await slackLookup(to);
    if (!look.id) return NextResponse.json({ ok: false, sentTo: to, lookupError: look.error, auth: await slackAuthTest() });
    const { text, blocks } = renderDroughtBlocks(picked);
    const r = await slackDM(look.id, text, blocks);
    return NextResponse.json({ ok: r.ok, test: true, sentTo: to, sampleOf: picked.amName, accounts: picked.total, error: r.error });
  }

  return NextResponse.json(await sendAmDroughtDigests());
}
