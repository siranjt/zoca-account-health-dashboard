import { NextResponse } from "next/server";
import { getAccountsPayload, getAccountDetail } from "@/lib/data";
import { getBillingByEntityId } from "@/lib/chargebee";
import { getFactsByEntityId } from "@/lib/keeper";
import { HEALTH_WEIGHTS } from "@/lib/health";
import type { AccountRow, AccountsPayload } from "@/lib/types";

// Alfred — the reasoning layer over the live Account Health data (Anthropic
// tool-loop). BATCH 1 (engine): deterministic aggregation, root-cause driver,
// health-model explainer, per-request book memoization, parallel tool calls
// with timeouts, compressed/rounded tool payloads, N-of-M truncation flags,
// as-of citations, and a plan→act→self-correct reasoning prompt. Deeper Zoca
// data tools (Keeper/Chargebee/HubSpot) come in later batches.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_ASK_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_ITERS = 5;
const TOOL_TIMEOUT_MS = 25000; // billing's first call pages the Chargebee subscription map

const ALFRED_SYS =
  `You are Alfred — the razor-sharp butler and account-health analyst for Zoca, a SaaS that runs Google Business Profile, reviews, and lead-gen for local salons/spas/med-spas. You reason over the live Account Health data through tools.

REASONING
- Deliver genuine analysis, not a restatement of numbers: name the real lever, the real risk, and the concrete next step an account manager should take.
- For anything non-trivial, briefly decide which tools you need, then call them; break a compound question into parts and answer each part.
- Judge figures against a baseline where you can (cohort, tier, book context). Trace a low score to its root driver (use the primary_driver the tools return) instead of just listing symptoms.
- When it matters, state the single assumption or data dependency that would change your answer.

ACCURACY (non-negotiable)
- Ground every figure strictly in tool results. NEVER invent numbers, account names, account-manager names, or history. If something isn't in the data, say so plainly.
- Deterministic math is done by the tools (book_aggregate, the ranked lists) — trust those totals; never recompute or estimate figures yourself.
- If data is missing or thin, answer what you can and name what's missing — a partial answer beats a refusal. Flag any low-confidence conclusion.
- Currency is USD. Respect the metrics window a tool reports and never mix windows. Cite recency as "as of DD/MM/YY" using the as_of the tools return.
- If a name matches several accounts or managers, the tool returns an 'ambiguous' list — ask which one before analysing.

STYLE
- Address the user as "sir". Be concise and scale depth to the question: a lookup earns a sentence, an analysis earns a tight brief.
- Lead with the claim, then the specific figures that support it.
- Dates as DD/MM/YY, money in USD; when listing invoices or items, newest first.

TOOLS
- book_summary — whole-book tier counts. at_risk_accounts — worst-first list with root drivers. account_health — one account's full metrics. account_detail — time-series behind a row. accounts_by_manager — an account manager's roster plus best/worst. book_aggregate — deterministic roll-ups (totals and group-bys: use it for 'total MRR at risk', 'reviews by AM', counts). explain_health — how an account's composite score is built. billing — LIVE Chargebee billing (subscription MRR/status, auto-collection, next renewal, unpaid invoices, failed transactions). Chargebee is ground truth for payments and revenue; prefer it over the health row's failedPayments proxy when a question is about money, renewals, or payment failures. customer_facts — curated history/notes about an account from the Keeper (Bat Cave Memory); use it for background and context on a customer.
- Call tools as needed; you may call several at once. If a tool errors or returns nothing, adjust the arguments and retry once before concluding.`;

// ---- small utils: compression keeps tool payloads (and tokens) tight ----
function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
const r0 = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.round(n) : n);
const r1 = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : n);
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in o) { const v = o[k]; if (v !== null && v !== undefined && v !== "") out[k] = v; }
  return out as Partial<T>;
}
function ddmmyy(d: string | undefined) {
  if (!d) return undefined;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${String(dt.getFullYear()).slice(2)}`;
}

// Root-cause driver — strictly derived from real fields (never invented).
function primaryDriver(a: AccountRow): string | null {
  if (a.health?.tier === "healthy") return null;
  const fp = a.failedPayments || 0;
  if (fp >= 2) return `Billing risk — ${fp} failed payments`;
  if ((a.profileClicks || 0) === 0 && (a.keywordImpressions || 0) === 0)
    return "GBP not surfacing — 0 profile clicks & impressions (likely unverified)";
  if ((a.reviewsReceived || 0) === 0) return "No reviews collected";
  if ((a.keywordsTop3Pct || 0) < 5) return "Weak search visibility — under 5% of keywords in top 3";
  if ((a.leadsReceived || 0) <= 2) return "Low lead volume";
  return "Below-par engagement";
}

function findAccounts(list: AccountRow[], name: string): AccountRow[] {
  const nq = " " + norm(name) + " ";
  const exact = list.filter((a) => nq.includes(" " + norm(a.name) + " "));
  if (exact.length) return exact;
  const q = norm(name);
  return q.length >= 3 ? list.filter((a) => norm(a.name).includes(q)) : [];
}

function slim(a: AccountRow) {
  return compact({
    name: a.name, accountManager: a.accountManager || "Unassigned", city: a.city, state: a.state,
    mrr: r0(a.mrr),
    composite: r1(a.health?.composite), tier: a.health?.tier, color: a.health?.color,
    engagement: r1(a.health?.engagement), value: r1(a.health?.value), product: r1(a.health?.product),
    reason: a.health?.reason, recommendedAction: a.health?.recommendedAction,
    primary_driver: primaryDriver(a),
    leads: a.leadsReceived, reviews: a.reviewsReceived, photos: a.photosUploaded,
    profileClicks: a.profileClicks, websiteClicks: a.websiteClicks, bookOnlineClicks: a.bookOnlineClicks,
    bookOnlineActive: a.bookOnlineActive,
    keywordsTop3Pct: r1(a.keywordsTop3Pct), avgRank: r1(a.avgCurrentRank), keywordImpressions: a.keywordImpressions,
    daysToInvoice: a.daysToInvoice, daysOverdue: a.daysOverdue, failedPayments: a.failedPayments,
    tenureDays: a.tenureDays, activeProducts: a.activeProducts, entityId: a.entityId,
  });
}

const TOOLS = [
  { name: "book_summary", description: "Whole-book health summary: counts by tier (healthy/monitor/at_risk/critical) and totals. No input.", input_schema: { type: "object", properties: {} } },
  { name: "at_risk_accounts", description: "Accounts needing attention, ranked worst composite first, each with its root-cause driver. Optional {limit} (default 10) and {tier} filter.", input_schema: { type: "object", properties: { limit: { type: "integer" }, tier: { type: "string" } } } },
  { name: "account_health", description: "Full health + metrics for one account by name (composite/tier/sub-scores/reason/recommendedAction/driver, leads, reviews, GBP clicks, rankings, payments, tenure, products). Call repeatedly to compare.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "account_detail", description: "Deeper time-series detail for one account by name (trends behind the row).", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "accounts_by_manager", description: "Every account managed by a given account manager (by name). Returns their full roster ranked worst→best by composite, plus complete health detail for the BEST and WORST account. Use for 'compare X's best and worst account', 'how is X's book', or any per-account-manager question.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "book_aggregate", description: "Deterministic roll-ups over the whole book — numbers computed in code, never estimated. groupBy: tier | color | accountManager | state | none. metric: count | mrr | leads | reviews. Optional filterTier / filterColor. Use for 'total MRR at risk', 'reviews collected by AM', 'how many critical accounts', 'MRR by state', etc.", input_schema: { type: "object", properties: { groupBy: { type: "string" }, metric: { type: "string" }, filterTier: { type: "string" }, filterColor: { type: "string" } } } },
  { name: "explain_health", description: "Explain how one account's composite health score is built: the sub-scores (engagement/value/product), the exact weighting, the driving reason, the primary risk driver, and the recommended action.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "billing", description: "Live billing state for one account from Chargebee (ground truth, beats the health-score payment proxy): subscription status & MRR, auto-collection, next renewal, unpaid invoices + total due, recent failed transactions with the error. Use for 'are they paid up?', 'any failed payments?', 'when do they renew?', 'what's their MRR?'.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "customer_facts", description: "Curated facts and history for one account from the Keeper (Bat Cave Memory) — owner details, preferences, past issues, notes captured over time. Use for 'what do we know about them?', 'any history / context?', 'who's the owner?', background before a call.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }, cache_control: { type: "ephemeral" } },
];

type Ctx = { list: AccountRow[]; payload: AccountsPayload; asOf: string | undefined };

async function execTool(name: string, input: Record<string, unknown>, ctx: Ctx) {
  try {
    const { list, payload, asOf } = ctx;
    if (name === "book_summary") {
      const by = (c: string) => list.filter((a) => a.health?.color === c).length;
      const tier = (t: string) => list.filter((a) => a.health?.tier === t).length;
      return { total: list.length, healthy: by("green"), monitor: by("yellow"), at_risk_or_critical: by("red"), critical: tier("critical"), at_risk: tier("at_risk"), window_days: payload.windowDays, as_of: asOf };
    }
    if (name === "at_risk_accounts") {
      const limit = Math.min(Number(input.limit) || 10, 25);
      let rows = list.slice();
      if (input.tier) rows = rows.filter((a) => a.health?.tier === input.tier);
      else rows = rows.filter((a) => a.health?.color !== "green");
      rows.sort((a, b) => (a.health?.composite ?? 999) - (b.health?.composite ?? 999));
      return {
        showing: Math.min(rows.length, limit), of: rows.length, window_days: payload.windowDays, as_of: asOf,
        top: rows.slice(0, limit).map((a) => compact({ name: a.name, am: a.accountManager || "Unassigned", composite: r1(a.health?.composite), tier: a.health?.tier, primary_driver: primaryDriver(a), reason: a.health?.reason, recommendedAction: a.health?.recommendedAction, daysOverdue: a.daysOverdue, failedPayments: a.failedPayments })),
      };
    }
    if (name === "account_health") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      return { ...slim(hits[0]), as_of: asOf };
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
      const hits = list.filter((a) => { const m = norm(a.accountManager || ""); return (" " + m + " ").includes(nq) || m.includes(q); });
      if (!hits.length) return { error: `no accounts found for manager "${input.name}"` };
      const managers = Array.from(new Set(hits.map((a) => a.accountManager).filter(Boolean)));
      if (managers.length > 1) return { ambiguous_managers: managers.slice(0, 15) };
      const ranked = hits.slice().sort((a, b) => (a.health?.composite ?? 999) - (b.health?.composite ?? 999));
      const bookMrr = ranked.reduce((s, a) => s + (a.mrr || 0), 0);
      return {
        manager: managers[0], count: ranked.length, book_mrr: r0(bookMrr), as_of: asOf,
        roster: ranked.map((a) => compact({ name: a.name, composite: r1(a.health?.composite), tier: a.health?.tier, color: a.health?.color, mrr: r0(a.mrr), city: a.city, primary_driver: primaryDriver(a) })),
        worst: { ...slim(ranked[0]) }, best: { ...slim(ranked[ranked.length - 1]) },
      };
    }
    if (name === "book_aggregate") {
      let rows = list.slice();
      if (input.filterTier) rows = rows.filter((a) => a.health?.tier === input.filterTier);
      if (input.filterColor) rows = rows.filter((a) => a.health?.color === input.filterColor);
      const metric = String(input.metric || "count");
      const val = (a: AccountRow) => metric === "mrr" ? (a.mrr || 0) : metric === "leads" ? (a.leadsReceived || 0) : metric === "reviews" ? (a.reviewsReceived || 0) : 1;
      const gb = String(input.groupBy || "none");
      const keyOf = (a: AccountRow) => gb === "tier" ? (a.health?.tier || "—") : gb === "color" ? (a.health?.color || "—") : gb === "accountManager" ? (a.accountManager || "Unassigned") : gb === "state" ? (a.state || "—") : "all";
      const filter = compact({ tier: input.filterTier as string, color: input.filterColor as string });
      if (gb === "none") {
        let s = 0; for (const a of rows) s += val(a);
        return { metric, filter, accounts: rows.length, total: r0(s), as_of: asOf };
      }
      const groups: Record<string, { count: number; sum: number }> = {};
      for (const a of rows) { const k = keyOf(a); (groups[k] ||= { count: 0, sum: 0 }); groups[k].count++; groups[k].sum += val(a); }
      const out = Object.entries(groups).map(([group, v]) => ({ group, count: v.count, [metric]: r0(v.sum) }))
        .sort((a, b) => (b[metric] as number) - (a[metric] as number) || b.count - a.count);
      return { groupBy: gb, metric, filter, groups: out.slice(0, 40), groupCount: out.length, as_of: asOf };
    }
    if (name === "explain_health") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const a = hits[0]; const h = a.health || {};
      const w = HEALTH_WEIGHTS;
      return compact({
        name: a.name, composite: r1(h.composite), tier: h.tier, color: h.color,
        formula: `composite = ${w.engagement}·engagement + ${w.value}·value + ${w.product}·product`,
        subscores: { engagement: r1(h.engagement), value: r1(h.value), product: r1(h.product) },
        weighted_contribution: { engagement: r1((h.engagement || 0) * w.engagement), value: r1((h.value || 0) * w.value), product: r1((h.product || 0) * w.product) },
        reason: h.reason, primary_driver: primaryDriver(a), recommendedAction: h.recommendedAction, as_of: asOf,
      });
    }
    if (name === "billing") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const bill = await getBillingByEntityId(hits[0].entityId);
      return { account: hits[0].name, ...bill, as_of: asOf };
    }
    if (name === "customer_facts") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const facts = await getFactsByEntityId(hits[0].entityId);
      return { account: hits[0].name, ...facts };
    }
    return { error: "unknown tool " + name };
  } catch (e) {
    return { error: String((e as Error)?.message || e) };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(onTimeout), ms))]);
}

async function anthropic(messages: unknown[]) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: [{ type: "text", text: ALFRED_SYS, cache_control: { type: "ephemeral" } }], tools: TOOLS, messages }),
  });
  return r.json();
}

export async function POST(req: Request) {
  let q = "", history: { role: string; text: string }[] = [];
  try { const b = await req.json(); q = String(b.q || "").slice(0, 800).trim(); if (Array.isArray(b.history)) history = b.history; } catch {}
  if (!q) return NextResponse.json({ error: "empty question" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ reply: "My reasoning engine has no API key configured, sir — set ANTHROPIC_API_KEY in the Vercel project." });

  // Fetch the book ONCE per request; every tool call reuses this snapshot.
  let ctx: Ctx;
  try {
    const payload = await getAccountsPayload();
    ctx = { list: payload.accounts, payload, asOf: ddmmyy(payload.generatedAt) };
  } catch (e) {
    return NextResponse.json({ reply: "I couldn't reach the account data just now, sir — please try again in a moment." });
  }

  const recent = history.slice(-6).map((m) => (m.role === "user" ? "User: " : "Alfred: ") + m.text).join("\n");
  const messages: unknown[] = [{ role: "user", content: (recent ? "Conversation so far:\n" + recent + "\n\n" : "") + "Question: " + q }];
  try {
    for (let i = 0; i < MAX_ITERS; i++) {
      const resp: any = await anthropic(messages);
      if (!resp || resp.type === "error") return NextResponse.json({ reply: "My reasoning engine erred, sir — " + (resp?.error?.message || "unknown") + "." });
      if (resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: resp.content });
        const blocks = (resp.content || []).filter((b: any) => b.type === "tool_use");
        // Run all tool calls for this turn in parallel, each with a timeout.
        const results = await Promise.all(blocks.map(async (blk: any) => {
          const r = await withTimeout(execTool(blk.name, blk.input || {}, ctx), TOOL_TIMEOUT_MS, { error: "tool timed out" });
          return { type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(r).slice(0, 12000) };
        }));
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
