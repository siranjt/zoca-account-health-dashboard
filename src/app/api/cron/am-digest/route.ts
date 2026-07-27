import { NextResponse } from "next/server";
import { buildAmDigests, renderDigestEmail } from "@/lib/digest";
import { sendEmail, mailerConfigured } from "@/lib/mailer";
import { slackConfigured, slackLookup, slackAuthTest, slackDM, slackPost, renderDigestBlocks, renderChannelSummary } from "@/lib/slack";
import { sendAmDigests } from "@/lib/digestSend";

// Scheduled per-AM "your book needs attention" digest. CRON_SECRET-gated.
// Transports fire based on which env is set — configure email, Slack, or both:
//   • RESEND_API_KEY + DIGEST_FROM  → email each AM
//   • SLACK_BOT_TOKEN               → DM each AM (email→id via lookupByEmail)
//   • + DIGEST_SLACK_CHANNEL        → also post a manager roll-up to that channel
// ?dry=1 previews targeting (sends nothing). ?test=<email> DMs one digest to a
// single address. No params = the real send (also exposed to admins via the
// Impact page button → /api/admin/send-digest).
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
  const testTo = sp.get("test"); // one-off: DM a single real digest to this address only

  if (dry || testTo) {
    const email = mailerConfigured();
    const slack = slackConfigured();
    const channel = process.env.DIGEST_SLACK_CHANNEL || null;
    const digests = await buildAmDigests();

    if (dry) {
      return NextResponse.json({
        ok: true, dry: true,
        transports: { email, slackDM: slack, slackChannel: slack && !!channel ? channel : false },
        candidates: digests.length,
        preview: digests.map((d) => ({
          to: d.email, am: d.amName, subject: renderDigestEmail(d).subject, totalAtRisk: d.totalAtRisk, shown: d.shown,
          groups: d.groups.map((g) => ({ category: g.label, count: g.count, accounts: g.accounts.map((a) => `${a.name} — ${a.reason}`) })),
        })),
      });
    }

    // Test send: deliver ONE real AM digest to a single chosen recipient (yours),
    // without touching the actual AMs. ?test=<email>&am=<name|email>&channel=1.
    const amq = (sp.get("am") || "").toLowerCase();
    const picked = (amq ? digests.find((d) => d.email.toLowerCase() === amq || d.amName.toLowerCase().includes(amq)) : null) || digests[0];
    if (!picked) return NextResponse.json({ ok: false, reason: "no digest available (no at-risk accounts on any book)" });
    const out: Record<string, unknown> = { ok: true, test: true, previewOf: picked.amName, accounts: picked.shown, sentTo: testTo };
    if (email) { const { subject, html } = renderDigestEmail(picked); const r = await sendEmail({ to: testTo!, subject, html }); out.email = { ok: r.ok, error: r.error }; }
    if (slack) {
      const look = await slackLookup(testTo!);
      if (look.id) { const { text, blocks } = renderDigestBlocks(picked); const r = await slackDM(look.id, text, blocks); out.slack = { ok: r.ok, error: r.error }; }
      else out.slack = { ok: false, lookupError: look.error, auth: await slackAuthTest() };
    }
    if (sp.get("channel") === "1" && slack && channel && digests.length) {
      const { text, blocks } = renderChannelSummary(digests);
      const r = await slackPost(channel, text, blocks);
      out.channelPost = { channel, ok: r.ok, error: r.error };
    }
    return NextResponse.json(out);
  }

  // Real send — shared with the admin button.
  return NextResponse.json(await sendAmDigests());
}
