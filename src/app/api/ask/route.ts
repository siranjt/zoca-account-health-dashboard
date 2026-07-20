import { NextResponse } from "next/server";
import { getAccountsPayload, getAccountDetail } from "@/lib/data";
import { getBillingByEntityId } from "@/lib/chargebee";
import { getFactsByEntityId } from "@/lib/keeper";
import { getReviewsDetail } from "@/lib/insights";
import { getAccountTickets, getManagerTickets } from "@/lib/tickets";
import { logInteraction, recall, rememberFact, getSavedNotes, getUsageStats, setFocus, clearFocus, getFocus } from "@/lib/memory";
import { HEALTH_WEIGHTS } from "@/lib/health";
import type { AccountRow, AccountsPayload } from "@/lib/types";

// Alfred — the reasoning layer over the live Account Health data (Anthropic
// tool-loop). BATCH 1 (engine): deterministic aggregation, root-cause driver,
// health-model explainer, per-request book memoization, parallel tool calls
// with timeouts, compressed/rounded tool payloads, N-of-M truncation flags,
// as-of citations, and a plan→act→self-correct reasoning prompt. Deeper Zoca
// data tools (Keeper/Chargebee/HubSpot) come in later batches.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // headroom so the time-budget can always force a final answer before the platform kills us

const MODEL = process.env.ANTHROPIC_ASK_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_ITERS = 8;               // room for genuine multi-step reasoning...
const MAX_TOOLS_PER_TURN = 8;      // ...but never N per-account calls in one turn
const TOOL_TIMEOUT_MS = 15000;     // a single slow tool can't stall the turn
const MODEL_TIMEOUT_MS = 45000;    // a single stuck model call can't hang the request
const ANSWER_BUDGET_MS = 40000;    // past this, stop tooling and FORCE a final synthesized answer

const ALFRED_SYS =
  `You are Alfred — the razor-sharp butler and account-health analyst for Zoca, a SaaS that runs Google Business Profile, reviews, and lead-gen for local salons/spas/med-spas. You reason over the live Account Health data through tools.

DRIVE-THE-UI (navigation)
- When the user asks you to OPEN/GO TO/SHOW an account, or to FILTER/SHOW a slice of the book, you may drive the dashboard. After your normal short answer, append ONE final line, exactly: ACTION: {json}
- To open one account: ACTION: {"type":"open","name":"<exact business name>"}
- To filter the overview: ACTION: {"type":"overview","am":"<AM name>","color":"red|yellow|green","q":"<search text>"} — include only the keys that apply; omit the rest.
- Only emit ACTION when the user clearly wants to navigate or filter (verbs like open, go to, show me, take me to, filter to, pull up). Never emit it for pure analysis questions. Keep your prose answer brief when you emit an action. Emit at most one ACTION line, always last.

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
- Answer the question directly. Do NOT narrate which tools you called. NEVER remark that "both names/queries resolve to the same account", that a name "looks like two accounts", or anything about duplicates — many account names contain "and" or several words (e.g. "Glow Esthetics Skincare and Wellness By Dhin" is ONE account); treat the full name as a single account and just answer.
- Lead with the claim, then the specific figures that support it.
- Dates as DD/MM/YY, money in USD; when listing invoices or items, newest first.

TOOLS
- book_summary — whole-book tier counts. at_risk_accounts — worst-first list with root drivers. account_health — one account's full metrics. account_detail — time-series behind a row. accounts_by_manager — an account manager's roster plus best/worst. book_aggregate — deterministic roll-ups (totals and group-bys: use it for 'total MRR at risk', 'reviews by AM', counts). explain_health — how an account's composite score is built. billing — LIVE Chargebee billing (subscription MRR/status, auto-collection, next renewal, unpaid invoices, failed transactions). Chargebee is ground truth for payments and revenue; prefer it over the health row's failedPayments proxy when a question is about money, renewals, or payment failures. customer_facts — curated history/notes about an account from the Keeper (Bat Cave Memory); use it for background and context on a customer. support_tickets — Linear tickets (churn/retention/subscription) for an account, active + closed-in-window by classification. reviews_detail — Google review count, average rating, distribution, velocity (last 30/90 days) and recent reviews. cohort_benchmark — one account vs its peer cohort (percentiles + medians). segment_analysis — health/metrics by segment (state/tier/product/AM). movers — biggest gainers/decliners period-over-period. expansion_radar — healthy single-product accounts ripe for upsell. revenue_at_risk — MRR at risk, ranked by revenue exposure. gather_360 — one-shot full dossier (health + billing + tickets + reviews + Keeper history) for briefings and drafts. recall — search your own durable memory of past conversations (across sessions). remember — save a fact the user asks you to keep. usage_stats — analytics over your own history (most-asked accounts/tools). pin_focus — pin an account as the session subject so follow-ups need no re-naming.
- Call tools as needed; you may call several at once. If a tool errors or returns nothing, adjust the arguments and retry once before concluding.
- For a question about a WHOLE account-manager's book or a segment (e.g. "tickets for X's customers", "MRR across X's book"), use ONE aggregate tool — manager_tickets, accounts_by_manager, book_aggregate, or segment_analysis. NEVER call a per-account tool (support_tickets, billing, account_health) once per account across a whole book — that is too slow and will fail. If the needed aggregate doesn't exist, say so plainly instead of looping.
- You have a DURABLE MEMORY: when the user refers to something discussed earlier or in a previous session ("what did we say about…", "last week", "have we looked at…"), use recall before answering. When the user explicitly tells you to remember / note / keep a fact, use the remember tool (tie it to the account when there is one) and confirm what you saved — your saved notes resurface automatically in account_facts and the 360 dossier. Only save on an explicit request, and never delete.

DRAFTS — you draft, a human sends
- On request you can DRAFT outward artifacts: an account-manager outreach message, a QBR / health brief, a churn-save playbook, or an escalation note. Pull real context first (gather_360 gives the full picture), address the real account and account manager, and be specific and grounded — no invented details.
- Always label it clearly as a draft. You NEVER send, email, post, create, schedule, or modify anything — you produce text for a human to review and send. If asked to actually send or create something, say you can only prepare the draft, sir.`;

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

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const COHORT_METRICS: Array<{ k: string; get: (a: AccountRow) => number | null | undefined; hib: boolean }> = [
  { k: "composite", get: (a) => a.health?.composite, hib: true },
  { k: "leads", get: (a) => a.leadsReceived, hib: true },
  { k: "reviews", get: (a) => a.reviewsReceived, hib: true },
  { k: "profileClicks", get: (a) => a.profileClicks, hib: true },
  { k: "keywordsTop3Pct", get: (a) => a.keywordsTop3Pct, hib: true },
  { k: "avgRank", get: (a) => a.avgCurrentRank, hib: false },
  { k: "mrr", get: (a) => a.mrr, hib: true },
];

// Which accounts are named in a piece of text (for tagging the memory log).
function mentionedEntities(text: string, list: AccountRow[]): Array<{ name: string; entityId: string }> {
  const t = norm(text);
  const out: Array<{ name: string; entityId: string }> = [];
  const seen = new Set<string>();
  for (const a of list) {
    const nm = norm(a.name);
    if (nm.length >= 8 && t.includes(nm) && !seen.has(a.entityId)) {
      seen.add(a.entityId);
      out.push({ name: a.name, entityId: a.entityId });
      if (out.length >= 6) break;
    }
  }
  return out;
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
    openTickets: a.openTickets, closedTicketsWindow: a.closedTicketsWindow, tenureDays: a.tenureDays, activeProducts: a.activeProducts, entityId: a.entityId,
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
  { name: "customer_facts", description: "Curated facts and history for one account from the Keeper (Bat Cave Memory) — owner details, preferences, past issues, notes captured over time. Use for 'what do we know about them?', 'any history / context?', 'who's the owner?', background before a call.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "support_tickets", description: "Linear tickets for one account (retention/churn/subscription tickets joined to the entity). Returns ACTIVE counts (state Todo/In Progress/In Review) and tickets CLOSED within a window (days: 7/30/90/180, default 30), broken down BY CLASSIFICATION (Churn Ticket, Retention Risk Alert, Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation), plus recent active tickets with their Linear identifier and URL. Use for 'any open tickets for X?', 'how many churn / retention / subscription tickets?', 'how many did we close in the last 90 days?'. Sum the matching classifications for a grouped question.", input_schema: { type: "object", properties: { name: { type: "string" }, days: { type: "integer" } }, required: ["name"] } },
  { name: "manager_tickets", description: "Linear ticket totals across an ENTIRE account manager's book in ONE call — active and closed-in-window counts, by classification (Churn Ticket, Retention Risk Alert, Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation), summed over ALL of that manager's accounts. Use for 'how many churn / retention / subscription tickets are active for X's customers?', 'ticket load across X's book'. ALWAYS use this for a whole-manager ticket question — never call support_tickets account-by-account.", input_schema: { type: "object", properties: { manager: { type: "string" }, days: { type: "integer" } }, required: ["manager"] } },
  { name: "reviews_detail", description: "Review-level detail for one account from Google reviews: total count, average star rating, rating distribution, review velocity (last 30/90 days), and the most recent reviews. Use for 'how are their reviews?', 'rating trend?', 'are reviews slowing down?'.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "cohort_benchmark", description: "Benchmark one account against its peer cohort (same state, else the whole book): for composite, leads, reviews, profile clicks, keyword top-3%, avg rank and MRR it returns the account's value, the cohort median, and the percentile. Use for 'is X doing well for their market?', 'how do they compare to peers?'.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "segment_analysis", description: "Health/metrics by segment across the whole book. groupBy: state | tier | color | accountManager | product. Returns per-segment count, avg composite, % at-risk, avg leads/reviews and total MRR. Use for 'which state is healthiest?', 'how do accounts on Discovery-only compare?', 'which AM's book is weakest?'.", input_schema: { type: "object", properties: { groupBy: { type: "string" } }, required: ["groupBy"] } },
  { name: "movers", description: "Biggest period-over-period movers (current vs previous window) for a metric — the on-demand 'what changed / who's declining' view. metric: leads | reviews | clicks. direction: down (decliners, default) | up (gainers). Optional limit. Use for 'who dropped off?', 'biggest decliners this period', 'who's picking up?'.", input_schema: { type: "object", properties: { metric: { type: "string" }, direction: { type: "string" }, limit: { type: "integer" } } } },
  { name: "expansion_radar", description: "Healthy, high-engagement accounts on a single product — ripe for an upsell/expansion conversation. Optional limit. Use for 'who can we upsell?', 'expansion opportunities'.", input_schema: { type: "object", properties: { limit: { type: "integer" } } } },
  { name: "revenue_at_risk", description: "Revenue exposure: non-healthy accounts ranked by MRR at risk, with total MRR at risk, each account's tier, root driver and recommended action. Use for 'how much revenue is at risk?', 'churn radar', 'which at-risk accounts are worth most?'.", input_schema: { type: "object", properties: { limit: { type: "integer" } } } },
  { name: "gather_360", description: "One-shot 360° dossier for an account — health metrics, live Chargebee billing, open support tickets, review detail, and Keeper history, gathered together. Use this when you need the full picture: preparing a briefing, a QBR, an outreach draft, a churn-save plan, or answering a broad 'tell me everything about X'.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "recall", description: "Search your OWN durable memory of past conversations (persists across sessions). Use when the user refers to something discussed before — 'what did we say about X?', 'what did I ask earlier / last week?', 'have we looked at this account before?'. Filter by entity (an account name) or by text; omit both for the most recent interactions.", input_schema: { type: "object", properties: { entity: { type: "string" }, text: { type: "string" } } } },
  { name: "remember", description: "Save a fact to your durable memory when the user EXPLICITLY asks you to remember / note / keep something ('remember that…', 'note that…', 'keep in mind…'). Optionally tie it to an account so it resurfaces whenever that account comes up. Do NOT use this to auto-save on your own — only on an explicit request. You can save; you never delete.", input_schema: { type: "object", properties: { fact: { type: "string" }, account: { type: "string" } }, required: ["fact"] } },
  { name: "usage_stats", description: "AGGREGATE COUNTS over your own interaction history — total number of questions, the accounts referenced MOST often (ranked with counts), and the tools used most, over an optional window (default 30 days). This is the tool for any 'how many / most / top / which comes up most / what do I ask about most' question about your own activity. (Use recall instead only when the user wants the CONTENT of a specific past conversation, not counts.)", input_schema: { type: "object", properties: { days: { type: "integer" } } } },
  { name: "pin_focus", description: "Pin an account as the session's subject so the user can ask follow-ups without re-naming it ('pin 360 Body & Beauty', then 'how are they doing?'). Pass account to set it, or clear:true to unpin. Once pinned, bare references resolve to it.", input_schema: { type: "object", properties: { account: { type: "string" }, clear: { type: "boolean" } } }, cache_control: { type: "ephemeral" } },
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
      const [facts, saved_notes] = await Promise.all([getFactsByEntityId(hits[0].entityId), getSavedNotes(hits[0].entityId)]);
      return { account: hits[0].name, ...facts, saved_notes };
    }
    if (name === "support_tickets") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const tk = await getAccountTickets(hits[0].entityId, Number(input.days) || 30);
      return { account: hits[0].name, ...tk, as_of: asOf };
    }
    if (name === "manager_tickets") {
      const qn = norm(String(input.manager || ""));
      if (qn.length < 2) return { error: "manager name too short" };
      const nq = " " + qn + " ";
      const hits = list.filter((a) => { const m = norm(a.accountManager || ""); return (" " + m + " ").includes(nq) || m.includes(qn); });
      if (!hits.length) return { error: `no accounts found for manager "${input.manager}"` };
      const managers = Array.from(new Set(hits.map((a) => a.accountManager).filter(Boolean)));
      if (managers.length > 1) return { ambiguous_managers: managers.slice(0, 15) };
      const tk = await getManagerTickets(hits.map((a) => a.entityId), Number(input.days) || 30);
      return { manager: managers[0], account_count: hits.length, ...tk, as_of: asOf };
    }
    if (name === "reviews_detail") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const rv = await getReviewsDetail(hits[0].entityId);
      return { account: hits[0].name, ...rv, as_of: asOf };
    }
    if (name === "cohort_benchmark") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const a0 = hits[0];
      const sameState = a0.state ? list.filter((a) => a.state === a0.state) : [];
      const cohort = sameState.length >= 8 ? sameState : list;
      const basis = cohort === list ? "whole book" : `state: ${a0.state}`;
      const metrics = COHORT_METRICS.map((m) => {
        const v = Number(m.get(a0));
        const vals = cohort.map((a) => Number(m.get(a))).filter((n) => Number.isFinite(n));
        const med = median(vals);
        let pct: number | null = null;
        if (Number.isFinite(v) && vals.length) {
          const better = m.hib ? vals.filter((x) => x <= v).length : vals.filter((x) => x >= v).length;
          pct = Math.round((better / vals.length) * 100);
        }
        return { metric: m.k, value: Number.isFinite(v) ? r1(v) : null, cohort_median: med == null ? null : r1(med), percentile: pct };
      });
      return { account: a0.name, accountManager: a0.accountManager || "Unassigned", cohort: { basis, size: cohort.length }, metrics, as_of: asOf };
    }
    if (name === "segment_analysis") {
      const gb = String(input.groupBy || "state");
      const keyOf = (a: AccountRow) => gb === "tier" ? (a.health?.tier || "—") : gb === "color" ? (a.health?.color || "—") : gb === "accountManager" ? (a.accountManager || "Unassigned") : gb === "product" ? (a.activeProducts?.[0] || "none") : (a.state || "—");
      const g: Record<string, { n: number; comp: number[]; leads: number; reviews: number; mrr: number; atRisk: number }> = {};
      for (const a of list) {
        const k = keyOf(a);
        (g[k] ||= { n: 0, comp: [], leads: 0, reviews: 0, mrr: 0, atRisk: 0 });
        g[k].n++;
        if (Number.isFinite(a.health?.composite as number)) g[k].comp.push(a.health!.composite as number);
        g[k].leads += a.leadsReceived || 0;
        g[k].reviews += a.reviewsReceived || 0;
        g[k].mrr += a.mrr || 0;
        if (a.health?.color !== "green") g[k].atRisk++;
      }
      const groups = Object.entries(g).map(([group, v]) => ({
        group, count: v.n,
        avg_composite: v.comp.length ? Math.round((v.comp.reduce((s, x) => s + x, 0) / v.comp.length) * 10) / 10 : null,
        at_risk_pct: Math.round((v.atRisk / v.n) * 100),
        avg_leads: Math.round(v.leads / v.n), avg_reviews: Math.round(v.reviews / v.n), total_mrr: r0(v.mrr),
      })).sort((a, b) => b.count - a.count);
      return { groupBy: gb, groupCount: groups.length, groups: groups.slice(0, 40), as_of: asOf };
    }
    if (name === "movers") {
      const metric = String(input.metric || "leads");
      const pick = (a: AccountRow) => metric === "reviews" ? a.reviewsDelta : metric === "clicks" ? a.clicksDelta : a.leadsDelta;
      const dir = String(input.direction || "down");
      const limit = Math.min(Number(input.limit) || 10, 25);
      let rows = list.map((a) => { const d = pick(a); if (!d) return null; const delta = (d.cur || 0) - (d.prev || 0); return { name: a.name, am: a.accountManager || "Unassigned", cur: d.cur || 0, prev: d.prev || 0, delta, pct: Math.round((delta / Math.max(d.prev || 0, 1)) * 100) }; }).filter(Boolean) as Array<{ name: string; am: string; cur: number; prev: number; delta: number; pct: number }>;
      rows = dir === "up" ? rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta) : rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
      return { metric, direction: dir, window_days: payload.windowDays, count: rows.length, top: rows.slice(0, limit), note: "cur = current window, prev = prior window", as_of: asOf };
    }
    if (name === "expansion_radar") {
      const limit = Math.min(Number(input.limit) || 12, 25);
      const cand = list.filter((a) => a.health?.color === "green" && (a.health?.engagement ?? 0) >= 65 && (a.activeProducts?.length ?? 0) <= 1)
        .sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0) || (b.health?.engagement ?? 0) - (a.health?.engagement ?? 0));
      return { criteria: "healthy + engagement>=65 + <=1 active product", count: cand.length, top: cand.slice(0, limit).map((a) => compact({ name: a.name, am: a.accountManager || "Unassigned", composite: r1(a.health?.composite), engagement: r1(a.health?.engagement), mrr: r0(a.mrr), activeProducts: a.activeProducts, leads: a.leadsReceived, reviews: a.reviewsReceived })), as_of: asOf };
    }
    if (name === "revenue_at_risk") {
      const limit = Math.min(Number(input.limit) || 15, 30);
      const atRisk = list.filter((a) => a.health?.color !== "green");
      const total = atRisk.reduce((s, a) => s + (a.mrr || 0), 0);
      const ranked = atRisk.slice().sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0));
      return {
        total_mrr_at_risk: r0(total), at_risk_count: atRisk.length, window_days: payload.windowDays, as_of: asOf,
        top: ranked.slice(0, limit).map((a) => compact({ name: a.name, am: a.accountManager || "Unassigned", mrr: r0(a.mrr), composite: r1(a.health?.composite), tier: a.health?.tier, primary_driver: primaryDriver(a), recommendedAction: a.health?.recommendedAction })),
      };
    }
    if (name === "gather_360") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const a = hits[0];
      const settle = <T>(p: Promise<T>) => p.then((v) => v).catch((e) => ({ error: String((e as Error)?.message || e) }) as unknown as T);
      const [billing, facts, tickets, reviews, saved_notes] = await Promise.all([
        settle(getBillingByEntityId(a.entityId)),
        settle(getFactsByEntityId(a.entityId)),
        settle(getAccountTickets(a.entityId)),
        settle(getReviewsDetail(a.entityId)),
        settle(getSavedNotes(a.entityId)),
      ]);
      return { account: a.name, as_of: asOf, health: slim(a), billing, facts, support_tickets: tickets, reviews, saved_notes };
    }
    if (name === "recall") {
      return await recall({ entity: input.entity ? String(input.entity) : undefined, text: input.text ? String(input.text) : undefined });
    }
    if (name === "usage_stats") {
      return await getUsageStats(Number(input.days) || 30);
    }
    if (name === "pin_focus") {
      if (input.clear) { await clearFocus(); return { cleared: true }; }
      const hits = findAccounts(list, String(input.account || ""));
      if (!hits.length) return { error: `no account named "${input.account}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      await setFocus(hits[0].entityId, hits[0].name);
      return { pinned: hits[0].name, note: "bare references will now resolve to this account until you unpin or pin another" };
    }
    if (name === "remember") {
      const fact = String(input.fact || "").trim();
      if (!fact) return { error: "nothing to remember — provide the fact to save" };
      let entityId: string | undefined, entityName: string | undefined;
      if (input.account) {
        const hits = findAccounts(list, String(input.account));
        if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
        if (hits.length === 1) { entityId = hits[0].entityId; entityName = hits[0].name; }
      }
      const res = await rememberFact({ fact, entityId, entityName });
      return res.ok ? { saved: true, fact, account: entityName || null, note: entityName ? "will resurface when this account comes up" : "saved as a general note" } : { error: res.reason };
    }
    return { error: "unknown tool " + name };
  } catch (e) {
    return { error: String((e as Error)?.message || e) };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(onTimeout), ms))]);
}

// Structured per-request trace → Vercel logs (observability: tools, latency,
// token usage, cost). One JSON line, greppable by the "[alfred:trace]" tag.
function logTrace(t: Record<string, unknown>) {
  try { console.log("[alfred:trace] " + JSON.stringify(t)); } catch { /* never let logging break a reply */ }
}

const FINALIZE_NOTE = "Reply now with your best final answer using only the information already gathered above. Do NOT request or call any more tools. If some data is missing, answer with what you have and note the gap in one line — never end without an answer.";

async function anthropic(messages: unknown[], opts: { withTools?: boolean; finalize?: boolean } = {}): Promise<any> {
  const { withTools = true, finalize = false } = opts;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const system: unknown[] = [{ type: "text", text: ALFRED_SYS, cache_control: { type: "ephemeral" } }];
  if (finalize) system.push({ type: "text", text: FINALIZE_NOTE });
  const body: Record<string, unknown> = { model: MODEL, max_tokens: 1500, system, messages };
  if (withTools) body.tools = TOOLS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return await r.json();
  } catch {
    return { type: "error", error: { message: "model call timed out" } };
  } finally {
    clearTimeout(timer);
  }
}

const textOf = (resp: any) => (resp?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();

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

  const focus = await getFocus();
  const focusNote = focus?.entityName
    ? `Pinned focus this session: ${focus.entityName}. Resolve bare references ("they", "them", "this account", "how are they doing") to ${focus.entityName} unless the user names a different account. If the user asks to change or clear the focus, use pin_focus.\n\n`
    : "";
  const recent = history.slice(-6).map((m) => (m.role === "user" ? "User: " : "Alfred: ") + m.text).join("\n");
  const messages: unknown[] = [{ role: "user", content: focusNote + (recent ? "Conversation so far:\n" + recent + "\n\n" : "") + "Question: " + q }];

  const t0 = Date.now();
  const toolsUsed: string[] = [];
  let tokIn = 0, tokOut = 0, tokCache = 0, iters = 0;
  const finish = async (rawReply: string, status: string) => {
    // Drive-the-UI protocol: the model may append a final `ACTION: {json}` line
    // when the request implies navigation. Parse + strip it; the client executes.
    let reply = rawReply;
    let action: unknown = null;
    const m = rawReply.match(/\n?\s*ACTION:\s*(\{[\s\S]*\})\s*$/);
    if (m) {
      try {
        action = JSON.parse(m[1]);
        reply = rawReply.slice(0, m.index).trim() || "Done, sir.";
      } catch {
        /* leave reply untouched if the directive is malformed */
      }
    }
    // Fallback: if the user gave an explicit open/go-to command and the model
    // forgot to emit the directive, synthesize it from the question so the
    // navigation still fires (the client resolves the name fuzzily).
    if (!action) {
      const nav = q.match(/^\s*(?:open|go ?to|pull up|take me to|show me|navigate to|jump to)\s+(.+?)['".!?]*\s*$/i);
      if (nav && nav[1] && nav[1].length >= 3 && !/\b(accounts?|book|risk|overview|list|all|my)\b/i.test(nav[1])) {
        action = { type: "open", name: nav[1].replace(/^the\s+/i, "").replace(/'s\b.*$/, "").replace(/["']/g, "").trim() };
      }
    }
    const ms = Date.now() - t0;
    logTrace({ status, q: q.slice(0, 120), tools: toolsUsed, iters, ms, tok_in: tokIn, tok_out: tokOut, tok_cache_read: tokCache, model: MODEL, reply_len: reply.length });
    // Durable memory — log the interaction (swallows its own errors; awaited so
    // the write completes before the serverless function freezes).
    await logInteraction({ question: q, reply, tools: toolsUsed, entities: mentionedEntities(q + " " + reply, ctx.list), status, latency_ms: ms, tokens_in: tokIn, tokens_out: tokOut, model: MODEL });
    return NextResponse.json({ reply, action });
  };

  try {
    for (let i = 0; i < MAX_ITERS; i++) {
      iters = i + 1;
      // On the last iteration OR once we've spent the time budget, stop gathering
      // and FORCE a final synthesized answer (no tools) — so a complex question
      // always resolves instead of half-hanging or timing out.
      const mustAnswer = i === MAX_ITERS - 1 || Date.now() - t0 > ANSWER_BUDGET_MS;
      const resp: any = await anthropic(messages, { withTools: !mustAnswer, finalize: mustAnswer });
      const u = resp?.usage || {};
      tokIn += u.input_tokens || 0; tokOut += u.output_tokens || 0; tokCache += u.cache_read_input_tokens || 0;
      if (!resp || resp.type === "error") {
        // A model call failed/timed out. If we already gathered data, try ONE
        // clean synthesis pass before giving up, so the user still gets an answer.
        if (!mustAnswer && toolsUsed.length) {
          const fb: any = await anthropic(messages, { withTools: false, finalize: true });
          const t = textOf(fb);
          if (t) return finish(t, "recovered");
        }
        return finish("My reasoning stalled just now, sir — please ask again in a moment.", "api_error");
      }
      if (!mustAnswer && resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: resp.content });
        const blocks = (resp.content || []).filter((b: any) => b.type === "tool_use");
        // Cap concurrent tool calls per turn: run the first N in parallel; any
        // beyond that are skipped with guidance to use an aggregate tool. This
        // stops a "call support_tickets for all 113 accounts" explosion (which
        // would blow past maxDuration and never return).
        const toRun = blocks.slice(0, MAX_TOOLS_PER_TURN);
        const skipped = blocks.slice(MAX_TOOLS_PER_TURN);
        const results: unknown[] = await Promise.all(toRun.map(async (blk: any) => {
          toolsUsed.push(blk.name);
          const r = await withTimeout(execTool(blk.name, blk.input || {}, ctx), TOOL_TIMEOUT_MS, { error: "tool timed out" });
          return { type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(r).slice(0, 12000) };
        }));
        for (const blk of skipped) {
          results.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify({ error: "skipped — too many tool calls at once. For a whole account manager's book or a segment, use ONE aggregate tool (manager_tickets, book_aggregate, segment_analysis, accounts_by_manager), not many per-account calls." }) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = textOf(resp);
      if (text) return finish(text, mustAnswer ? "forced" : "ok");
      // Model returned no text (e.g. it still tried to use a tool on the forced
      // pass). Do one explicit no-tools synthesis so we never return empty.
      const fb: any = await anthropic(messages, { withTools: false, finalize: true });
      return finish(textOf(fb) || "Here's the best I can give from what I gathered, sir — please narrow the question for more detail.", "forced2");
    }
    return finish("I dug into that but couldn't converge, sir — please narrow the question.", "no_converge");
  } catch (e) {
    return finish("My reasoning engine is unreachable just now, sir.", "exception");
  }
}
