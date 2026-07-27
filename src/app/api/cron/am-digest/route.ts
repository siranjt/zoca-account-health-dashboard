import { NextResponse } from "next/server";
import { buildAmDigests, renderDigestEmail } from "@/lib/digest";
import { sendEmail, mailerConfigured } from "@/lib/mailer";
import { slackConfigured, slackLookup, slackAuthTest, slackDM, slackPost, renderDigestBlocks, renderChannelSummary } from "@/lib/slack";
import { logActivity } from "@/lib/activity";

// Scheduled per-AM "your book needs attention" digest. CRON_SECRET-gated.
// Transports fire based on which env is set — configure email, Slack, or both:
//   • RESEND_API_KEY + DIGEST_FROM  → email each AM
//   • SLACK_BOT_TOKEN               → DM each AM (email→id via lookupByEmail)
//   • + DIGEST_SLACK_CHANNEL        → also post a manager roll-up to that channel
// ?dry=1 builds + renders but sends nothing (verify targeting first).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  const testTo = sp.get("test"); // one-off: DM a single real digest to this address only
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
  // without touching the actual AMs. ?test=<email>&am=<name|email>. Defaults to
  // the first AM with at-risk accounts.
  if (testTo) {
    const amq = (sp.get("am") || "").toLowerCase();
    const picked = (amq ? digests.find((d) => d.email.toLowerCase() === amq || d.amName.toLowerCase().includes(amq)) : null) || digests[0];
    if (!picked) return NextResponse.json({ ok: false, reason: "no digest available (no at-risk accounts on any book)" });
    const out: Record<string, unknown> = { ok: true, test: true, previewOf: picked.amName, accounts: picked.shown, sentTo: testTo };
    if (email) { const { subject, html } = renderDigestEmail(picked); const r = await sendEmail({ to: testTo, subject, html }); out.email = { ok: r.ok, error: r.error }; }
    if (slack) {
      const look = await slackLookup(testTo);
      if (look.id) { const { text, blocks } = renderDigestBlocks(picked); const r = await slackDM(look.id, text, blocks); out.slack = { ok: r.ok, error: r.error }; }
      else out.slack = { ok: false, lookupError: look.error, auth: await slackAuthTest() };
    }
    // &channel=1 also posts the manager roll-up to DIGEST_SLACK_CHANNEL, so the
    // channel summary can be verified in isolation before the real Monday send.
    if (sp.get("channel") === "1" && slack && channel && digests.length) {
      const { text, blocks } = renderChannelSummary(digests);
      const r = await slackPost(channel, text, blocks);
      out.channelPost = { channel, ok: r.ok, error: r.error };
    }
    return NextResponse.json(out);
  }

  const results: Array<{ email: string; emailOk?: boolean; slackOk?: boolean; slackError?: string; accounts: number }> = [];
  let emailSent = 0, dmSent = 0;

  for (const d of digests) {
    const row: (typeof results)[number] = { email: d.email, accounts: d.shown };

    if (email) {
      const { subject, html } = renderDigestEmail(d);
      const r = await sendEmail({ to: d.email, subject, html });
      row.emailOk = r.ok;
      if (r.ok) { emailSent++; await logDigestSent(d.email, d.amName, d.shown, d.totalAtRisk, "email"); }
    }

    if (slack) {
      const look = await slackLookup(d.email);
      if (!look.id) { row.slackOk = false; row.slackError = look.error || "no_slack_user"; }
      else {
        const { text, blocks } = renderDigestBlocks(d);
        const r = await slackDM(look.id, text, blocks);
        row.slackOk = r.ok; row.slackError = r.error;
        if (r.ok) { dmSent++; await logDigestSent(d.email, d.amName, d.shown, d.totalAtRisk, "slack_dm"); }
      }
    }

    results.push(row);
  }

  // Manager-visible roll-up to a channel.
  let channelPosted: boolean | undefined;
  if (slack && channel && digests.length) {
    const { text, blocks } = renderChannelSummary(digests);
    const r = await slackPost(channel, text, blocks);
    channelPosted = r.ok;
  }

  return NextResponse.json({
    ok: true,
    transports: { email, slackDM: slack, slackChannel: slack && !!channel },
    candidates: digests.length, emailSent, dmSent, channelPosted, results,
  });
}

async function logDigestSent(email: string, amName: string, accounts: number, atRisk: number, via: string) {
  await logActivity(
    { email, name: amName, role: "am", amName },
    { event: "digest_sent", surface: "am_digest", detail: { accounts, atRisk, via } },
  );
}
