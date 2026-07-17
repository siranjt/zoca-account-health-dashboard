import { NextResponse } from "next/server";
import { getAccountsPayload, getAccountDetail } from "@/lib/data";
import type { AccountRow } from "@/lib/types";

// Alfred — the reasoning layer. Reasons over the live account-health data via an
// Anthropic tool-loop. Phase 1: tools = this app's own data (getAccountsPayload /
// getAccountDetail). Deeper Zoca tools (Keeper/Chargebee/HubSpot) come in later phases.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL =
  process.env.ANTHROPIC_ASK_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const ALFRED_SYS =
  "You are Alfred — the razor-sharp butler and analyst for Zoca, a SaaS that runs Google Business Profile, reviews, and lead-gen for local salons/spas/med-spas. You have tools over the live Account Health data. Reason over what the tools return to deliver genuine analysis — not a restatement of numbers. Be concise (2-6 sentences), address the user as \"sir\", and be specific and actionable: name the real lever, the real risk, and the concrete next step an account manager should take. Ground every claim strictly in tool data; if the data doesn't contain the answer, say plainly what's missing rather than guessing. Never invent figures, names, or history. Currency is USD. The health model has a composite score (higher = healthier), a tier (healthy/monitor/at_risk/critical) and per-account reason + recommendedAction — use them. Call tools as needed; call account_health repeatedly to compare accounts, and accounts_by_manager to analyze or compare the accounts of a specific account manager.";

function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function findAccounts(list: AccountRow[], name: string): AccountRow[] {
  const nq = " " + norm(name) + " ";
  const exact = list.filter((a) => nq.includes(" " + norm(a.name) + " "));
  if (exact.length) return exact;
  const q = norm(name);
  return q.length >= 3 ? list.filter((a) => norm(a.name).includes(q)) : [];
}
function slim(a: AccountRow) {
  return {
    name: a.name, accountManager: a.accountManager, city: a.city, state: a.state, mrr: a.mrr,
    health: a.health, leads: a.leadsReceived, reviews: a.reviewsReceived, photos: a.photosUploaded,
    profileClicks: a.profileClicks, websiteClicks: a.websiteClicks, bookOnlineClicks: a.bookOnlineClicks,
    keywordsTop3Pct: a.keywordsTop3Pct, avgCurrentRank: a.avgCurrentRank, keywordImpressions: a.keywordImpressions,
    daysToInvoice: a.daysToInvoice, daysOverdue: a.daysOverdue, failedPayments: a.failedPayments,
    tenureDays: a.tenureDays, activeProducts: a.activeProducts, entityId: a.entityId,
  };
}

const TOOLS = [
  { name: "book_summary", description: "Whole-book health summary: counts by tier (healthy/monitor/at_risk/critical) and totals. No input.", input_schema: { type: "object", properties: {} } },
  { name: "at_risk_accounts", description: "Accounts needing attention, ranked worst composite first. Optional {limit} (default 10) and {tier} filter.", input_schema: { type: "object", properties: { limit: { type: "integer" }, tier: { type: "string" } } } },
  { name: "account_health", description: "Full health + metrics for one account by name (health composite/tier/reason/recommendedAction, leads, reviews, GBP clicks, rankings, payments, tenure, products). Call repeatedly to compare.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "account_detail", description: "Deeper time-series detail for one account by name (trends behind the row).", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "accounts_by_manager", description: "Every account managed by a given account manager (by name). Returns their full roster ranked worst→best by composite, plus complete health detail for the BEST and WORST account. Use for 'compare X's best and worst account', 'how is X's book', or any per-account-manager question.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
];

async function execTool(name: string, input: Record<string, unknown>) {
  try {
    const payload = await getAccountsPayload();
    const list = payload.accounts;
    if (name === "book_summary") {
      const by = (c: string) => list.filter((a) => a.health.color === c).length;
      const tier = (t: string) => list.filter((a) => a.health.tier === t).length;
      return { total: list.length, healthy: by("green"), monitor: by("yellow"), at_risk_or_critical: by("red"), critical: tier("critical"), at_risk: tier("at_risk"), window_days: payload.windowDays, as_of: payload.generatedAt };
    }
    if (name === "at_risk_accounts") {
      const limit = Math.min(Number(input.limit) || 10, 25);
      let rows = list.slice();
      if (input.tier) rows = rows.filter((a) => a.health.tier === input.tier);
      else rows = rows.filter((a) => a.health.color !== "green");
      rows.sort((a, b) => (a.health.composite ?? 999) - (b.health.composite ?? 999));
      return { count: rows.length, top: rows.slice(0, limit).map((a) => ({ name: a.name, am: a.accountManager, composite: a.health.composite, tier: a.health.tier, reason: a.health.reason, recommendedAction: a.health.recommendedAction, daysOverdue: a.daysOverdue, failedPayments: a.failedPayments })) };
    }
    if (name === "account_health") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      return slim(hits[0]);
    }
    if (name === "account_detail") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, entityId: a.entityId })) };
      return await getAccountDetail(hits[0].entityId);
    }
    if (name === "accounts_by_manager") {
      const q = norm(String(input.name || ""));
      if (q.length < 2) return { error: "manager name too short" };
      const nq = " " + q + " ";
      const hits = list.filter((a) => {
        const m = norm(a.accountManager || "");
        return (" " + m + " ").includes(nq) || m.includes(q);
      });
      if (!hits.length) return { error: `no accounts found for manager "${input.name}"` };
      const managers = Array.from(new Set(hits.map((a) => a.accountManager).filter(Boolean)));
      if (managers.length > 1) return { ambiguous_managers: managers.slice(0, 15) };
      const ranked = hits.slice().sort((a, b) => (a.health.composite ?? 999) - (b.health.composite ?? 999));
      return {
        manager: managers[0],
        count: ranked.length,
        roster: ranked.map((a) => ({ name: a.name, composite: a.health.composite, tier: a.health.tier, color: a.health.color, mrr: a.mrr, city: a.city })),
        worst: slim(ranked[0]),
        best: slim(ranked[ranked.length - 1]),
      };
    }
    return { error: "unknown tool " + name };
  } catch (e) {
    return { error: String((e as Error)?.message || e) };
  }
}

async function anthropic(messages: unknown[]) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: [{ type: "text", text: ALFRED_SYS, cache_control: { type: "ephemeral" } }], tools: TOOLS, messages }),
  });
  return r.json();
}

export async function POST(req: Request) {
  let q = "", history: { role: string; text: string }[] = [];
  try { const b = await req.json(); q = String(b.q || "").slice(0, 800).trim(); if (Array.isArray(b.history)) history = b.history; } catch {}
  if (!q) return NextResponse.json({ error: "empty question" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ reply: "My reasoning engine has no API key configured, sir — set ANTHROPIC_API_KEY in the Vercel project." });

  const ctx = history.slice(-6).map((m) => (m.role === "user" ? "User: " : "Alfred: ") + m.text).join("\n");
  const messages: unknown[] = [{ role: "user", content: (ctx ? "Conversation so far:\n" + ctx + "\n\n" : "") + "Question: " + q }];
  try {
    for (let i = 0; i < 6; i++) {
      const resp: any = await anthropic(messages);
      if (!resp || resp.type === "error") return NextResponse.json({ reply: "My reasoning engine erred, sir — " + (resp?.error?.message || "unknown") + "." });
      if (resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: resp.content });
        const results: unknown[] = [];
        for (const blk of resp.content) if (blk.type === "tool_use") { const r = await execTool(blk.name, blk.input || {}); results.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(r).slice(0, 12000) }); }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
      return NextResponse.json({ reply: text || "(no answer, sir)" });
    }
    return NextResponse.json({ reply: "I dug into that but couldn't converge, sir — please narrow the question." });
  } catch (e) {
    return NextResponse.json({ reply: "My reasoning engine is unreachable just now, sir." });
  }
}
