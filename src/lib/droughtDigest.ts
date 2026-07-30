import "server-only";
import { getLeadDroughts } from "@/lib/leadDroughts";
import { listRoster } from "@/lib/access";
import { appBaseUrl, trackedLink } from "@/lib/digest";
import { slackConfigured, slackLookup, slackDM, slackPost } from "@/lib/slack";
import { logActivity } from "@/lib/activity";

// ===========================================================================
// Per-AM lead-drought alert — one cumulated Slack DM per account manager listing
// their accounts with no incoming leads, grouped by the same exclusive bands as
// the admin view (30+ / 14–29 / 7–13 / 3–6 days), worst first. Reuses the weekly
// digest's transport (slack.ts) and AM→email roster join, so it reaches the same
// AM the digest would. Slack-only by request; no-ops when SLACK_BOT_TOKEN unset.
// ===========================================================================

interface BandDef { key: string; label: string; emoji: string; min: number; max: number }
const BANDS: BandDef[] = [
  { key: "b30", label: "30+ days", emoji: "🟥", min: 30, max: Infinity },
  { key: "b14", label: "14–29 days", emoji: "🟧", min: 14, max: 30 },
  { key: "b7", label: "7–13 days", emoji: "🟨", min: 7, max: 14 },
  { key: "b3", label: "3–6 days", emoji: "🟦", min: 3, max: 7 },
];

export interface DroughtAcct {
  name: string; entityId: string; droughtDays: number; lastLead: string | null;
  neverHadLead: boolean; mrr: number | null; masked: boolean; location: string | null; link: string;
}
export interface DroughtBand { key: string; label: string; emoji: string; count: number; accounts: DroughtAcct[] }
export interface AmDroughtDigest { email: string; amName: string; total: number; shown: number; bands: DroughtBand[] }

/** One cumulated digest per AM who has any account dry >= 3 days. Accounts are
 *  ordered worst-first (longest drought, then MRR) and capped at DROUGHT_TOP_N
 *  (default 30) total across bands; each band header still shows its true count. */
export async function buildAmDroughtDigests(cap?: number): Promise<AmDroughtDigest[]> {
  const N = cap && cap > 0 ? cap : Number(process.env.DROUGHT_TOP_N) || 30;
  const roster = listRoster();
  if (!roster.ams.length) return [];
  const rows = await getLeadDroughts();
  const out: AmDroughtDigest[] = [];

  for (const am of roster.ams) {
    const mine = rows
      .filter((r) => r.amName === am.name && r.droughtDays >= 3)
      .sort((a, b) => b.droughtDays - a.droughtDays || (b.mrr ?? 0) - (a.mrr ?? 0));
    if (!mine.length) continue;

    let shown = 0;
    const bands: DroughtBand[] = [];
    for (const b of BANDS) {
      const inBand = mine.filter((r) => r.droughtDays >= b.min && r.droughtDays < b.max);
      if (!inBand.length) continue;
      const accounts: DroughtAcct[] = inBand.slice(0, Math.max(0, N - shown)).map((r) => ({
        name: r.name || "(unnamed)",
        entityId: r.entityId,
        droughtDays: r.droughtDays,
        lastLead: r.lastLead,
        neverHadLead: r.neverHadLead,
        mrr: r.mrr,
        masked: r.leadsMasked,
        location: r.location,
        link: trackedLink(am.email, r.entityId),
      }));
      shown += accounts.length;
      bands.push({ key: b.key, label: b.label, emoji: b.emoji, count: inBand.length, accounts });
    }

    out.push({ email: am.email, amName: am.name, total: mine.length, shown, bands });
  }
  return out;
}

const mEsc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Per-AM drought digest as Slack Block Kit. */
export function renderDroughtBlocks(d: AmDroughtDigest): { text: string; blocks: unknown[] } {
  const first = mEsc((d.amName || "there").split(/\s+/)[0]);
  const acctLine = (a: DroughtAcct) => {
    const dry = a.neverHadLead ? "never received a lead" : `*${a.droughtDays}* days dry`;
    const meta = [a.location, a.mrr != null ? `$${a.mrr.toLocaleString()} MRR` : null, a.masked ? "🔒 leads masked" : null]
      .filter(Boolean).join(" · ");
    return {
      type: "section",
      text: { type: "mrkdwn", text: `*${mEsc(a.name)}*\n${dry}${meta ? ` · ${mEsc(meta)}` : ""}` },
      accessory: { type: "button", text: { type: "plain_text", text: "Open →", emoji: true }, url: a.link },
    };
  };
  const body = d.bands.flatMap((b) => [
    { type: "section", text: { type: "mrkdwn", text: `${b.emoji} *${mEsc(b.label)}*  _(${b.count})_` } },
    ...b.accounts.map(acctLine),
    { type: "divider" },
  ]);
  const truncated = d.total > d.shown ? ` (showing ${d.shown} of ${d.total})` : "";
  return {
    text: `Lead droughts — ${d.total} of your accounts have gone quiet`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Accounts with no incoming leads", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: `Hi ${first} — *${d.total}* of your accounts have had no incoming leads for 3+ days, grouped by how long${truncated}. Worst first:` } },
      ...body,
      { type: "context", elements: [{ type: "mrkdwn", text: `<${appBaseUrl()}/overview|Open your book →>` }] },
    ],
  };
}

/** Manager-visible roll-up: who has the most quiet accounts. */
export function renderDroughtChannelSummary(digests: AmDroughtDigest[]): { text: string; blocks: unknown[] } {
  const rows = digests
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((d) => `• *${mEsc(d.amName)}* — ${d.total} quiet · longest: ${d.bands[0]?.accounts[0]?.droughtDays ?? 0}d (${mEsc(d.bands[0]?.accounts[0]?.name || "—")})`);
  return {
    text: "Lead droughts by AM",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Lead droughts by account manager", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: rows.join("\n") || "No droughts — every account got a lead in the last 3 days." } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${digests.length} account manager${digests.length === 1 ? "" : "s"} with quiet accounts` }] },
    ],
  };
}

export interface DroughtSendResult {
  ok: boolean; configured: boolean; candidates: number; dmSent: number; channelPosted?: boolean;
  results: Array<{ email: string; amName: string; accounts: number; slackOk?: boolean; slackError?: string }>;
}

/** The real per-AM drought send — Slack DM each AM, then the manager roll-up. */
export async function sendAmDroughtDigests(): Promise<DroughtSendResult> {
  const slack = slackConfigured();
  const channel = process.env.DIGEST_SLACK_CHANNEL || null;
  const digests = await buildAmDroughtDigests();
  if (!slack) return { ok: false, configured: false, candidates: digests.length, dmSent: 0, results: [] };

  const results = await Promise.all(digests.map(async (d) => {
    const row = { email: d.email, amName: d.amName, accounts: d.total } as DroughtSendResult["results"][number];
    const look = await slackLookup(d.email);
    if (!look.id) { row.slackOk = false; row.slackError = look.error || "no_slack_user"; return row; }
    const { text, blocks } = renderDroughtBlocks(d);
    const r = await slackDM(look.id, text, blocks);
    row.slackOk = r.ok; row.slackError = r.error;
    if (r.ok) {
      await logActivity(
        { email: d.email, name: d.amName, role: "am", amName: d.amName },
        { event: "drought_digest_sent", surface: "am_drought_digest", detail: { accounts: d.total, shown: d.shown, via: "slack_dm" } },
      );
    }
    return row;
  }));

  let channelPosted: boolean | undefined;
  if (channel && digests.length) {
    const { text, blocks } = renderDroughtChannelSummary(digests);
    const r = await slackPost(channel, text, blocks);
    channelPosted = r.ok;
  }

  return {
    ok: true, configured: true, candidates: digests.length,
    dmSent: results.filter((r) => r.slackOk).length, channelPosted, results,
  };
}
