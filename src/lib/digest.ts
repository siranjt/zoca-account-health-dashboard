import "server-only";
import crypto from "node:crypto";
import { getAccountsPayload } from "@/lib/data";
import { scopeAccounts } from "@/lib/scope";
import { listRoster } from "@/lib/access";
import type { AccountRow } from "@/lib/types";

// ===========================================================================
// AM digest engine. Builds each account manager's at-risk book, CATEGORISED by
// primary problem (billing / leads / visibility / reviews / rankings /
// engagement), and hands off to a transport (email/Slack — render is transport-
// agnostic). Links route through a signed /api/digest/click redirect so every
// open from a digest is attributed and logged as adoption evidence.
// ===========================================================================

export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    || "https://zoca-account-health-dashboard.vercel.app";
  return raw.replace(/\/$/, "");
}

function digestSecret(): string {
  return process.env.DIGEST_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "cave-digest-fallback";
}
export function signClick(email: string, entityId: string): string {
  return crypto.createHmac("sha256", digestSecret()).update(`${email.toLowerCase()}:${entityId}`).digest("hex").slice(0, 20);
}
export function verifyClick(email: string, entityId: string, sig: string): boolean {
  const expect = signClick(email, entityId);
  if (!sig || sig.length !== expect.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  } catch {
    return false;
  }
}
export function trackedLink(email: string, entityId: string): string {
  const qs = new URLSearchParams({ am: email.toLowerCase(), e: entityId, s: signClick(email, entityId) });
  return `${appBaseUrl()}/api/digest/click?${qs.toString()}`;
}

// ---- Categorisation ------------------------------------------------------
// Classify an at-risk account by its PRIMARY problem across every dimension —
// so the digest groups the book by what's actually wrong (leads, visibility,
// reviews, rankings…) instead of collapsing everything to "overdue". Priority
// is revenue-first: a billing failure outranks a soft-metric dip.
export const CATEGORIES: Record<string, { label: string; emoji: string; order: number }> = {
  billing: { label: "Billing at risk", emoji: "💳", order: 1 },
  leads: { label: "Lead flow dropping", emoji: "📉", order: 2 },
  visibility: { label: "Not getting found", emoji: "🔍", order: 3 },
  reviews: { label: "Reviews stalled", emoji: "⭐", order: 4 },
  rankings: { label: "Search rank slipping", emoji: "📍", order: 5 },
  engagement: { label: "Needs attention", emoji: "⚠️", order: 6 },
};

export function classify(a: AccountRow): { cat: string; reason: string } {
  const fp = a.failedPayments || 0;
  const od = a.daysOverdue ?? 0;
  if (od > 0) return { cat: "billing", reason: `${od} day${od === 1 ? "" : "s"} overdue` };
  if (fp >= 2) return { cat: "billing", reason: fp >= 10 ? "card likely needs updating" : "repeated failed charges" };
  const ld = a.leadsDelta;
  if (ld && (ld.prev || 0) >= 3 && (ld.cur || 0) < (ld.prev || 0) * 0.5) return { cat: "leads", reason: `leads fell to ${ld.cur} (was ${ld.prev})` };
  const leads = a.leadsReceived || 0;
  if (leads <= 2) return { cat: "leads", reason: leads === 0 ? "no leads this period" : `only ${leads} lead${leads === 1 ? "" : "s"} this period` };
  if (a.gbpVerified === false) return { cat: "visibility", reason: "GBP unverified" };
  if ((a.profileClicks || 0) === 0 && (a.keywordImpressions || 0) === 0) return { cat: "visibility", reason: "0 profile clicks & impressions" };
  if ((a.reviewsReceived || 0) === 0) return { cat: "reviews", reason: "no new reviews this period" };
  if ((a.keywordsTop3Pct ?? 100) < 5) return { cat: "rankings", reason: `${a.keywordsTop3Pct ?? 0}% of keywords in top 3` };
  return { cat: "engagement", reason: a.health?.reason || "below-par engagement" };
}

// Worse-first ranking used WITHIN a category (tier, live overdue, capped
// failures, composite). Lifetime failure count is capped so one billing-broken
// account can't dominate — its presence matters, its raw magnitude does not.
function attentionScore(a: AccountRow): number {
  const tier = a.health?.tier === "critical" ? 3 : a.health?.tier === "at_risk" ? 2 : a.health?.tier === "monitor" ? 1 : 0;
  const od = Math.max(0, a.daysOverdue || 0);
  const fpCapped = Math.min(a.failedPayments || 0, 6);
  const comp = a.health?.composite ?? 100;
  return tier * 1_000_000 + (od > 0 ? 200_000 : 0) + fpCapped * 10_000 + Math.min(od, 60) * 1_000 + (100 - comp) * 100;
}

export interface DigestAccount { name: string; entityId: string; reason: string; mrr: number | null; link: string }
export interface DigestGroup { key: string; label: string; emoji: string; count: number; accounts: DigestAccount[] }
export interface AmDigest { email: string; amName: string; totalAtRisk: number; shown: number; groups: DigestGroup[] }

/** Build a categorised digest for every AM on the roster who has at-risk
 *  accounts. Shows up to DIGEST_TOP_N accounts total (default 10), distributed
 *  ROUND-ROBIN across problem categories so every problem type on the book is
 *  represented — not just the biggest one. Each group also carries its full
 *  count so the AM sees the true scale even when only a few are listed. */
export async function buildAmDigests(topN?: number): Promise<AmDigest[]> {
  const N = topN && topN > 0 ? topN : Number(process.env.DIGEST_TOP_N) || 10;
  const roster = listRoster();
  if (!roster.ams.length) return [];
  const payload = await getAccountsPayload();
  const out: AmDigest[] = [];

  for (const am of roster.ams) {
    const mine = scopeAccounts(payload.accounts, { role: "am", amName: am.name, email: am.email, name: am.name });
    const attention = mine.filter((a) => a.health?.color !== "green");
    if (!attention.length) continue; // nothing to nudge about — don't send noise

    // bucket by primary problem, worst-first within each bucket
    const buckets = new Map<string, { a: AccountRow; reason: string }[]>();
    for (const a of attention) {
      const { cat, reason } = classify(a);
      (buckets.get(cat) ?? buckets.set(cat, []).get(cat)!).push({ a, reason });
    }
    for (const items of buckets.values()) items.sort((p, q) => attentionScore(q.a) - attentionScore(p.a));

    // round-robin across present categories (priority order) → guarantees every
    // problem type shows before any single one takes a second slot, capped at N.
    const present = Object.keys(CATEGORIES).filter((k) => buckets.has(k)).sort((x, y) => CATEGORIES[x].order - CATEGORIES[y].order);
    const picked = new Map<string, { a: AccountRow; reason: string }[]>();
    let shown = 0, round = 0, added = true;
    while (shown < N && added) {
      added = false;
      for (const k of present) {
        const item = buckets.get(k)![round];
        if (!item) continue;
        (picked.get(k) ?? picked.set(k, []).get(k)!).push(item);
        shown++; added = true;
        if (shown >= N) break;
      }
      round++;
    }

    const groups: DigestGroup[] = present
      .filter((k) => picked.has(k))
      .map((k) => ({
        key: k, label: CATEGORIES[k].label, emoji: CATEGORIES[k].emoji, count: buckets.get(k)!.length,
        accounts: picked.get(k)!.map(({ a, reason }): DigestAccount => ({
          name: a.name, entityId: a.entityId, reason, mrr: a.mrr ?? null, link: trackedLink(am.email, a.entityId),
        })),
      }));

    out.push({ email: am.email, amName: am.name, totalAtRisk: attention.length, shown, groups });
  }
  return out;
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Render one AM digest to an email (subject + HTML), grouped by category.
 *  Plain, professional — no in-product theming; this reaches real inboxes. */
export function renderDigestEmail(d: AmDigest): { subject: string; html: string } {
  const first = esc((d.amName || "there").split(/\s+/)[0]);
  const subject = `Your book — ${d.totalAtRisk} account${d.totalAtRisk === 1 ? "" : "s"} need attention`;

  const groupsHtml = d.groups.map((g) => `
    <tr><td style="padding:16px 0 6px">
      <div style="font:700 12px ${FONT};letter-spacing:.04em;color:#0f172a">${g.emoji} ${esc(g.label)} <span style="color:#94a3b8">(${g.count})</span></div>
    </td></tr>
    ${g.accounts.map((a) => `
    <tr><td style="padding:0 0 8px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate">
        <tr><td style="padding:12px 14px">
          <div style="font:600 14px ${FONT};color:#0f172a">${esc(a.name)}</div>
          <div style="font:400 13px ${FONT};color:#475569;margin:5px 0 11px">${esc(a.reason)}${a.mrr != null ? ` &middot; $${a.mrr.toLocaleString()} MRR` : ""}</div>
          <a href="${a.link}" style="display:inline-block;font:600 13px ${FONT};background:#0f172a;color:#ffffff;text-decoration:none;padding:8px 15px;border-radius:8px">Open account &rarr;</a>
        </td></tr>
      </table>
    </td></tr>`).join("")}`).join("");

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;padding:24px 0">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" role="presentation" style="width:540px;max-width:92%;background:#ffffff;border-radius:14px;border:1px solid #eef2f7">
      <tr><td style="padding:22px 22px 4px">
        <div style="font:700 12px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:#94a3b8">Account Health Platform</div>
        <h1 style="font:700 20px ${FONT};color:#0f172a;margin:8px 0 2px">Hi ${first} — your book needs attention</h1>
        <p style="font:400 14px ${FONT};color:#64748b;margin:6px 0 4px">${d.totalAtRisk} account${d.totalAtRisk === 1 ? "" : "s"} at risk, grouped by what's wrong. Your top ${d.shown} to act on:</p>
      </td></tr>
      <tr><td style="padding:0 22px 6px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${groupsHtml}</table>
      </td></tr>
      <tr><td style="padding:14px 22px 22px">
        <a href="${appBaseUrl()}/overview" style="font:600 13px ${FONT};color:#0f172a;text-decoration:none">See your full book &rarr;</a>
        <p style="font:400 11px ${FONT};color:#b6c0cc;margin:16px 0 0">You're receiving this because you manage accounts in the Account Health Platform.</p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;

  return { subject, html };
}
