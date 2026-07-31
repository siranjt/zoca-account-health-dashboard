import "server-only";
import { queryAurora } from "@/lib/metabase";
import { getLatestActiveTicketByEntity } from "@/lib/tickets";

// ===========================================================================
// Void — the unpaid-invoice book (admin), a faithful port of the Beacon "Miss
// Payment" surface into CAVE//OS, but Aurora-native: reads chargebee.* synced
// tables via Metabase instead of a live Chargebee API walk.
//
// Each invoice resolves to its entity via the SUBSCRIPTION's cf_entity_id, NOT
// customer_id — one Chargebee customer can own up to 9 location entities, so a
// customer-level join smears a multi-location customer's invoices across all its
// locations (the Beacon's MP-MULTILOC-BUG). Off-book invoices (churned/unmapped
// accounts still owing) are kept. The latest active Linear ticket per entity and
// the multi-month flag are joined in JS, mirroring the Beacon's enrich.ts.
// ===========================================================================

export interface VoidTicket { identifier: string; title: string; url: string; classification: string }

export interface VoidInvoice {
  invoiceId: string;
  status: string; // payment_due | not_paid
  amountDue: number | null;
  total: number | null;
  currency: string | null;
  invDate: string | null;
  invoiceMonth: string | null; // "Jul 2026" — tab axis
  dueDate: string | null;
  daysOverdue: number | null;
  customerId: string | null;
  entityId: string | null;
  biz: string | null;
  amName: string | null;
  healthTier: string | null;
  state: string | null;
  firstName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  autoCollection: string | null; // "on" | "off"
  subStatus: string | null; // active | non_renewing | cancelled | ...
  cancellingAt: string | null;
  achInFlight: boolean;
  ticket: VoidTicket | null;
  multiMonth: boolean;
  inBook: boolean; // resolved to an active cx.health_score account
}

const SQL = `WITH sub AS (SELECT id, custom_fields::jsonb->>'cf_entity_id' AS eid, status AS sub_status,
      to_char(cancelled_at,'YYYY-MM-DD') AS cancelling_at FROM chargebee.subscriptions),
  ach AS (SELECT DISTINCT li.invoice_id FROM chargebee.transactions t
    JOIN chargebee.transactions__linked_invoices li ON li._sdc_source_key_id = t.id
    WHERE t.status='in_progress'),
  loc AS (SELECT entity_id, storefront_address->>'administrative_area' AS state FROM gbp.locations)
  SELECT i.id AS invoice_id, i.status,
    round(i.amount_due/100.0, 2) AS amount_due, round(i.total/100.0, 2) AS total,
    i.currency_code, to_char(i.date,'YYYY-MM-DD') AS inv_date, to_char(i.date,'FMMonth YYYY') AS inv_month,
    to_char(i.due_date,'YYYY-MM-DD') AS due_date,
    CASE WHEN i.due_date IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - i.due_date::timestamp))/86400))::int END AS days_overdue,
    i.customer_id, sub.eid AS entity_id, sub.sub_status, sub.cancelling_at,
    COALESCE(hs.gbp_title, cust.company, NULLIF(TRIM(CONCAT_WS(' ', cust.first_name, cust.last_name)),'')) AS biz,
    hs.am_name, hs.health_tier, loc.state,
    cust.first_name, cust.company, cust.phone, cust.email, cust.auto_collection,
    (ach.invoice_id IS NOT NULL) AS ach_in_flight,
    (hs.entity_id IS NOT NULL) AS in_book
  FROM chargebee.invoices i
  LEFT JOIN sub  ON sub.id = i.subscription_id
  LEFT JOIN cx.health_score hs ON hs.entity_id::text = sub.eid
  LEFT JOIN chargebee.customers cust ON cust.id = i.customer_id
  LEFT JOIN loc  ON loc.entity_id::text = sub.eid
  LEFT JOIN ach  ON ach.invoice_id = i.id
  WHERE i.status IN ('payment_due','not_paid')
    AND i.date >= date_trunc('month', now()) - interval '4 months'
  ORDER BY i.amount_due DESC NULLS LAST`;

const TTL_MS = 5 * 60_000; // 5 min
let cache: { at: number; rows: VoidInvoice[] } | null = null;
let inflight: Promise<VoidInvoice[]> | null = null;

export async function getVoidInvoices(refresh = false): Promise<VoidInvoice[]> {
  if (!refresh && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  if (!refresh && inflight) return inflight;
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  inflight = (async () => {
    const [rows, ticketsByEntity] = await Promise.all([queryAurora(SQL), getLatestActiveTicketByEntity()]);

    let out: VoidInvoice[] = rows.map((r) => {
      const entityId = (r.entity_id as string) || null;
      const t = entityId ? ticketsByEntity.get(entityId.toLowerCase()) : undefined;
      return {
        invoiceId: String(r.invoice_id),
        status: (r.status as string) || "",
        amountDue: num(r.amount_due),
        total: num(r.total),
        currency: (r.currency_code as string) || null,
        invDate: (r.inv_date as string) || null,
        invoiceMonth: (r.inv_month as string) || null,
        dueDate: (r.due_date as string) || null,
        daysOverdue: r.days_overdue == null ? null : Number(r.days_overdue),
        customerId: (r.customer_id as string) || null,
        entityId,
        biz: (r.biz as string) || null,
        amName: (r.am_name as string) || null,
        healthTier: (r.health_tier as string) || null,
        state: (r.state as string) || null,
        firstName: (r.first_name as string) || null,
        company: (r.company as string) || null,
        phone: (r.phone as string) || null,
        email: (r.email as string) || null,
        autoCollection: (r.auto_collection as string) || null,
        subStatus: (r.sub_status as string) || null,
        cancellingAt: (r.cancelling_at as string) || null,
        achInFlight: r.ach_in_flight === true,
        ticket: t ? { identifier: t.identifier, title: t.title, url: t.url, classification: t.classification || "" } : null,
        multiMonth: false, // filled below
        inBook: r.in_book === true,
      };
    });

    // Multi-month: an account (entity, else customer) owing >= 2 distinct months.
    const monthsByKey = new Map<string, Set<string>>();
    for (const r of out) {
      const key = r.entityId || r.customerId || r.invoiceId;
      if (!r.invoiceMonth) continue;
      (monthsByKey.get(key) ?? monthsByKey.set(key, new Set()).get(key)!).add(r.invoiceMonth);
    }
    out = out.map((r) => ({ ...r, multiMonth: (monthsByKey.get(r.entityId || r.customerId || r.invoiceId)?.size ?? 0) >= 2 }));

    cache = { at: Date.now(), rows: out };
    return out;
  })().finally(() => { inflight = null; });
  return inflight;
}
