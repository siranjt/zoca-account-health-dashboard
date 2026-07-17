import "server-only";

// Chargebee billing client for Alfred (Batch 2). Zoca's Chargebee does NOT
// expose cf_entity_id as a filterable field, and it lives on the SUBSCRIPTION
// (not the customer). So we page all subscriptions once to build an
// entity_id → {subscription, customer_id} map, cache it module-level with a
// TTL, then pull invoices/transactions per customer on demand. Read-only.

const SITE = process.env.CHARGEBEE_SITE || "zoca";
const KEY = process.env.CHARGEBEE_API_KEY || "";
const BASE = `https://${SITE}.chargebee.com/api/v2`;
const TIMEOUT_MS = 12_000;
const MAP_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_PAGES = 40;

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

type SubEntry = { sub_id: string; customer_id: string; status: string; mrr?: number; plan_amount?: number; plan_id?: string; current_term_end?: number };

type CbSub = { id: string; customer_id: string; status: string; cf_entity_id?: string; mrr?: number; plan_amount?: number; plan_id?: string; current_term_end?: number };

let cache: { map: Map<string, SubEntry>; builtAt: number } | null = null;
let building: Promise<Map<string, SubEntry>> | null = null;

async function buildMap(): Promise<Map<string, SubEntry>> {
  const map = new Map<string, SubEntry>();
  let offset: string | undefined;
  let pages = 0;
  do {
    const params: Record<string, string> = { limit: "100", "sort_by[asc]": "created_at" };
    if (offset) params.offset = offset;
    const j = await cbGet<{ list: Array<{ subscription: CbSub }>; next_offset?: string }>("/subscriptions", params);
    for (const { subscription: s } of j.list || []) {
      const eid = (s.cf_entity_id || "").trim();
      if (!eid) continue;
      const prev = map.get(eid);
      // Prefer an active subscription over trial/cancelled/future.
      if (!prev || (s.status === "active" && prev.status !== "active")) {
        map.set(eid, { sub_id: s.id, customer_id: s.customer_id, status: s.status, mrr: s.mrr, plan_amount: s.plan_amount, plan_id: s.plan_id, current_term_end: s.current_term_end });
      }
    }
    offset = j.next_offset;
    pages++;
  } while (offset && pages < MAX_PAGES);
  return map;
}

async function ensureMap(): Promise<Map<string, SubEntry>> {
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
      subscription: { status: string; mrr_usd: number; plan_amount_usd: number; plan_id: string | null; next_renewal: string | null };
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
  const entry = map.get(eid);
  if (!entry) return { found: false, reason: "no Chargebee subscription bound to this account (cf_entity_id not found)." };

  const cid = entry.customer_id;
  const [custRes, invRes, txnRes] = await Promise.all([
    cbGet<{ customer: { email?: string; auto_collection?: string; net_term_days?: number } }>(`/customers/${cid}`),
    cbGet<{ list: Array<{ invoice: { status: string; total?: number; amount_due?: number; date?: number; due_date?: number } }> }>("/invoices", { "customer_id[is]": cid, limit: "12", "sort_by[desc]": "date" }),
    cbGet<{ list: Array<{ transaction: { status: string; amount?: number; date?: number; error_text?: string } }> }>("/transactions", { "customer_id[is]": cid, limit: "12", "sort_by[desc]": "date" }),
  ]);

  const cust = custRes.customer || {};
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
    subscription: { status: entry.status, mrr_usd: dollars(entry.mrr), plan_amount_usd: dollars(entry.plan_amount), plan_id: entry.plan_id || null, next_renewal: isoDate(entry.current_term_end) },
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
