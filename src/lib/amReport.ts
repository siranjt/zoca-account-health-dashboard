import "server-only";
import Papa from "papaparse";
import {
  queryAurora,
  runMetabaseCard,
  fetchPublicQuestionCsv,
  fetchPublicDashcard,
} from "@/lib/metabase";
import { listSubscriptions, listInvoices, chargebeeConfigured, type CbSubscription } from "@/lib/chargebee";
import type { AmDailyRow } from "@/lib/amSnapshot";

// ===========================================================================
// AM daily report — the compute half. Port of ~/scripts/daily_am_report_detailed.py
// (the laptop job that produced the workbook every weekday). Phase 1 owns the
// storage; this file produces the rows it stores.
//
// Every definition below was argued over once and is load-bearing. The four
// that get silently mis-ported:
//
//  1. CHURN IS ACCOUNT-LEVEL. An entity that cancels one of two subscriptions
//     has not churned. 77 subscription cancellations were only 62 churned
//     accounts — subscription-level overstates churn by ~24%.
//  2. churn % is NULL, never 100, when the AM holds no live book. A 100% rate
//     on an empty denominator is arithmetic, not performance, and three of the
//     names it would print have left the company.
//  3. `(unassigned)` is a real row. Churned accounts lose their AM link;
//     ~27 have no AM in either mapping source. Never dropped, never merged.
//  4. UNTOUCHED (HUMAN) EXCLUDES SMS. A bulk SMS campaign reached +800 distinct
//     numbers in four days and cut this metric 182 -> 110 while every genuine
//     one-to-one channel declined. Including SMS lets a marketing send clear
//     the retention work list. (metric_version 1; see AM_METRIC_VERSION.)
//
// Failure policy: this throws rather than returning a partial row set. The
// cron route records the failure in alfred.am_daily_run. A wrong number in the
// only AM history that exists is worse than a visibly failed run.
//
// No message bodies are read anywhere here — counts and timestamps only.
// ===========================================================================

const WINDOW_DAYS = 30;
export const UNASSIGNED = "(unassigned)";

/** Public Metabase question: Linear retention/churn tickets. */
const TICKETS_CSV_UUID = "a3f0ebc6-c0fd-4a0f-a000-2e4d5fd0e781";
/** Public Metabase question: scheduling product (Product ID 10) provisioning. */
const SCHED_CSV_UUID = "6db8275e-a8dd-40ed-8dd1-c0e4825cd307";
/** Public "Scheduling & Payments" dashboard — onboarding status cards. */
const SCHED_DASH = "11a595d9-a40d-4d59-88fd-014879a86672";
const SCHED_ONBOARDED_CARD = { dashcard: 2354, card: 3778 };
const SCHED_INCOMPLETE_CARD = { dashcard: 2352, card: 3768 };
/** The entity-id column on both onboarding cards. Note the U+2192 arrow. */
const LOC_ENTITY_COL = "Locations - Entity → Entity ID";
/** BaseSheet Question: entity_id → am_name. Current assignment, per the owner. */
const AM_CARD_ID = 1335;

/** Same guard the Python used: entity ids are interpolated into SQL, so anything
 *  that is not a plain id never reaches the warehouse. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- Chargebee

interface BookFacts {
  activeEntities: Set<string>;
  mrrOf: Map<string, number>;
  churn30: Set<string>;
  churnMtd: Set<string>;
  missedCount: Map<string, number>;
  missedAmount: Map<string, number>;
}

function entityOf(s: CbSubscription): string | null {
  const e = (s.cf_entity_id || "").trim();
  return e || null;
}

/**
 * The book, straight from Chargebee.
 *
 * The Python walks ~2,700 subscriptions in one 28-page sequential loop, one
 * `curl` process per page, and takes ~180s. Chargebee's `offset` is an opaque
 * cursor so a single stream cannot be parallelised — instead this runs four
 * independent filtered streams at once, which is both faster and narrower:
 * only cancellations inside the reporting window are fetched at all.
 */
async function loadBook(now: number, monthStart: number): Promise<BookFacts> {
  if (!chargebeeConfigured()) throw new Error("CHARGEBEE_API_KEY not set");
  const since30d = now - WINDOW_DAYS * 86400;
  const cancelledSince = Math.min(since30d, monthStart);

  const [active, nonRenewing, cancelled, invoices] = await Promise.all([
    listSubscriptions({ "status[is]": "active" }),
    listSubscriptions({ "status[is]": "non_renewing" }),
    listSubscriptions({ "status[is]": "cancelled", "cancelled_at[after]": String(cancelledSince) }),
    listInvoices({ "status[is]": "payment_due" }),
  ]);

  // "Live" = active or non_renewing, exactly as the workbook counts it.
  const live = [...active, ...nonRenewing];
  const activeEntities = new Set<string>();
  const mrrOf = new Map<string, number>();
  for (const s of live) {
    const e = entityOf(s);
    if (!e) continue;
    activeEntities.add(e);
    // subscription.mrr is Chargebee's normalised monthly value, in cents.
    mrrOf.set(e, (mrrOf.get(e) ?? 0) + (Number(s.mrr) || 0) / 100);
  }

  // ACCOUNT-level churn: cancelled in the window AND holding no live sub.
  const churn30 = new Set<string>();
  const churnMtd = new Set<string>();
  for (const s of cancelled) {
    const e = entityOf(s);
    if (!e || activeEntities.has(e)) continue;
    const at = Number(s.cancelled_at) || 0;
    if (at >= since30d) churn30.add(e);
    if (at >= monthStart) churnMtd.add(e);
  }

  // subscription_id -> entity, for attributing overdue invoices.
  const subEntity = new Map<string, string>();
  for (const s of [...live, ...cancelled]) {
    const e = entityOf(s);
    if (s.id && e) subEntity.set(s.id, e);
  }
  // An account can be live and still owe money on a subscription outside the
  // three streams above (an older cancellation, a paused plan). Resolve those
  // by id rather than dragging the entire cancellation history over the wire.
  const unknown = [
    ...new Set(
      invoices
        .map((i) => i.subscription_id)
        .filter((id): id is string => Boolean(id) && !subEntity.has(id as string)),
    ),
  ];
  if (unknown.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < unknown.length; i += 50) chunks.push(unknown.slice(i, i + 50));
    const found = await Promise.all(
      chunks.map((ids) => listSubscriptions({ "id[in]": JSON.stringify(ids) })),
    );
    for (const s of found.flat()) {
      const e = entityOf(s);
      if (s.id && e) subEntity.set(s.id, e);
    }
  }

  const missedCount = new Map<string, number>();
  const missedAmount = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.deleted) continue;
    const due = Number(inv.amount_due) || 0;
    if (due <= 0) continue;
    const e = inv.subscription_id ? subEntity.get(inv.subscription_id) : undefined;
    if (!e) continue;
    missedCount.set(e, (missedCount.get(e) ?? 0) + 1);
    missedAmount.set(e, (missedAmount.get(e) ?? 0) + due / 100);
  }

  return { activeEntities, mrrOf, churn30, churnMtd, missedCount, missedAmount };
}

// ---------------------------------------------------------------- AM mapping

/**
 * entity_id → AM name. BaseSheet card 1335 first; anything it does not cover
 * falls back to cx.am_mapping → entities.employees. Current assignment, per the
 * owner's decision of 27/07/26 — a churned account is attributed to whoever
 * holds it now, not whoever held it when it cancelled.
 */
async function loadAmMap(interested: Set<string>): Promise<Map<string, string>> {
  const amOf = new Map<string, string>();
  const rows = await runMetabaseCard(AM_CARD_ID);
  for (const r of rows) {
    const e = r.entity_id == null ? "" : String(r.entity_id).trim();
    const a = r.am_name == null ? "" : String(r.am_name).trim();
    if (e && a) amOf.set(e, a);
  }
  if (!amOf.size) throw new Error(`BaseSheet card ${AM_CARD_ID} returned no entity_id/am_name pairs`);

  const missing = [...interested].filter((e) => !amOf.has(e) && SAFE_ID.test(e));
  if (!missing.length) return amOf;

  const ids = missing.map((e) => `'${e}'`).join(",");
  const link = await queryAurora(
    `SELECT entity_id::text AS entity_id, am_entity_id::text AS am_entity_id
       FROM cx.am_mapping WHERE entity_id::text IN (${ids})`,
  );
  const amIds = [
    ...new Set(
      link
        .map((r) => (r.am_entity_id == null ? "" : String(r.am_entity_id)))
        .filter((a) => a && SAFE_ID.test(a)),
    ),
  ];
  if (!amIds.length) return amOf;

  const names = new Map<string, string>();
  const empRows = await queryAurora(
    `SELECT entity_id::text AS entity_id, first_name, last_name
       FROM entities.employees WHERE entity_id::text IN (${amIds.map((a) => `'${a}'`).join(",")})`,
  );
  for (const r of empRows) {
    const n = `${String(r.first_name ?? "")} ${String(r.last_name ?? "")}`.trim();
    if (n) names.set(String(r.entity_id), n);
  }
  for (const r of link) {
    const e = String(r.entity_id);
    const a = r.am_entity_id == null ? "" : String(r.am_entity_id);
    const n = names.get(a);
    if (n) amOf.set(e, n);
  }
  return amOf;
}

// ---------------------------------------------------------------- touch points

/**
 * Channels that count as a HUMAN touch — one-to-one only. SMS is deliberately
 * absent; see the header note. `sms`, `email` and `hubspot` join these for the
 * all-channel figure, which saturates (automated email alone reaches ~92% of
 * the book) and is reported for contrast, not as a work list.
 */
const HUMAN_CHANNELS = ["appchat_staff", "calls", "meetings"] as const;
const ALL_CHANNELS = [...HUMAN_CHANNELS, "sms", "email", "hubspot"] as const;
type Channel = (typeof ALL_CHANNELS)[number];

/**
 * One query per channel, every one entity-scoped to the live book and windowed.
 *
 * The CallHippo and Gmail tables are 200K–800K rows. Joining them with
 * `ON phone = from_ OR phone = to_` hit Metabase's 60s statement timeout and
 * came back with ZERO rows — which reported the entire book as untouched. Both
 * are split into a UNION ALL of two equijoins for that reason.
 *
 * Phone numbers are normalised to the last 10 digits on BOTH sides:
 * entities.phones stores `9105834843`, call_hippo.calls stores `13136376824`.
 */
function touchSql(book: string): Record<Channel, string> {
  const W = `now() - interval '${WINDOW_DAYS} days'`;
  const phones = `SELECT entity_id::text eid, RIGHT(regexp_replace(phone_number,'\\D','','g'),10) ph
                    FROM entities.phones
                   WHERE phone_number IS NOT NULL AND entity_id::text IN (${book})`;
  return {
    // member_type = 'Team Member' is what makes this a STAFF touch rather than
    // the customer talking to themselves. message_body is never selected.
    appchat_staff: `SELECT entity_id::text AS entity_id, MAX(created_at) AS last_at
        FROM chat.app_chat_messages_mv
       WHERE created_at >= ${W} AND member_type='Team Member' AND entity_id::text IN (${book})
       GROUP BY 1`,
    calls: `WITH p AS (${phones}),
        c AS (SELECT RIGHT(regexp_replace(from_::text,'\\D','','g'),10) a,
                     RIGHT(regexp_replace(to_::text,'\\D','','g'),10) b, created_at
                FROM call_hippo.calls WHERE created_at >= ${W})
        SELECT eid AS entity_id, MAX(created_at) AS last_at FROM (
          SELECT p.eid, c.created_at FROM c JOIN p ON p.ph=c.a
          UNION ALL
          SELECT p.eid, c.created_at FROM c JOIN p ON p.ph=c.b) x
        GROUP BY 1`,
    meetings: `SELECT entity_id::text AS entity_id, MAX(created_at) AS last_at
        FROM sales.customer_meetings
       WHERE created_at >= ${W} AND entity_id::text IN (${book})
       GROUP BY 1`,
    sms: `WITH p AS (${phones}),
        m AS (SELECT RIGHT(regexp_replace(from_::text,'\\D','','g'),10) a,
                     RIGHT(regexp_replace(to_::text,'\\D','','g'),10) b, created_at
                FROM call_hippo.messages WHERE created_at >= ${W})
        SELECT eid AS entity_id, MAX(created_at) AS last_at FROM (
          SELECT p.eid, m.created_at FROM m JOIN p ON p.ph=m.a
          UNION ALL
          SELECT p.eid, m.created_at FROM m JOIN p ON p.ph=m.b) x
        GROUP BY 1`,
    email: `WITH e AS (SELECT entity_id::text eid, lower(email_address) ad
                         FROM entities.emails
                        WHERE email_address IS NOT NULL AND entity_id::text IN (${book})),
        g AS (SELECT lower(from_email) f, lower(to_email) t, created_at
                FROM gmail.emails WHERE created_at >= ${W})
        SELECT eid AS entity_id, MAX(created_at) AS last_at FROM (
          SELECT e.eid, g.created_at FROM g JOIN e ON e.ad=g.f
          UNION ALL
          SELECT e.eid, g.created_at FROM g JOIN e ON e.ad=g.t) x
        GROUP BY 1`,
    hubspot: `SELECT property_location_entity_id::text AS entity_id,
        MAX(NULLIF(property_last_connected_date,'')::timestamptz) AS last_at
        FROM hubspot_stitch.locations
       WHERE property_location_entity_id::text IN (${book})
         AND NULLIF(property_last_connected_date,'')::timestamptz >= ${W}
       GROUP BY 1`,
  };
}

async function loadTouched(activeEntities: Set<string>): Promise<{
  human: Set<string>;
  all: Set<string>;
}> {
  const ids = [...activeEntities].filter((e) => SAFE_ID.test(e)).sort();
  if (!ids.length) throw new Error("live book is empty — refusing to compute untouched counts");
  const book = ids.map((e) => `'${e}'`).join(",");
  const sql = touchSql(book);

  const results = await Promise.all(
    ALL_CHANNELS.map(async (ch) => {
      const rows = await queryAurora(sql[ch]);
      // Zero rows on a one-to-one channel is the failure mode that once reported
      // the whole book as untouched. Refuse rather than publish it.
      if (!rows.length && (HUMAN_CHANNELS as readonly string[]).includes(ch)) {
        throw new Error(`touch channel "${ch}" returned zero rows for a ${ids.length}-account book`);
      }
      return [ch, new Set(rows.map((r) => String(r.entity_id)).filter(Boolean))] as const;
    }),
  );
  const byChannel = new Map<Channel, Set<string>>(results);

  const human = new Set<string>();
  for (const ch of HUMAN_CHANNELS) for (const e of byChannel.get(ch) ?? []) human.add(e);
  const all = new Set<string>(human);
  for (const ch of ALL_CHANNELS) for (const e of byChannel.get(ch) ?? []) all.add(e);
  return { human, all };
}

// ---------------------------------------------------------------- scheduling

interface Scheduling {
  provisioned: Set<string>;
  productActive: Set<string>;
  onboarded: Set<string>;
  incomplete: Set<string>;
}

function parseCsv(text: string): Record<string, string>[] {
  const out = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return out.data ?? [];
}

/**
 * `provisioned` / `productActive` come from the public provisioning question;
 * `onboarded` / `incomplete` from the master dashboard's own cards.
 *
 * Product-active OVERSTATES usage — it is a provisioning flag, and the
 * dashboard's own QC on 29/07/26 found 121 product-active against 69 onboarded.
 * Both are reported; `onboarded` is the honest one.
 */
async function loadScheduling(): Promise<Scheduling> {
  const [csv, onbCard, incCard] = await Promise.all([
    fetchPublicQuestionCsv(SCHED_CSV_UUID),
    fetchPublicDashcard(SCHED_DASH, SCHED_ONBOARDED_CARD.dashcard, SCHED_ONBOARDED_CARD.card),
    fetchPublicDashcard(SCHED_DASH, SCHED_INCOMPLETE_CARD.dashcard, SCHED_INCOMPLETE_CARD.card),
  ]);

  const provisioned = new Set<string>();
  const productActive = new Set<string>();
  for (const r of parseCsv(csv)) {
    const e = (r["Entity ID"] ?? "").trim();
    if (!e) continue;
    provisioned.add(e);
    if ((r["Is Active"] ?? "").trim().toLowerCase() === "true") productActive.add(e);
  }
  if (!provisioned.size) throw new Error(`scheduling question ${SCHED_CSV_UUID} returned no Entity ID rows`);

  const eids = (card: { cols: string[]; rows: unknown[][] }, label: string): Set<string> => {
    const i = card.cols.indexOf(LOC_ENTITY_COL);
    // Without this column the count cannot be attributed, and a zero here reads
    // as "nobody is onboarded" rather than "the card changed shape".
    if (i < 0) throw new Error(`${label}: column "${LOC_ENTITY_COL}" not found (got: ${card.cols.join(" | ")})`);
    return new Set(card.rows.map((r) => String(r[i] ?? "")).filter(Boolean));
  };

  return {
    provisioned,
    productActive,
    onboarded: eids(onbCard, "sched onboarded (card 3778)"),
    incomplete: eids(incCard, "sched incomplete (card 3768)"),
  };
}

// ---------------------------------------------------------------- tickets

/**
 * Open Linear tickets classified Retention Risk Alert or Churn Ticket,
 * excluding FALSE_ALERT, counted by the AM name the ticket feed itself carries.
 */
async function loadRetentionTickets(): Promise<Map<string, number>> {
  const rows = parseCsv(await fetchPublicQuestionCsv(TICKETS_CSV_UUID));
  const byAm = new Map<string, number>();
  for (const r of rows) {
    const cls = (r.ticket_classification ?? "").trim();
    if (cls !== "Retention Risk Alert" && cls !== "Churn Ticket") continue;
    if ((r.churn_potential_status ?? "").trim().toUpperCase() === "FALSE_ALERT") continue;
    const am = (r.am_name ?? "").trim() || UNASSIGNED;
    byAm.set(am, (byAm.get(am) ?? 0) + 1);
  }
  return byAm;
}

// ---------------------------------------------------------------- aggregate

/**
 * churned / (active + churned), as a percentage — the workbook's denominator,
 * and the one the five backfilled days in alfred.am_daily already carry. NULL,
 * never 100, when the AM holds no live book.
 *
 * NOTE: this is deliberately NOT `churnPercentages()` from amSnapshot.ts, which
 * divides by active alone. The two differ by well under a tenth of a point at
 * book-level rates, but changing denominator mid-series is exactly the silent
 * step this table exists to make visible.
 */
function churnPct(churned: number, active: number): number | null {
  if (!active) return null;
  const base = active + churned;
  return base ? round2((100 * churned) / base) : null;
}

/** One row per AM per day, ready for `takeAmSnapshot()`. */
export async function computeAmSnapshot(): Promise<AmDailyRow[]> {
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  const d = new Date(nowMs);
  // Calendar month in the process's local time, matching the laptop job.
  const monthStart = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);

  // Chargebee, scheduling and tickets are independent of everything else.
  const [book, scheduling, ticketsByAm] = await Promise.all([
    loadBook(now, monthStart),
    loadScheduling(),
    loadRetentionTickets(),
  ]);

  // AM mapping and touch points both need the book, so they follow it — and
  // then run against each other.
  const interested = new Set<string>([...book.activeEntities, ...book.churn30, ...book.churnMtd]);
  const [amOf, touched] = await Promise.all([loadAmMap(interested), loadTouched(book.activeEntities)]);

  const AM = (e: string) => amOf.get(e) || UNASSIGNED;

  interface Acc {
    active: number; mrr: number; missed: number; amount: number;
    churn30: number; churnMtd: number;
    schedProv: number; schedActive: number; schedOnb: number; schedInc: number;
    untHuman: number; untAll: number;
  }
  const blank = (): Acc => ({
    active: 0, mrr: 0, missed: 0, amount: 0, churn30: 0, churnMtd: 0,
    schedProv: 0, schedActive: 0, schedOnb: 0, schedInc: 0, untHuman: 0, untAll: 0,
  });
  const agg = new Map<string, Acc>();
  const at = (am: string): Acc => {
    let a = agg.get(am);
    if (!a) agg.set(am, (a = blank()));
    return a;
  };

  for (const e of book.activeEntities) {
    const a = at(AM(e));
    a.active += 1;
    a.mrr += book.mrrOf.get(e) ?? 0;
    if (book.missedCount.has(e)) {
      a.missed += 1;
      a.amount += book.missedAmount.get(e) ?? 0;
    }
    if (scheduling.provisioned.has(e)) a.schedProv += 1;
    if (scheduling.productActive.has(e)) a.schedActive += 1;
    if (scheduling.onboarded.has(e)) a.schedOnb += 1;
    if (scheduling.incomplete.has(e)) a.schedInc += 1;
    if (!touched.human.has(e)) a.untHuman += 1;
    if (!touched.all.has(e)) a.untAll += 1;
  }
  // Churned accounts keep their own rows even when the AM holds no live book.
  for (const e of book.churn30) at(AM(e)).churn30 += 1;
  for (const e of book.churnMtd) at(AM(e)).churnMtd += 1;
  // An AM with only tickets is still an AM.
  for (const am of ticketsByAm.keys()) at(am);

  const rows: AmDailyRow[] = [...agg.entries()]
    .map(([amName, a]) => ({
      amName,
      activeAccounts: a.active,
      mrr: round2(a.mrr),
      missedPaymentAccounts: a.missed,
      missedPaymentAmount: round2(a.amount),
      churned30d: a.churn30,
      churnPct30d: churnPct(a.churn30, a.active),
      churnedMtd: a.churnMtd,
      churnPctMtd: churnPct(a.churnMtd, a.active),
      retentionRiskTickets: ticketsByAm.get(amName) ?? 0,
      schedProvisioned: a.schedProv,
      schedProductActive: a.schedActive,
      schedOnboarded: a.schedOnb,
      schedIncomplete: a.schedInc,
      untouchedHuman30d: a.untHuman,
      untouchedAll30d: a.untAll,
    }))
    .sort((x, y) => y.activeAccounts - x.activeAccounts || x.amName.localeCompare(y.amName));

  if (!rows.length) throw new Error("computeAmSnapshot produced no AM rows");
  return rows;
}
