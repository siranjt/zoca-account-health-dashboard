import "server-only";
import { queryAurora } from "@/lib/metabase";
import { getLatestActiveTicketByEntity } from "@/lib/tickets";
import { getBaseSheet, lookupBaseSheet } from "@/lib/basesheet";

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
  engagement: VoidEngagement | null; // product usage in the last 30d (null if unavailable)
  recovery: VoidRecovery; // recoverability tier/score derived from all the signals above
}

export interface VoidEngagement { appDays: number; leadViews: number; leads30: number; gbp30: number; reviews30: number }
export interface VoidFactor { text: string; kind: "plus" | "minus" | "info"; points?: number }
export interface VoidAxes { relationship: number; mechanism: number; freshness: number; engagement: number }
export const AXIS_MAX: VoidAxes = { relationship: 35, mechanism: 15, freshness: 20, engagement: 30 };
export interface VoidRecovery {
  tier: "A" | "B" | "C" | "D"; score: number; action: string; engaged: boolean;
  axes: VoidAxes; factors: VoidFactor[]; headline: string;
}

// Recoverability of a missed payment, scored 0–100 across four axes — all from
// data the row already carries plus 30-day product engagement. Rule-based and
// explainable on purpose (no black box): relationship (sub status − churn/exit
// tickets), payment mechanism (ACH in-flight > auto-retry ≈ invoice terms),
// freshness (days overdue, chronic penalty), engagement (app opens + lead work).
// Overrides: ACH in-flight → A; cancelled/offboarding → D; open churn ticket on
// a live sub → C (collect before they leave). Returns the axis subtotals and the
// specific plus/minus factors so the Rogues explainer can show WHY, not just what.
// Validated against the live book 2026-08 (docs/tasks + the standalone scorer).
const EXIT_TICKETS = new Set(["Subscription_Cancellation", "paid_user_offboarding"]);
export function recoverability(inv: VoidInvoice, eng: VoidEngagement | null): VoidRecovery {
  const sub = inv.subStatus;
  const tk = inv.ticket?.classification || "";
  const isExit = EXIT_TICKETS.has(tk);
  const F: VoidFactor[] = [];

  // relationship
  let rel = sub === "active" ? 35 : sub === "non_renewing" ? 22 : sub === "cancelled" ? 3 : 10;
  if (sub === "active") F.push({ text: "Subscription is active — still a paying customer", kind: "plus", points: 35 });
  else if (sub === "non_renewing") F.push({ text: "Subscription set to not renew — still live through this billing period", kind: "info", points: 22 });
  else if (sub === "cancelled") F.push({ text: "Subscription is cancelled — the relationship has ended", kind: "minus", points: 3 });
  else F.push({ text: "Subscription status unknown", kind: "info", points: 10 });
  if (tk === "Churn Ticket") { rel -= 25; F.push({ text: "Open churn ticket in Linear — actively leaving", kind: "minus", points: -25 }); }
  else if (isExit) { rel -= 25; F.push({ text: `Open ${tk.replace(/_/g, " ")} ticket — exit already in motion`, kind: "minus", points: -25 }); }
  else if (tk === "Retention Risk Alert") { rel -= 10; F.push({ text: "Retention-risk alert open — relationship is wobbling", kind: "minus", points: -10 }); }
  else if (tk === "Subscription Support Ticket") F.push({ text: "Open support ticket — an issue, not an exit signal", kind: "info" });
  rel = Math.max(0, rel);

  // mechanism
  const mech = inv.achInFlight ? 15 : inv.autoCollection === "on" ? 10 : 7;
  if (inv.achInFlight) F.push({ text: "A bank payment (ACH) is already in flight — money is on its way", kind: "plus", points: 15 });
  else if (inv.autoCollection === "on") F.push({ text: "Card on file, auto-collect on — dunning will retry the charge", kind: "plus", points: 10 });
  else F.push({ text: "Invoice-terms billing (auto-collect off) — normal here, needs a manual nudge", kind: "info", points: 7 });

  // freshness
  const d = inv.daysOverdue ?? 0;
  let fr = d <= 14 ? 20 : d <= 30 ? 15 : d <= 60 ? 9 : d <= 90 ? 4 : 2;
  const freshWord = d <= 14 ? "Fresh" : d <= 30 ? "Recent" : d <= 60 ? "Aging" : d <= 90 ? "Stale" : "Aged";
  F.push({ text: `${freshWord} — ${d} day${d === 1 ? "" : "s"} overdue`, kind: d <= 30 ? "plus" : d <= 60 ? "info" : "minus", points: fr });
  if (inv.multiMonth) { fr = Math.max(0, fr - 6); F.push({ text: "Chronic — owing across two or more months", kind: "minus", points: -6 }); }

  // engagement
  const appDays = eng?.appDays ?? 0, leadViews = eng?.leadViews ?? 0, leads30 = eng?.leads30 ?? 0;
  const work = leadViews + leads30;
  const eApp = appDays >= 8 ? 12 : appDays >= 1 ? 7 : 0;
  const eLead = work >= 5 ? 10 : work >= 1 ? 6 : 0;
  const eProf = (eng?.gbp30 ?? 0) > 0 || (eng?.reviews30 ?? 0) > 0 ? 8 : 0;
  const engScore = Math.min(30, eApp + eLead + eProf);
  if (!eng) F.push({ text: "No product-usage data for this account", kind: "info" });
  else {
    if (appDays >= 1) F.push({ text: `Opening the app — ${appDays} active day${appDays === 1 ? "" : "s"} in the last 30`, kind: "plus", points: eApp });
    else F.push({ text: "Has not opened the app in the last 30 days", kind: "minus" });
    if (work >= 1) F.push({ text: `Working leads — ${leadViews} in-app lead views, ${leads30} new leads (30d)`, kind: "plus", points: eLead });
    else F.push({ text: "No lead activity in the last 30 days", kind: "minus" });
    if (eProf) F.push({ text: "Profile still producing — GBP interactions / reviews in 30d", kind: "plus", points: 8 });
  }

  const score = Math.max(0, Math.min(100, rel + mech + fr + engScore));
  let tier: VoidRecovery["tier"];
  if (inv.achInFlight) tier = "A";
  else if (sub === "cancelled" || isExit) tier = "D";
  else {
    tier = score >= 70 ? "A" : score >= 45 ? "B" : score >= 25 ? "C" : "D";
    if (tk === "Churn Ticket" && (tier === "A" || tier === "B")) tier = "C";
  }
  const action = { A: "Confirm / auto-retry", B: "Outreach · resend invoice", C: "Collect before churn", D: "Final demand or write off" }[tier];
  const dormant = !!eng && appDays === 0 && work === 0;
  const headline = tier === "A"
    ? "Live customer, a working payment path, and still actively using the product — most likely a billing hiccup to recover."
    : tier === "B"
    ? "Still a live, real customer; the payment has stalled on a fixable reason — a nudge should clear it."
    : tier === "C"
    ? "Technically still subscribed but actively churning — collect this balance now, before they leave."
    : sub === "cancelled" || isExit
    ? "The relationship has ended — pursue as a final demand or write it off; not worth save-effort."
    : dormant
    ? "Subscribed on paper but dormant — not opening the app or working leads — treat as a likely write-off."
    : "Too little left to justify chasing — treat as a write-off unless something changes.";
  return { tier, score, action, engaged: appDays > 0 || work > 0, axes: { relationship: rel, mechanism: mech, freshness: fr, engagement: engScore }, factors: F, headline };
}

const SQL = `WITH sub AS (SELECT id, custom_fields::jsonb->>'cf_entity_id' AS eid, status AS sub_status,
      to_char(cancelled_at,'YYYY-MM-DD') AS cancelling_at FROM chargebee.subscriptions),
  ach AS (SELECT DISTINCT li.invoice_id FROM chargebee.transactions t
    JOIN chargebee.transactions__linked_invoices li ON li._sdc_source_key_id = t.id
    WHERE t.status='in_progress'),
  loc AS (SELECT entity_id, storefront_address->>'administrative_area' AS state FROM gbp.locations),
  en AS (SELECT entity_id, name AS ename FROM entities.locations),
  hub AS (SELECT DISTINCT ON (property_location_entity_id) property_location_entity_id AS eid, NULLIF(properties__am_name,'') AS hub_am
    FROM hubspot_stitch.locations WHERE property_location_entity_id IS NOT NULL
    ORDER BY property_location_entity_id, property_hs_lastmodifieddate DESC NULLS LAST)
  SELECT i.id AS invoice_id, i.status,
    round(i.amount_due/100.0, 2) AS amount_due, round(i.total/100.0, 2) AS total,
    i.currency_code, to_char(i.date,'YYYY-MM-DD') AS inv_date, to_char(i.date,'FMMonth YYYY') AS inv_month,
    to_char(i.due_date,'YYYY-MM-DD') AS due_date,
    CASE WHEN i.due_date IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - i.due_date::timestamp))/86400))::int END AS days_overdue,
    i.customer_id, sub.eid AS entity_id, sub.sub_status, sub.cancelling_at,
    COALESCE(hs.gbp_title, en.ename, cust.company, NULLIF(TRIM(CONCAT_WS(' ', cust.first_name, cust.last_name)),'')) AS biz,
    hs.am_name, hub.hub_am, hs.health_tier, loc.state,
    cust.first_name, cust.company, cust.phone, cust.email, cust.auto_collection,
    (ach.invoice_id IS NOT NULL) AS ach_in_flight,
    (hs.entity_id IS NOT NULL) AS in_book
  FROM chargebee.invoices i
  LEFT JOIN sub  ON sub.id = i.subscription_id
  LEFT JOIN cx.health_score hs ON hs.entity_id::text = sub.eid
  LEFT JOIN chargebee.customers cust ON cust.id = i.customer_id
  LEFT JOIN loc  ON loc.entity_id::text = sub.eid
  LEFT JOIN en   ON en.entity_id::text = sub.eid
  LEFT JOIN hub  ON hub.eid = sub.eid
  LEFT JOIN ach  ON ach.invoice_id = i.id
  WHERE i.status IN ('payment_due','not_paid')
    AND i.date >= date_trunc('month', now()) - interval '4 months'
  ORDER BY i.date DESC NULLS LAST, i.amount_due DESC NULLS LAST`;

const TTL_MS = 5 * 60_000; // 5 min
let cache: { at: number; rows: VoidInvoice[] } | null = null;
let inflight: Promise<VoidInvoice[]> | null = null;

// 30-day product engagement per entity — app opens + in-app lead work (Mixpanel)
// and profile output (GBP interactions, leads, reviews). Entity-scoped to the
// unpaid book and windowed, per the big-table rule. Degrades to an empty map on
// any failure so recoverability still scores (engagement just contributes 0).
async function getEngagementByEntity(ids: string[]): Promise<Map<string, VoidEngagement>> {
  const m = new Map<string, VoidEngagement>();
  const clean = ids.filter((e) => /^[0-9a-fA-F-]{36}$/.test(e)); // only well-formed uuids (::uuid cast safety)
  if (!clean.length) return m;
  const inlist = clean.map((e) => `'${e}'`).join(",");
  const APP = `SELECT "locationEntityId" eid,
      COUNT(DISTINCT time::date) FILTER (WHERE event='Home-View-Home') app_days,
      SUM((event LIKE 'Leads-%')::int) lead_views
    FROM mixpanelzocaappdata.export
    WHERE time >= CURRENT_DATE - INTERVAL '30 days' AND "locationEntityId" IN (${inlist})
      AND (event='Home-View-Home' OR event LIKE 'Leads-%') GROUP BY 1`;
  const PROF = `WITH l AS (SELECT entity_id, COUNT(*) c FROM website.booking_enquiries WHERE is_test_lead=false AND created_at>=now()-interval '30 days' AND entity_id::text IN (${inlist}) GROUP BY 1),
    r AS (SELECT entity_id, COUNT(*) c FROM reviews.reviews WHERE is_deleted=false AND review_time>=now()-interval '30 days' AND entity_id::text IN (${inlist}) GROUP BY 1),
    g AS (SELECT gl.entity_id, SUM(m.website_clicks+m.call_clicks+m.business_direction_requests) c FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE m.metrics_timestamp>=now()-interval '30 days' AND gl.entity_id::text IN (${inlist}) GROUP BY 1)
    SELECT e.eid::text eid, COALESCE(l.c,0) leads30, COALESCE(r.c,0) reviews30, COALESCE(g.c,0) gbp30
    FROM (SELECT unnest(ARRAY[${inlist}])::uuid eid) e
    LEFT JOIN l ON l.entity_id=e.eid LEFT JOIN r ON r.entity_id=e.eid LEFT JOIN g ON g.entity_id=e.eid`;
  const num = (v: unknown) => Number(v) || 0;
  try {
    const [appRows, profRows] = await Promise.all([queryAurora(APP), queryAurora(PROF)]);
    for (const r of appRows) m.set(String(r.eid), { appDays: num(r.app_days), leadViews: num(r.lead_views), leads30: 0, gbp30: 0, reviews30: 0 });
    for (const r of profRows) {
      const e = String(r.eid);
      const cur = m.get(e) || { appDays: 0, leadViews: 0, leads30: 0, gbp30: 0, reviews30: 0 };
      cur.leads30 = num(r.leads30); cur.reviews30 = num(r.reviews30); cur.gbp30 = num(r.gbp30);
      m.set(e, cur);
    }
  } catch (e) {
    console.warn("[void] engagement fetch failed; scoring without engagement:", String((e as Error)?.message || e).slice(0, 120));
  }
  return m;
}

export async function getVoidInvoices(refresh = false): Promise<VoidInvoice[]> {
  if (!refresh && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  if (!refresh && inflight) return inflight;
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  inflight = (async () => {
    const [rows, ticketsByEntity, baseSheet] = await Promise.all([queryAurora(SQL), getLatestActiveTicketByEntity(), getBaseSheet()]);

    let out: VoidInvoice[] = rows.map((r) => {
      const entityId = (r.entity_id as string) || null;
      const customerId = (r.customer_id as string) || null;
      const t = entityId ? ticketsByEntity.get(entityId.toLowerCase()) : undefined;
      // BaseSheet fills blanks only (never overrides an existing DB value).
      const bs = lookupBaseSheet(baseSheet, entityId, customerId);
      const biz = (r.biz as string) || bs?.bizname || null;
      // AM: health-score → BaseSheet (both canonical, "Hubern C") → HubSpot
      // (outlier full names like "Hubern Ralph Clements") → unassigned.
      const amName = (r.am_name as string) || bs?.amName || (r.hub_am as string) || "(unassigned)";
      const phone = (r.phone as string) || bs?.phone || null;
      const email = (r.email as string) || bs?.email || null;
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
        customerId,
        entityId,
        biz,
        amName,
        healthTier: (r.health_tier as string) || null,
        state: (r.state as string) || null,
        firstName: (r.first_name as string) || null,
        company: (r.company as string) || null,
        phone,
        email,
        autoCollection: (r.auto_collection as string) || null,
        subStatus: (r.sub_status as string) || null,
        cancellingAt: (r.cancelling_at as string) || null,
        achInFlight: r.ach_in_flight === true,
        ticket: t ? { identifier: t.identifier, title: t.title, url: t.url, classification: t.classification || "" } : null,
        multiMonth: false, // filled below
        inBook: r.in_book === true,
        engagement: null, // filled below
        recovery: { tier: "D", score: 0, action: "", engaged: false, axes: { relationship: 0, mechanism: 0, freshness: 0, engagement: 0 }, factors: [], headline: "" }, // filled below
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

    // Engagement + recoverability: fetch 30d product usage for the book's entities,
    // then score each invoice (degrades gracefully — no engagement ⇒ still scored).
    const entityIds = [...new Set(out.map((r) => r.entityId).filter((e): e is string => !!e))];
    const engByEntity = await getEngagementByEntity(entityIds);
    out = out.map((r) => {
      const eng = r.entityId ? engByEntity.get(r.entityId) ?? null : null;
      return { ...r, engagement: eng, recovery: recoverability(r, eng) };
    });

    cache = { at: Date.now(), rows: out };
    return out;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Restrict the unpaid book to what a viewer may see. AMs see ONLY invoices whose
 *  resolved AM matches their own roster name (exact match, same rule as
 *  scopeAccounts); an AM with no amName sees nothing (fail-closed). Managers and
 *  admins see the whole book. This is the security boundary — always apply it
 *  server-side, never rely on the client's filters. */
export function scopeVoidInvoices(rows: VoidInvoice[], viewer: { role: string | null; amName: string | null }): VoidInvoice[] {
  if (viewer.role === "am") {
    return viewer.amName ? rows.filter((r) => r.amName === viewer.amName) : [];
  }
  return rows;
}
