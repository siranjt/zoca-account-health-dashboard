import { NextResponse } from "next/server";
import { getAccountsPayload, getAccountDetail } from "@/lib/data";
import { getViewer, scopeAccounts } from "@/lib/scope";
import { getBillingByEntityId } from "@/lib/chargebee";
import { getFactsByEntityId } from "@/lib/keeper";
import { getReviewsDetail } from "@/lib/insights";
import { getComms } from "@/lib/comms";
import { getAccountTickets, getManagerTickets, getBookTicketsByManager } from "@/lib/tickets";
import { logInteraction, recall, rememberFact, getSavedNotes, getUsageStats, setFocus, clearFocus, getFocus } from "@/lib/memory";
import { HEALTH_WEIGHTS } from "@/lib/health";
import { queryAurora } from "@/lib/metabase";
import { logActivity } from "@/lib/activity";
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
- Address the user by their FIRST NAME (given to you at the start of each request) — warm but not overfamiliar; use it sparingly, not in every sentence. If no name is given, address them directly with no honorific (never "sir" or "ma'am"). Be concise and scale depth to the question: a lookup earns a sentence, an analysis earns a tight brief.
- Answer the question directly. Do NOT narrate which tools you called. NEVER remark that "both names/queries resolve to the same account", that a name "looks like two accounts", or anything about duplicates — many account names contain "and" or several words (e.g. "Glow Esthetics Skincare and Wellness By Dhin" is ONE account); treat the full name as a single account and just answer.
- Lead with the claim, then the specific figures that support it.
- Dates as DD/MM/YY, money in USD; when listing invoices or items, newest first.

TOOLS
- book_summary — whole-book tier counts. at_risk_accounts — worst-first list with root drivers. account_health — one account's full metrics. account_detail — time-series behind a row. accounts_by_manager — an account manager's roster plus best/worst. book_aggregate — deterministic roll-ups (totals and group-bys: use it for 'total MRR at risk', 'reviews by AM', counts). explain_health — how an account's composite score is built. billing — LIVE Chargebee billing (subscription MRR/status, auto-collection, next renewal, unpaid invoices, failed transactions). Chargebee is ground truth for payments and revenue; prefer it over the health row's failedPayments proxy when a question is about money, renewals, or payment failures. customer_facts — curated history/notes about an account from the Keeper (Bat Cave Memory); use it for background and context on a customer. support_tickets — Linear tickets (churn/retention/subscription) for an account, active + closed-in-window by classification. reviews_detail — Google review count, average rating, distribution, velocity (last 30/90 days) and recent reviews. message_history — omni-channel communication log (App Chat, Calls with transcript, SMS, Email, Meetings) for one account: per-channel counts + recent message snippets, newest first; use for 'summarize our messages/conversations with X', 'when did we last speak to them?', 'any recent calls/emails?'. cohort_benchmark — one account vs its peer cohort (percentiles + medians). segment_analysis — health/metrics by segment (state/tier/product/AM). movers — biggest gainers/decliners period-over-period. expansion_radar — healthy single-product accounts ripe for upsell. revenue_at_risk — MRR at risk, ranked by revenue exposure. gather_360 — one-shot full dossier (health + billing + tickets + reviews + Keeper history) for briefings and drafts. recall — search your own durable memory of past conversations (across sessions). remember — save a fact the user asks you to keep. usage_stats — analytics over your own history (most-asked accounts/tools). pin_focus — pin an account as the session subject so follow-ups need no re-naming. find_account — reverse-lookup a phone / email / partial business name to the account that owns it, across the whole book.
- Call tools as needed; you may call several at once. If a tool errors or returns nothing, adjust the arguments and retry once before concluding.
- SPEED — call EVERY tool you need in ONE turn (they run in parallel); never fetch one metric, wait, then fetch the next across separate turns. For a briefing, "tell me about X", a QBR, or an outreach draft, gather_360 already returns health + billing + tickets + reviews + Keeper history together — call it EXACTLY ONCE, never twice, and never follow it with separate account_health / billing / support_tickets / reviews_detail calls for the same account.
- find_account is your REVERSE LOOKUP. For ANY "whose number is this", "which customer has this phone / email", or a partial business-name match, CALL find_account — it searches billing, GBP and entity phone/email across the whole book. NEVER tell the user you can't look up a phone or email, or that you have no directory / cross-book lookup — you do. If it returns no match, say plainly the identifier isn't on any account's records.
- PRODUCT HOW-TO — if the question is how to USE the platform ("how do I check if a lead is masked?", "where do I find X?"), that's product usage, not account data: answer briefly if you're certain, then point them to the Training module (top-right ☰ menu → Training) for the full walkthrough. Don't invent steps.
- For a question about a WHOLE account-manager's book or a segment (e.g. "tickets for X's customers", "MRR across X's book"), use ONE aggregate tool — manager_tickets, accounts_by_manager, book_aggregate, or segment_analysis. NEVER call a per-account tool (support_tickets, billing, account_health) once per account across a whole book — that is too slow and will fail. If the needed aggregate doesn't exist, say so plainly instead of looping.
- TICKETS — the ONLY ticket taxonomy that exists is the Linear ticket_classification: Churn Ticket, Retention Risk Alert, Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation. There is NO "finance", "website", "technical" or "product" ticket type in the data. If a user asks for a ticket type that doesn't exist ("how many finance / website tickets"), do NOT loop or guess — say which classifications DO exist and give those counts. support_tickets (one account) and manager_tickets (one AM's book) each return EVERY classification in a SINGLE call — read the by_classification breakdown; never call them repeatedly to get different types. For ANY cross-book / cross-manager ticket comparison ("which AM has the most tickets across the whole book"), use book_tickets_by_manager — ONE call returns every manager; never loop manager_tickets over each AM.
- You have a DURABLE MEMORY: when the user refers to something discussed earlier or in a previous session ("what did we say about…", "last week", "have we looked at…"), use recall before answering. When the user explicitly tells you to remember / note / keep a fact, you MUST call the remember tool (tie it to the account when there is one) and confirm what you saved — your saved notes resurface automatically in account_facts and the 360 dossier. Only save on an explicit request, and never delete. NEVER claim you lack a memory or "write to memory" tool, and NEVER tell the user to log it elsewhere (Keeper/HubSpot) instead — you DO have the remember tool; use it. If a save genuinely fails, say the save failed — do not say the capability doesn't exist.

DRAFTS — you draft, a human sends
- On request you can DRAFT outward artifacts: an account-manager outreach message, a QBR / health brief, a churn-save playbook, or an escalation note. Pull real context first (gather_360 gives the full picture), address the real account and account manager, and be specific and grounded — no invented details.
- Always label it clearly as a draft. You NEVER send, email, post, create, schedule, or modify anything — you produce text for a human to review and send. If asked to actually send or create something, say you can only prepare the draft.`;

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
  { name: "find_account", description: "REVERSE LOOKUP — find WHICH account a phone number, email address, or partial business name belongs to, searching ACROSS the whole book (billing phone/email, Google Business Profile phone, and the entity phone/business records). Use for 'whose number is 4699883121?', 'which customer has this phone / email?', 'find the account with email x@y.com', or a fuzzy business-name match. Returns the matching account(s) with name + AM, or states plainly that the identifier isn't on any account's records. This is the ONLY cross-book lookup by contact detail — for any such question, use this; never say you can't look up a phone or email.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "support_tickets", description: "Linear tickets for one account (retention/churn/subscription tickets joined to the entity). Returns ACTIVE counts (state Todo/In Progress/In Review) and tickets CLOSED within a window (days: 7/30/90/180, default 30), broken down BY CLASSIFICATION (Churn Ticket, Retention Risk Alert, Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation), plus recent active tickets with their Linear identifier and URL. Use for 'any open tickets for X?', 'how many churn / retention / subscription tickets?', 'how many did we close in the last 90 days?'. Sum the matching classifications for a grouped question.", input_schema: { type: "object", properties: { name: { type: "string" }, days: { type: "integer" } }, required: ["name"] } },
  { name: "manager_tickets", description: "Linear ticket totals across an ENTIRE account manager's book in ONE call — active and closed-in-window counts, by classification (Churn Ticket, Retention Risk Alert, Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation), summed over ALL of that manager's accounts. Use for 'how many churn / retention / subscription tickets are active for X's customers?', 'ticket load across X's book'. ALWAYS use this for a whole-manager ticket question — never call support_tickets account-by-account.", input_schema: { type: "object", properties: { manager: { type: "string" }, days: { type: "integer" } }, required: ["manager"] } },
  { name: "book_tickets_by_manager", description: "Whole-book Linear ticket load rolled up BY MANAGER in ONE call — every account manager's active + closed-in-window counts and per-classification breakdown, ranked by active desc. Use this for ANY cross-book/cross-manager ticket comparison: 'which AM has the most tickets / churn tickets / retention tickets across the whole book?', 'ticket load by manager', 'who has the highest ticket volume?'. ALWAYS use this instead of calling manager_tickets once per manager — one call returns all managers.", input_schema: { type: "object", properties: { days: { type: "integer" } } } },
  { name: "reviews_detail", description: "Review-level detail for one account from Google reviews: total count, average star rating, rating distribution, review velocity (last 30/90 days), and the most recent reviews. Use for 'how are their reviews?', 'rating trend?', 'are reviews slowing down?'.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "message_history", description: "Omni-channel communication history for ONE account by name — every recorded touch across App Chat, phone Calls (with transcript), SMS, Email, and Meetings (Fireflies/demo/customer), newest first, within a window (days: default 180). Returns the total, per-channel counts, and the most recent messages each with a text snippet. Use for 'summarize the messages / conversations with X', 'what have we talked to them about?', 'when did we last speak to them?', 'any recent calls / emails / texts?'.", input_schema: { type: "object", properties: { name: { type: "string" }, days: { type: "integer" } }, required: ["name"] } },
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
    if (name === "book_tickets_by_manager") {
      const tk = await getBookTicketsByManager(Number(input.days) || 30);
      return { ...tk, as_of: asOf };
    }
    if (name === "reviews_detail") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const rv = await getReviewsDetail(hits[0].entityId);
      return { account: hits[0].name, ...rv, as_of: asOf };
    }
    if (name === "message_history") {
      const hits = findAccounts(list, String(input.name || ""));
      if (!hits.length) return { error: `no account named "${input.name}"` };
      if (hits.length > 1 && hits.length <= 8) return { ambiguous: hits.map((a) => ({ name: a.name, am: a.accountManager, city: a.city, entityId: a.entityId })) };
      const days = Math.min(Math.max(Number(input.days) || 180, 1), 365);
      const c = await getComms(hits[0].entityId, days);
      // Keep the payload lean: per-channel counts + the newest ~25 messages with
      // short snippets. Full transcripts (up to 8k chars each, 600 messages) would
      // blow the token budget — Alfred summarises, it doesn't transcribe.
      const messages = c.messages.slice(0, 25).map((m) => compact({
        type: m.type,
        at: ddmmyy(m.at || undefined) || m.at,
        sender: m.sender,
        snippet: m.body ? m.body.replace(/\s+/g, " ").trim().slice(0, 320) : null,
      }));
      return compact({
        account: hits[0].name, window_days: c.windowDays,
        total: c.total, capped: c.capped, by_channel: c.byType,
        showing: messages.length, messages, as_of: asOf,
      });
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
    if (name === "find_account") {
      const raw = String(input.query || "").trim();
      if (!raw) return { error: "provide a phone number, email, or business name to look up" };
      const digits = raw.replace(/[^0-9]/g, "");
      const isEmail = raw.includes("@");
      const isPhone = !isEmail && digits.length >= 7;
      // Partial NAME → in-memory search over the already-scoped book (fast).
      if (!isPhone && !isEmail) {
        const hits = findAccounts(list, raw);
        return { query: raw, matched_on: "name", matches: hits.slice(0, 12).map((a) => ({ name: a.name, am: a.accountManager || "Unassigned", entityId: a.entityId })), note: hits.length ? undefined : `no account name matches "${raw}"` };
      }
      // PHONE / EMAIL → warehouse search, then filter to what the viewer may see.
      let rows: Record<string, unknown>[] = [];
      try {
        if (isPhone) {
          const d = digits.slice(-10); // ignore country code — match on the last 10 digits
          rows = await queryAurora(
            `SELECT DISTINCT eid, matched FROM (
               SELECT (s.custom_fields::jsonb->>'cf_entity_id') eid, 'billing phone' matched
                 FROM chargebee.customers c JOIN chargebee.subscriptions s ON s.customer_id=c.id
                 WHERE regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g') LIKE '%${d}%'
               UNION SELECT p.entity_id::text, 'phone record' FROM entities.phones p
                 WHERE regexp_replace(COALESCE(p.phone_number,''),'[^0-9]','','g') LIKE '%${d}%'
               UNION SELECT g.entity_id::text, 'GBP phone' FROM gbp.locations g
                 WHERE regexp_replace(COALESCE(g.phone_numbers::text,''),'[^0-9]','','g') LIKE '%${d}%'
               UNION SELECT b.entity_id::text, 'business phone' FROM entities.businesses b
                 WHERE regexp_replace(COALESCE(b.phone_numbers::text,''),'[^0-9]','','g') LIKE '%${d}%'
             ) x WHERE eid IS NOT NULL LIMIT 25`
          ) as Record<string, unknown>[];
        } else {
          const e = raw.replace(/'/g, "''");
          rows = await queryAurora(
            `SELECT DISTINCT (s.custom_fields::jsonb->>'cf_entity_id') eid, 'billing email' matched
               FROM chargebee.customers c JOIN chargebee.subscriptions s ON s.customer_id=c.id
               WHERE c.email ILIKE '%${e}%' AND (s.custom_fields::jsonb->>'cf_entity_id') IS NOT NULL LIMIT 25`
          ) as Record<string, unknown>[];
        }
      } catch (err) {
        return { query: raw, error: `lookup failed: ${String((err as Error)?.message || err).slice(0, 120)}` };
      }
      const byId = new Map(list.map((a) => [a.entityId, a]));
      const seen = new Set<string>();
      const matches: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        const eid = r.eid ? String(r.eid) : "";
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);
        const a = byId.get(eid);
        if (a) matches.push({ name: a.name, am: a.accountManager || "Unassigned", entityId: eid, matched_on: r.matched });
      }
      const outOfBook = rows.length > 0 && matches.length === 0;
      return {
        query: raw, matched_on: isPhone ? "phone" : "email", matches,
        note: matches.length ? undefined
          : outOfBook ? `a record with this ${isPhone ? "number" : "email"} exists but is not in the active/accessible book (churned, unmapped, or outside your scope)`
          : `no account in the book has this ${isPhone ? "phone number" : "email"} on file`,
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

// Preferred greeting names by email (a nickname that doesn't fall out of the
// display name/email). Add entries as people ask.
const PREFERRED_NAMES: Record<string, string> = {
  "siranjith.t@zoca.com": "Siranj",
  "siranjiththangavel@gmail.com": "Siranj",
};

// First name to address the user by: preferred override → session name → AM name → email.
function firstNameOf(v: { name?: string | null; amName?: string | null; email?: string | null }): string {
  const email = (v.email || "").toLowerCase();
  if (PREFERRED_NAMES[email]) return PREFERRED_NAMES[email];
  const raw = (v.name || v.amName || email.split("@")[0] || "").trim();
  const first = raw.split(/[ ._-]+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

export async function POST(req: Request) {
  let q = "", history: { role: string; text: string }[] = [];
  let asker: { email: string | null; amName: string | null; role: string | null } = { email: null, amName: null, role: null };
  let firstName = "";
  try { const b = await req.json(); q = String(b.q || "").slice(0, 800).trim(); if (Array.isArray(b.history)) history = b.history; } catch {}
  if (!q) return NextResponse.json({ error: "empty question" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ reply: "My reasoning engine has no API key configured — set ANTHROPIC_API_KEY in the Vercel project." });

  // Fetch the book ONCE per request; every tool call reuses this snapshot.
  let ctx: Ctx;
  try {
    const [payload, viewer] = await Promise.all([getAccountsPayload(), getViewer()]);
    // AMs: Alfred only reasons over their own book. Managers/admins: everything.
    const scoped = scopeAccounts(payload.accounts, viewer);
    ctx = { list: scoped, payload: { ...payload, accounts: scoped }, asOf: ddmmyy(payload.generatedAt) };
    asker = { email: viewer.email ?? null, amName: viewer.amName ?? null, role: viewer.role ?? null };
    firstName = firstNameOf(viewer);
  } catch (e) {
    return NextResponse.json({ reply: "I couldn't reach the account data just now — please try again in a moment." });
  }

  const focus = await getFocus();
  // Slack ping: who spoke to Alfred + which account — but ONLY when the question
  // explicitly names an account. The pinned focus is deliberately NOT used here:
  // it persists across the session and would mis-attribute unrelated questions
  // (e.g. "compare the 2 worst accounts") to whatever was last pinned. NEVER the
  // question/answer content.
  const askAccount = mentionedEntities(q, ctx.list)[0]?.name || null;
  void logActivity(
    { email: asker.email, name: null, role: asker.role as "admin" | "manager" | "am" | null, amName: asker.amName },
    { event: "alfred_asked", surface: "alfred", detail: askAccount ? { account: askAccount } : null }
  );
  const focusNote = focus?.entityName
    ? `Pinned focus this session: ${focus.entityName}. Resolve bare references ("they", "them", "this account", "how are they doing") to ${focus.entityName} unless the user names a different account. If the user asks to change or clear the focus, use pin_focus.\n\n`
    : "";
  const recent = history.slice(-6).map((m) => (m.role === "user" ? "User: " : "Alfred: ") + m.text).join("\n");
  const nameNote = firstName ? `You are assisting ${firstName}. Address them by their first name.\n\n` : "";
  const messages: unknown[] = [{ role: "user", content: nameNote + focusNote + (recent ? "Conversation so far:\n" + recent + "\n\n" : "") + "Question: " + q }];

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
        reply = rawReply.slice(0, m.index).trim() || "Done.";
      } catch {
        /* leave reply untouched if the directive is malformed */
      }
    }
    // Fallback: if the user gave an explicit open/go-to command and the model
    // forgot to emit the directive, synthesize it from the question so the
    // navigation still fires.
    if (!action) {
      const nav = q.match(/^\s*(?:open|go ?to|pull up|take me to|show me|navigate to|jump to)\s+(.+?)['".!?]*\s*$/i);
      if (nav && nav[1] && nav[1].length >= 3 && !/\b(accounts?|book|risk|overview|list|all|my)\b/i.test(nav[1])) {
        action = { type: "open", name: nav[1].replace(/^the\s+/i, "").replace(/'s\b.*$/, "").replace(/["']/g, "").trim() };
      }
    }
    // Resolve an open action's name → entityId SERVER-SIDE against the full book,
    // so the client can navigate by id and never depends on its own index being
    // loaded. Fuzzy: exact → substring → all-tokens.
    const act = action as { type?: string; name?: string; entityId?: string } | null;
    if (act && act.type === "open" && act.name && !act.entityId) {
      const nm = act.name.toLowerCase().trim();
      const toks = nm.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      const L = ctx.list;
      const hit =
        L.find((a) => (a.name || "").toLowerCase() === nm) ||
        L.find((a) => (a.name || "").toLowerCase().includes(nm)) ||
        L.find((a) => { const an = (a.name || "").toLowerCase(); return an.length > 4 && nm.includes(an); }) ||
        (toks.length ? L.find((a) => { const an = (a.name || "").toLowerCase(); return toks.every((t) => an.includes(t)); }) : undefined) ||
        (toks.length >= 2 ? L.find((a) => { const an = (a.name || "").toLowerCase(); return toks.filter((t) => an.includes(t)).length >= Math.ceil(toks.length * 0.6); }) : undefined);
      if (hit) { act.entityId = hit.entityId; act.name = hit.name; }
      else action = null; // no match → don't emit a dead action
    }
    const ms = Date.now() - t0;
    logTrace({ status, q: q.slice(0, 120), tools: toolsUsed, iters, ms, tok_in: tokIn, tok_out: tokOut, tok_cache_read: tokCache, model: MODEL, reply_len: reply.length });
    // Durable memory — log the interaction (swallows its own errors; awaited so
    // the write completes before the serverless function freezes).
    await logInteraction({ question: q, reply, tools: toolsUsed, entities: mentionedEntities(q + " " + reply, ctx.list), status, latency_ms: ms, tokens_in: tokIn, tokens_out: tokOut, model: MODEL, email: asker.email, am_name: asker.amName, role: asker.role });
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
        return finish("My reasoning stalled just now — please ask again in a moment.", "api_error");
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
      return finish(textOf(fb) || "Here's the best I can give from what I gathered — please narrow the question for more detail.", "forced2");
    }
    return finish("I dug into that but couldn't converge — please narrow the question.", "no_converge");
  } catch (e) {
    return finish("My reasoning engine is unreachable just now.", "exception");
  }
}
