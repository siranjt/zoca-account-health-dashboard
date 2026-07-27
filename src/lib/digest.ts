import "server-only";
import crypto from "node:crypto";
import { getAccountsPayload } from "@/lib/data";
import { scopeAccounts } from "@/lib/scope";
import { listRoster } from "@/lib/access";
import type { AccountRow } from "@/lib/types";

// ===========================================================================
// AM digest engine. Builds each account manager's "top accounts needing
// attention" from the live book (reusing scopeAccounts), renders it, and hands
// off to a transport (email now; Slack later — the data + render are transport-
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

// The one-line reason this account needs attention — real fields only. Leads with
// the live, actionable signal (currently overdue) and reframes billing so a
// customer-facing nudge stays credible: failedPayments is a LIFETIME failure
// count, so "343 failed payments" is true but reads as a bug — say what to do
// about it instead.
export function attentionDriver(a: AccountRow): string {
  const fp = a.failedPayments || 0;
  const od = a.daysOverdue ?? 0;
  if (od > 0) return `Payment ${od} day${od === 1 ? "" : "s"} overdue`;
  if (fp >= 10) return "Billing failing — card likely needs updating";
  if (fp >= 2) return "Billing risk — repeated failed charges";
  if ((a.profileClicks || 0) === 0 && (a.keywordImpressions || 0) === 0) return "GBP not surfacing — 0 profile clicks & impressions";
  if ((a.reviewsReceived || 0) === 0) return "No reviews collected in window";
  if ((a.keywordsTop3Pct ?? 100) < 5) return "Weak search visibility — under 5% of keywords in top 3";
  if ((a.leadsReceived || 0) <= 2) return "Low lead volume";
  return a.health?.reason || "Below-par engagement";
}

// Worse-first ranking geared to "worth the AM's time THIS WEEK": tier dominates,
// then a live overdue balance, then composite health. The lifetime failed-payment
// count is CAPPED so one billing-broken account can't monopolise the top 3 — that
// billing is failing matters; its raw magnitude (343 vs 6) does not.
function attentionScore(a: AccountRow): number {
  const tier = a.health?.tier === "critical" ? 3 : a.health?.tier === "at_risk" ? 2 : a.health?.tier === "monitor" ? 1 : 0;
  const od = Math.max(0, a.daysOverdue || 0);
  const fpCapped = Math.min(a.failedPayments || 0, 6);
  const comp = a.health?.composite ?? 100;
  return tier * 1_000_000 + (od > 0 ? 200_000 : 0) + fpCapped * 10_000 + Math.min(od, 60) * 1_000 + (100 - comp) * 100;
}

export interface DigestAccount { name: string; entityId: string; tierLabel: string; color: string; driver: string; mrr: number | null; link: string; }
export interface AmDigest { email: string; amName: string; accounts: DigestAccount[]; totalAtRisk: number }

/** Build a digest for every AM on the roster who has at-risk accounts. */
export async function buildAmDigests(topN = 3): Promise<AmDigest[]> {
  const roster = listRoster();
  if (!roster.ams.length) return [];
  const payload = await getAccountsPayload();
  const out: AmDigest[] = [];
  for (const am of roster.ams) {
    const mine = scopeAccounts(payload.accounts, { role: "am", amName: am.name, email: am.email });
    const attention = mine.filter((a) => a.health?.color !== "green").sort((a, b) => attentionScore(b) - attentionScore(a));
    if (!attention.length) continue; // nothing to nudge about — don't send noise
    out.push({
      email: am.email,
      amName: am.name,
      totalAtRisk: attention.length,
      accounts: attention.slice(0, topN).map((a): DigestAccount => ({
        name: a.name,
        entityId: a.entityId,
        tierLabel: a.health?.tierLabel || a.health?.tier || "At risk",
        color: a.health?.color || "red",
        driver: attentionDriver(a),
        mrr: a.mrr ?? null,
        link: trackedLink(am.email, a.entityId),
      })),
    });
  }
  return out;
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const hex = (c: string) => (c === "red" ? "#dc2626" : c === "yellow" ? "#d97706" : "#16a34a");
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Render one AM digest to an email (subject + HTML). Plain, professional — no
 *  in-product theming; this reaches real employees' inboxes. */
export function renderDigestEmail(d: AmDigest): { subject: string; html: string } {
  const first = esc((d.amName || "there").split(/\s+/)[0]);
  const n = d.accounts.length;
  const subject = `${n} account${n === 1 ? "" : "s"} on your book need attention`;

  const cards = d.accounts.map((a) => `
    <tr><td style="padding:0 0 12px 0">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate">
        <tr><td style="padding:14px 16px">
          <div style="font:600 15px ${FONT};color:#0f172a">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hex(a.color)};margin-right:8px"></span>${esc(a.name)}
          </div>
          <div style="font:400 13px ${FONT};color:#475569;margin:7px 0 0">${esc(a.driver)}</div>
          <div style="font:400 12px ${FONT};color:#94a3b8;margin:4px 0 12px">${esc(a.tierLabel)}${a.mrr != null ? ` &middot; $${a.mrr.toLocaleString()} MRR` : ""}</div>
          <a href="${a.link}" style="display:inline-block;font:600 13px ${FONT};background:#0f172a;color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px">Open account &rarr;</a>
        </td></tr>
      </table>
    </td></tr>`).join("");

  const more = d.totalAtRisk > d.accounts.length
    ? `<p style="font:400 13px ${FONT};color:#64748b;margin:4px 0 0">…and ${d.totalAtRisk - d.accounts.length} more account${d.totalAtRisk - d.accounts.length === 1 ? "" : "s"} on your book need a look.</p>`
    : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;padding:24px 0">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" role="presentation" style="width:520px;max-width:92%;background:#ffffff;border-radius:14px;border:1px solid #eef2f7">
      <tr><td style="padding:22px 22px 6px">
        <div style="font:700 12px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:#94a3b8">Account Health Platform</div>
        <h1 style="font:700 20px ${FONT};color:#0f172a;margin:8px 0 2px">Hi ${first} — your book needs attention</h1>
        <p style="font:400 14px ${FONT};color:#64748b;margin:6px 0 16px">The ${n} account${n === 1 ? "" : "s"} most worth your time this week. One tap opens each.</p>
      </td></tr>
      <tr><td style="padding:0 22px 6px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${cards}</table>
        ${more}
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
