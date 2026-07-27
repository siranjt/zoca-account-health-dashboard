import "server-only";
import { appBaseUrl, type AmDigest } from "@/lib/digest";

// ===========================================================================
// Slack Bot transport for the AM digest — DM each AM their at-risk accounts,
// and post a manager-visible roll-up to a channel. Uses a bot token (Web API
// over fetch, no SDK); resolves email → Slack user id via users.lookupByEmail
// so no manual id map is needed. No-ops when SLACK_BOT_TOKEN is unset.
//
// Required bot scopes: chat:write, users:read.email, im:write.
// ===========================================================================

export function slackConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}

async function slackCall(method: string, params: Record<string, unknown>, form = false): Promise<Record<string, any>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "no_token" };
  try {
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8",
      },
      body: form ? new URLSearchParams(params as Record<string, string>).toString() : JSON.stringify(params),
    };
    const r = await fetch(`https://slack.com/api/${method}`, init);
    return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as Record<string, any>;
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

const _idCache = new Map<string, string | null>();
export async function slackUserId(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  if (_idCache.has(key)) return _idCache.get(key)!;
  const res = await slackCall("users.lookupByEmail", { email: key }, true);
  const id = res.ok ? (res.user?.id as string) : null;
  _idCache.set(key, id ?? null);
  return id ?? null;
}

export async function slackDM(userId: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; error?: string }> {
  const open = await slackCall("conversations.open", { users: userId });
  if (!open.ok) return { ok: false, error: `open:${open.error}` };
  const post = await slackCall("chat.postMessage", { channel: open.channel?.id, text, blocks, unfurl_links: false });
  return { ok: !!post.ok, error: post.error };
}

export async function slackPost(channel: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; error?: string }> {
  const post = await slackCall("chat.postMessage", { channel, text, blocks, unfurl_links: false });
  return { ok: !!post.ok, error: post.error };
}

const mEsc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Per-AM detailed digest as Slack Block Kit (each account = section + URL button). */
export function renderDigestBlocks(d: AmDigest): { text: string; blocks: unknown[] } {
  const first = mEsc((d.amName || "there").split(/\s+/)[0]);
  const n = d.accounts.length;
  const cards = d.accounts.flatMap((a) => [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${mEsc(a.name)}*\n${mEsc(a.driver)}\n_${mEsc(a.tierLabel)}${a.mrr != null ? ` · $${a.mrr.toLocaleString()} MRR` : ""}_` },
      accessory: { type: "button", text: { type: "plain_text", text: "Open →", emoji: true }, url: a.link },
    },
    { type: "divider" },
  ]);
  const more = d.totalAtRisk > n
    ? [{ type: "context", elements: [{ type: "mrkdwn", text: `…and ${d.totalAtRisk - n} more on your book. <${appBaseUrl()}/overview|See your full book →>` }] }]
    : [{ type: "context", elements: [{ type: "mrkdwn", text: `<${appBaseUrl()}/overview|See your full book →>` }] }];
  return {
    text: `${n} account${n === 1 ? "" : "s"} on your book need attention`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${n} account${n === 1 ? "" : "s"} need your attention`, emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: `Hi ${first} — your ${n} most at-risk account${n === 1 ? "" : "s"} this week. One tap opens each.` } },
      ...cards,
      ...more,
    ],
  };
}

/** Manager-visible weekly roll-up across all AMs (a summary, not each private list). */
export function renderChannelSummary(digests: AmDigest[]): { text: string; blocks: unknown[] } {
  const rows = digests
    .slice()
    .sort((a, b) => b.totalAtRisk - a.totalAtRisk)
    .map((d) => `• *${mEsc(d.amName)}* — ${d.totalAtRisk} at-risk · top: ${mEsc(d.accounts[0]?.name || "—")}`);
  return {
    text: "Weekly book attention",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Weekly book attention", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: rows.join("\n") || "All books healthy — nothing at risk this week." } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${digests.length} account manager${digests.length === 1 ? "" : "s"} with at-risk accounts · <${appBaseUrl()}/overview|Open the book →>` }] },
    ],
  };
}
