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
export async function slackLookup(email: string): Promise<{ ok: boolean; id: string | null; error?: string }> {
  const res = await slackCall("users.lookupByEmail", { email: email.toLowerCase() }, true);
  return { ok: !!res.ok, id: res.ok ? (res.user?.id as string) : null, error: res.error as string | undefined };
}
export async function slackUserId(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  if (_idCache.has(key)) return _idCache.get(key)!;
  const { id } = await slackLookup(key);
  _idCache.set(key, id ?? null);
  return id ?? null;
}
// Token/identity check — confirms the bot token is valid and which workspace it's
// in (distinguishes a bad/missing-scope token from a genuinely-absent user).
export async function slackAuthTest(): Promise<Record<string, unknown>> {
  const r = await slackCall("auth.test", {});
  return { ok: !!r.ok, error: r.error, team: r.team, url: r.url, botId: r.bot_id, user: r.user };
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

/** Per-AM digest as Slack Block Kit, grouped by problem category (each category
 *  = a header line + its accounts as section + URL button). */
export function renderDigestBlocks(d: AmDigest): { text: string; blocks: unknown[] } {
  const first = mEsc((d.amName || "there").split(/\s+/)[0]);
  const body = d.groups.flatMap((g) => [
    { type: "section", text: { type: "mrkdwn", text: `${g.emoji} *${mEsc(g.label)}*  _(${g.count})_` } },
    ...g.accounts.map((a) => ({
      type: "section",
      text: { type: "mrkdwn", text: `*${mEsc(a.name)}*\n${mEsc(a.reason)}${a.mrr != null ? ` · $${a.mrr.toLocaleString()} MRR` : ""}` },
      accessory: { type: "button", text: { type: "plain_text", text: "Open →", emoji: true }, url: a.link },
    })),
    { type: "divider" },
  ]);
  return {
    text: `Your book — ${d.totalAtRisk} account${d.totalAtRisk === 1 ? "" : "s"} need attention`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Your book needs attention", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: `Hi ${first} — *${d.totalAtRisk}* at-risk, grouped by what's wrong. Your top ${d.shown} to act on:` } },
      ...body,
      { type: "context", elements: [{ type: "mrkdwn", text: `<${appBaseUrl()}/overview|See your full book →>` }] },
    ],
  };
}

/** Manager-visible weekly roll-up across all AMs (a summary, not each private list). */
export function renderChannelSummary(digests: AmDigest[]): { text: string; blocks: unknown[] } {
  const rows = digests
    .slice()
    .sort((a, b) => b.totalAtRisk - a.totalAtRisk)
    .map((d) => `• *${mEsc(d.amName)}* — ${d.totalAtRisk} at-risk · top: ${mEsc(d.groups[0]?.accounts[0]?.name || "—")}`);
  return {
    text: "Weekly book attention",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Weekly book attention", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: rows.join("\n") || "All books healthy — nothing at risk this week." } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${digests.length} account manager${digests.length === 1 ? "" : "s"} with at-risk accounts · <${appBaseUrl()}/overview|Open the book →>` }] },
    ],
  };
}
