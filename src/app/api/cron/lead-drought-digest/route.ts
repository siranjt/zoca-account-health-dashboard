import { NextResponse } from "next/server";
import { buildAmDroughtDigests, renderDroughtBlocks, renderDroughtChannelSummary, sendAmDroughtDigests } from "@/lib/droughtDigest";
import { slackConfigured, slackLookup, slackAuthTest, slackDM, slackPost } from "@/lib/slack";

// Per-AM lead-drought alert. CRON_SECRET-gated. Slack DM each AM their quiet
// accounts (banded 30+ / 14–29 / 7–13 / 3–6 days).
//   ?dry=1            → preview targeting, sends nothing
//   ?test=<email>     → DM one real digest to a single address (defaults to the
//                       AM with the most droughts; &am=<name|email> to pick one)
//   (no params)       → the real send (also exposed to admins via the Lead
//                       Droughts page button → /api/admin/send-drought-digest)
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  const testTo = sp.get("test");

  if (dry || testTo) {
    const slack = slackConfigured();
    const channel = process.env.DIGEST_SLACK_CHANNEL || null;
    const digests = await buildAmDroughtDigests();

    if (dry) {
      return NextResponse.json({
        ok: true, dry: true,
        transports: { slackDM: slack, slackChannel: slack && !!channel ? channel : false },
        candidates: digests.length,
        preview: digests.map((d) => ({
          to: d.email, am: d.amName, total: d.total, shown: d.shown,
          bands: d.bands.map((b) => ({ band: b.label, count: b.count, accounts: b.accounts.map((a) => `${a.name} — ${a.neverHadLead ? "never" : a.droughtDays + "d"}`) })),
        })),
      });
    }

    // Test send: deliver ONE real AM digest to a single chosen recipient (yours).
    const amq = (sp.get("am") || "").toLowerCase();
    const picked = (amq ? digests.find((d) => d.email.toLowerCase() === amq || d.amName.toLowerCase().includes(amq)) : null) || digests[0];
    if (!picked) return NextResponse.json({ ok: false, reason: "no drought digest available (no account dry >= 3 days on any book)" });
    const out: Record<string, unknown> = { ok: true, test: true, previewOf: picked.amName, accounts: picked.total, sentTo: testTo };
    if (slack) {
      const look = await slackLookup(testTo!);
      if (look.id) { const { text, blocks } = renderDroughtBlocks(picked); const r = await slackDM(look.id, text, blocks); out.slack = { ok: r.ok, error: r.error }; }
      else out.slack = { ok: false, lookupError: look.error, auth: await slackAuthTest() };
    }
    if (sp.get("channel") === "1" && slack && channel && digests.length) {
      const { text, blocks } = renderDroughtChannelSummary(digests);
      const r = await slackPost(channel, text, blocks);
      out.channelPost = { channel, ok: r.ok, error: r.error };
    }
    return NextResponse.json(out);
  }

  return NextResponse.json(await sendAmDroughtDigests());
}
