import "server-only";
import Papa from "papaparse";

// Linear tickets — ported from Beacon (lib/escalation/tickets.ts +
// lib/miss-payment/tickets.ts). Source of truth is a Metabase PUBLIC CSV that
// pre-joins Linear tickets to Zoca entities, keyed by entity_id. Same logic as
// Beacon: active = state ∈ {Todo, In Progress, In Review}; write-off / refund
// titles are excluded from "active" (accounting actions, not customer issues);
// 5-min in-memory cache. Classifications: Churn Ticket, Retention Risk Alert,
// Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation.

const TICKETS_CSV_URL =
  process.env.METABASE_TICKETS_URL ||
  "https://metabase.zoca.ai/public/question/331e4835-e163-4981-877e-14592f71741d.csv";
const TIMEOUT_MS = Number(process.env.METABASE_TICKETS_TIMEOUT_MS || 15_000);
const CACHE_TTL_MS = 5 * 60 * 1000;

const ACTIVE_STATES = new Set(["Todo", "In Progress", "In Review"]);
const EXCLUDED_TITLE_PREFIXES = ["write off", "write-off", "writeoff", "refund"];
const ID_REGEX = /linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/i;

export type LinearTicket = {
  id: string;
  identifier: string; // "FIN-1317" — parsed from linear_url
  title: string;
  url: string;
  state: string; // Done | Todo | In Progress | In Review | Canceled | Duplicate
  classification: string; // Churn Ticket | Retention Risk Alert | Subscription Support Ticket | paid_user_offboarding | Subscription_Cancellation
  category: string; // assigned_to_am | assigned_by_am | other_team
  churnPotentialStatus: string;
  createdAt: string;
  completedAt: string;
  cancelledAt: string;
  entityId: string; // lowercased join key
  customerName: string;
  customerId: string;
  amName: string;
};

const parseIdentifier = (url: string) => { const m = (url || "").match(ID_REGEX); return m ? m[1].toUpperCase() : ""; };
const isoOrEmpty = (s: string | undefined) => { if (!s) return ""; const t = Date.parse(s); return Number.isNaN(t) ? "" : new Date(t).toISOString(); };
const excludedTitle = (title: string) => { const lc = (title || "").toLowerCase(); return EXCLUDED_TITLE_PREFIXES.some((p) => lc.startsWith(p)); };

/** A ticket an AM should chase: active state, not an accounting write-off/refund. */
export const isActive = (t: LinearTicket) => ACTIVE_STATES.has(t.state) && !excludedTitle(t.title);
/** Closed within [from, now): completed and stamped inside the window. */
export const closedInWindow = (t: LinearTicket, fromMs: number) => {
  if (t.state !== "Done" || !t.completedAt) return false;
  const c = Date.parse(t.completedAt);
  return !Number.isNaN(c) && c >= fromMs;
};

function rowToTicket(r: Record<string, string>): LinearTicket {
  return {
    id: r["id"] || "",
    identifier: parseIdentifier(r["linear_url"] || ""),
    title: (r["title"] || "").trim(),
    url: (r["linear_url"] || "").trim(),
    state: (r["state_name"] || "").trim(),
    classification: r["ticket_classification"] || "",
    category: r["ticket_category"] || "",
    churnPotentialStatus: r["churn_potential_status"] || "",
    createdAt: isoOrEmpty(r["linear_created_at"]),
    completedAt: isoOrEmpty(r["completed_at"]),
    cancelledAt: isoOrEmpty(r["canceled_at"]),
    entityId: (r["entity_id"] || "").trim().toLowerCase(),
    customerName: r["customer_name"] || "",
    customerId: r["customer_id"] || "",
    amName: r["am_name"] || "",
  };
}

let cache: { rows: LinearTicket[]; ts: number } | null = null;
let inflight: Promise<LinearTicket[]> | null = null;

export async function fetchAllTickets(): Promise<LinearTicket[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(TICKETS_CSV_URL, { signal: ctrl.signal, cache: "no-store", redirect: "follow" });
      if (!r.ok) throw new Error(`Metabase tickets ${r.status}`);
      const csv = await r.text();
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      const rows = (parsed.data || []).map(rowToTicket).filter((t) => t.entityId);
      cache = { rows, ts: Date.now() };
      return rows;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

/** entity_id → {active, closedInWindow} counts, for the account model. */
export async function getTicketCountsByEntity(fromISO: string): Promise<Map<string, { active: number; closed: number }>> {
  const out = new Map<string, { active: number; closed: number }>();
  let rows: LinearTicket[];
  try { rows = await fetchAllTickets(); } catch { return out; }
  const fromMs = Date.parse(fromISO) || 0;
  for (const t of rows) {
    const cur = out.get(t.entityId) || { active: 0, closed: 0 };
    if (isActive(t)) cur.active++;
    else if (closedInWindow(t, fromMs)) cur.closed++;
    out.set(t.entityId, cur);
  }
  return out;
}

function summarize(mine: LinearTicket[], fromMs: number) {
  const byClass: Record<string, { active: number; closed: number }> = {};
  let activeTotal = 0, closedTotal = 0;
  for (const t of mine) {
    const a = isActive(t), c = !a && closedInWindow(t, fromMs);
    if (!a && !c) continue;
    (byClass[t.classification || "Other"] ||= { active: 0, closed: 0 });
    if (a) { byClass[t.classification || "Other"].active++; activeTotal++; }
    else { byClass[t.classification || "Other"].closed++; closedTotal++; }
  }
  const by_classification = Object.entries(byClass)
    .map(([classification, v]) => ({ classification, active: v.active, closed: v.closed }))
    .sort((a, b) => (b.active + b.closed) - (a.active + a.closed));
  const recent_active = mine.filter(isActive)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10)
    .map((t) => ({ identifier: t.identifier, title: t.title, state: t.state, classification: t.classification, url: t.url, created: t.createdAt.slice(0, 10) }));
  return { active_total: activeTotal, closed_in_window_total: closedTotal, by_classification, recent_active };
}

const CLASS_NOTE = "classification is the Linear ticket type: Churn Ticket, Retention Risk Alert, Subscription Support Ticket, paid_user_offboarding, Subscription_Cancellation. 'active' = state Todo/In Progress/In Review (write-off/refund titles excluded); 'closed' = completed within window_days.";

/** Tickets for ONE account, by classification (active + closed-in-window). */
export async function getAccountTickets(entityId: string, windowDays = 30) {
  const id = (entityId || "").trim().toLowerCase();
  if (!id) return { available: false as const, reason: "no entity_id" };
  const days = Math.min(Math.max(windowDays, 1), 365);
  try {
    const all = await fetchAllTickets();
    const mine = all.filter((t) => t.entityId === id);
    const fromMs = Date.now() - days * 86400000;
    return { window_days: days, ...summarize(mine, fromMs), classification_note: CLASS_NOTE };
  } catch (e) {
    return { available: false as const, reason: `tickets fetch failed: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
}

/** Tickets across MANY accounts (a manager's book) in one pass. */
export async function getManagerTickets(entityIds: string[], windowDays = 30) {
  const ids = new Set(entityIds.map((e) => (e || "").trim().toLowerCase()).filter(Boolean));
  if (!ids.size) return { available: false as const, reason: "no accounts for this manager" };
  const days = Math.min(Math.max(windowDays, 1), 365);
  try {
    const all = await fetchAllTickets();
    const mine = all.filter((t) => ids.has(t.entityId));
    const fromMs = Date.now() - days * 86400000;
    return { window_days: days, ...summarize(mine, fromMs), classification_note: CLASS_NOTE };
  } catch (e) {
    return { available: false as const, reason: `tickets fetch failed: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
}
