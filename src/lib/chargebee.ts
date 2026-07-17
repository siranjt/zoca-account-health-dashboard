import "server-only";
import { getSql, neonUrl } from "@/lib/neon";

// Chargebee billing client for Alfred (Batch 2). Zoca's Chargebee does NOT
// expose cf_entity_id as a filterable field, so we resolve entity_id →
// Chargebee customer_id from beacon's Neon snapshot (dashboard_snapshots —
// the same map beacon's own billing tool uses), cached module-level with a
// TTL. Then we pull the subscription/invoices/transactions per customer from
// Chargebee on demand. Read-only.

const SITE = process.env.CHARGEBEE_SITE || "zoca";
const KEY = process.env.CHARGEBEE_API_KEY || "";
const BASE = `https://${SITE}.chargebee.com/api/v2`;
const TIMEOUT_MS = 12_000;
const MAP_TTL_MS = 60 * 60 * 1000; // 1h

function authHeader() {
  return { Authorization: "Basic " + Buffer.from(`${KEY}:`).toString("base64") };
}

async function cbGet<T = Record<string, unknown>>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!KEY) throw new Error("CHARGEBEE_API_KEY not set");
  const qs = new URLSearchParams(params).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}${qs ? "?" + qs : ""}`, { headers: authHeader(), signal: ctrl.signal });
    if (!res.ok) throw new Error(`Chargebee ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const dollars = (c: number | null | undefined) => (c && Number.isFinite(c) ? Math.round(c) / 100 : 0);
const isoDate = (t: number | null | undefined) => (t && Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 10) : null);

// entity_id → Chargebee customer_id, from beacon's latest Neon snapshot.
let cache: { map: Map<string, string>; builtAt: number } | null = null;
let building: Promise<Map<string, string>> | null = null;

async function buildMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!neonUrl()) return map;
  const rows = (await getSql()`
    SELECT customer_data FROM dashboard_snapshots ORDER BY snapshot_date DESC LIMIT 1
  `) as Array<{ customer_data: unknown }>;
  const raw = rows?.[0]?.customer_data;
  const snap = (typeof raw === "string" ? JSON.parse(raw) : raw) as { customers?: Array<{ entity_id?: string; customer_id?: string }> } | null;
  for (const c of snap?.customers || []) {
    const eid = (c.entity_id || "").trim();
    if (eid && c.customer_id) map.set(eid, c.customer_id);
  }
  return map;
}

async function ensureMap(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.builtAt < MAP_TTL_MS) return cache.map;
  if (building) return building;
  building = buildMap()
    .then((map) => { cache = { map, builtAt: Date.now() }; return map; })
    .finally(() => { building = null; });
  return building;
}

export type BillingResult =
  | { found: false; reason: string }
  | {
      found: true;
      customer_id: string;
      total_mrr_usd: number;
      active_subscription_count: number;
      subscriptions: Array<{ status: string; mrr_usd: number; plan_amount_usd: number; plan_id: string | null; next_renewal: string | null }>;
      next_renewal: string | null;
      auto_collection: string | null;
      net_term_days: number | null;
      email: string | null;
      unpaid_count: number;
      unpaid_total_usd: number;
      failed_txn_count_recent: number;
      last_failed: { date: string | null; amount_usd: number; error: string | null } | null;
      invoices: Array<{ status: string; total_usd: number; amount_due_usd: number; date: string | null; due_date: string | null; days_overdue: number }>;
    };

export async function getBillingByEntityId(entityId: string): Promise<BillingResult> {
  if (!KEY) return { found: false, reason: "Chargebee is not configured (CHARGEBEE_API_KEY missing)." };
  const eid = (entityId || "").trim();
  if (!eid) return { found: false, reason: "no entity_id" };

  const map = await ensureMap();
  const cid = map.get(eid);
  if (!cid) return { found: false, reason: "no Chargebee customer bound to this account (entity not on the latest snapshot)." };

  // A Chargebee customer can hold several subscriptions (one per location).
  // Pick the one bound to THIS entity by its cf_entity_id, not just any active.
  const [custRes, subRes] = await Promise.all([
    cbGet<{ customer: { email?: string; auto_collection?: string; net_term_days?: number } }>(`/customers/${cid}`),
    cbGet<{ list: Array<{ subscription: { id: string; status: string; cf_entity_id?: string; mrr?: number; plan_amount?: number; plan_id?: string; current_term_end?: number } }> }>("/subscriptions", { "customer_id[is]": cid, limit: "20" }),
  ]);
  const cust = custRes.customer || {};
  const allSubs = (subRes.list || []).map((x) => x.subscription);
  // An entity can hold MORE THAN ONE subscription (multiple products/plans),
  // all tagged with the same cf_entity_id — sum them for the true MRR.
  let entitySubs = allSubs.filter((s) => (s.cf_entity_id || "").trim() === eid);
  if (!entitySubs.length) entitySubs = allSubs; // fallback: whole customer
  const activeSubs = entitySubs.filter((s) => s.status === "active");
  const forMrr = activeSubs.length ? activeSubs : entitySubs;
  const totalMrr = forMrr.reduce((s, x) => s + dollars(x.mrr), 0);
  const nextRenewal = forMrr
    .map((s) => s.current_term_end)
    .filter((t): t is number => !!t)
    .sort((a, b) => a - b)[0];

  // Scope invoices/transactions to this entity's subscriptions (subscription_id[in]).
  const subIds = entitySubs.map((s) => s.id).filter(Boolean);
  const scope: Record<string, string> = subIds.length ? { "subscription_id[in]": JSON.stringify(subIds) } : { "customer_id[is]": cid };
  const [invRes, txnRes] = await Promise.all([
    cbGet<{ list: Array<{ invoice: { status: string; total?: number; amount_due?: number; date?: number; due_date?: number } }> }>("/invoices", { ...scope, limit: "12", "sort_by[desc]": "date" }),
    cbGet<{ list: Array<{ transaction: { status: string; amount?: number; date?: number; error_text?: string } }> }>("/transactions", { ...scope, limit: "12", "sort_by[desc]": "date" }),
  ]);
  const invoices = (invRes.list || []).map(({ invoice: i }) => {
    const dueMs = i.due_date ? i.due_date * 1000 : null;
    const daysOverdue = dueMs && i.status !== "paid" ? Math.max(0, Math.floor((Date.now() - dueMs) / 86400000)) : 0;
    return { status: i.status, total_usd: dollars(i.total), amount_due_usd: dollars(i.amount_due), date: isoDate(i.date), due_date: isoDate(i.due_date), days_overdue: daysOverdue };
  });
  const txns = (txnRes.list || []).map(({ transaction: t }) => ({ status: t.status, amount_usd: dollars(t.amount), date: isoDate(t.date), error: t.error_text || null }));

  const unpaid = invoices.filter((i) => i.status !== "paid" && i.amount_due_usd > 0);
  const failed = txns.filter((t) => t.status === "failure");

  return {
    found: true,
    customer_id: cid,
    total_mrr_usd: Math.round(totalMrr * 100) / 100,
    active_subscription_count: activeSubs.length,
    subscriptions: entitySubs.map((s) => ({ status: s.status, mrr_usd: dollars(s.mrr), plan_amount_usd: dollars(s.plan_amount), plan_id: s.plan_id || null, next_renewal: isoDate(s.current_term_end) })),
    next_renewal: isoDate(nextRenewal),
    auto_collection: cust.auto_collection || null,
    net_term_days: cust.net_term_days ?? null,
    email: cust.email || null,
    unpaid_count: unpaid.length,
    unpaid_total_usd: Math.round(unpaid.reduce((s, i) => s + i.amount_due_usd, 0) * 100) / 100,
    failed_txn_count_recent: failed.length,
    last_failed: failed[0] ? { date: failed[0].date, amount_usd: failed[0].amount_usd, error: failed[0].error } : null,
    invoices: invoices.slice(0, 6),
  };
}
