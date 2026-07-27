import "server-only";
import { buildAmDigests, renderDigestEmail } from "@/lib/digest";
import { sendEmail, mailerConfigured } from "@/lib/mailer";
import { slackConfigured, slackLookup, slackDM, slackPost, renderDigestBlocks, renderChannelSummary } from "@/lib/slack";
import { logActivity } from "@/lib/activity";

// The real AM-digest send, shared by the scheduled cron and the admin "Send now"
// button. Fans the per-AM sends out in parallel (a sequential loop timed out on
// the first cron run), then posts the manager roll-up.

async function logDigestSent(email: string, amName: string, accounts: number, atRisk: number, via: string) {
  await logActivity(
    { email, name: amName, role: "am", amName },
    { event: "digest_sent", surface: "am_digest", detail: { accounts, atRisk, via } },
  );
}

export interface DigestSendResult {
  ok: boolean;
  transports: { email: boolean; slackDM: boolean; slackChannel: boolean };
  candidates: number;
  emailSent: number;
  dmSent: number;
  channelPosted?: boolean;
  results: Array<{ email: string; emailOk?: boolean; slackOk?: boolean; slackError?: string; accounts: number }>;
}

export async function sendAmDigests(): Promise<DigestSendResult> {
  const email = mailerConfigured();
  const slack = slackConfigured();
  const channel = process.env.DIGEST_SLACK_CHANNEL || null;
  const digests = await buildAmDigests();

  type Row = { email: string; emailOk?: boolean; slackOk?: boolean; slackError?: string; accounts: number };
  const results: Row[] = await Promise.all(digests.map(async (d): Promise<Row> => {
    const row: Row = { email: d.email, accounts: d.shown };
    if (email) {
      const { subject, html } = renderDigestEmail(d);
      const r = await sendEmail({ to: d.email, subject, html });
      row.emailOk = r.ok;
      if (r.ok) await logDigestSent(d.email, d.amName, d.shown, d.totalAtRisk, "email");
    }
    if (slack) {
      const look = await slackLookup(d.email);
      if (!look.id) { row.slackOk = false; row.slackError = look.error || "no_slack_user"; }
      else {
        const { text, blocks } = renderDigestBlocks(d);
        const r = await slackDM(look.id, text, blocks);
        row.slackOk = r.ok; row.slackError = r.error;
        if (r.ok) await logDigestSent(d.email, d.amName, d.shown, d.totalAtRisk, "slack_dm");
      }
    }
    return row;
  }));

  let channelPosted: boolean | undefined;
  if (slack && channel && digests.length) {
    const { text, blocks } = renderChannelSummary(digests);
    const r = await slackPost(channel, text, blocks);
    channelPosted = r.ok;
  }

  return {
    ok: true,
    transports: { email, slackDM: slack, slackChannel: slack && !!channel },
    candidates: digests.length,
    emailSent: results.filter((r) => r.emailOk).length,
    dmSent: results.filter((r) => r.slackOk).length,
    channelPosted,
    results,
  };
}
