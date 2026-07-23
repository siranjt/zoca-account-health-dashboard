// ===========================================================================
// Metabase client (SERVER-SIDE ONLY).
//
// Talks to Metabase's /api/dataset endpoint (ad-hoc native SQL) using an API
// key held in a server env var. Zero footprint: it only RUNS queries and reads
// rows back — it never creates or edits any Question, card, or dashboard.
// Never import this into a client component: the API key must not reach the
// browser.
// ===========================================================================

import {
  masterSql,
  timingSql,
  trendsSql,
  webActiveSql,
  ccUsageSql,
  ccDailySql,
  detailProfileWeeklySql,
  detailLeadsReviewsMonthlySql,
  detailRankTrendSql,
  detailFunnelSql,
  detailAppUsageSql,
  detailBookingsSql,
  detailKeywordRankSql,
  detailImpressionsSql,
  detailReviewsDistSql,
  detailLeadSourcesSql,
  detailMediaSql,
  detailForecastSql,
  detailReviewsListSql,
  detailLeadsListSql,
  detailPostsSql,
  detailPostsWeeklySql,
  detailServicesSql,
  detailRequestsSql,
  detailCsatSql,
  detailOnboardingSql,
  detailWinOnboardedSql,
  detailSchedulingStatusSql,
  detailTotalBookingsSql,
  detailBookingsByStatusSql,
  detailBookingsByCreatorSql,
  detailWowTasksSql,
  detailCallbackActionsSql,
  detailPaymentLinksSql,
} from "./queries";
import { labelAgent } from "./types";
import { mapTier } from "./health";
import { getTicketCountsByEntity } from "./tickets";
import { getCommsWeekly, type CommsWeekPoint } from "./comms";
import type { AccountDetail, AccountRow, HealthScore } from "./types";
import tzLookup from "tz-lookup";

// IANA timezone from lat/lng (pure-data lookup, no network). Used to show the
// account's current local time. Guards against out-of-range coords.
function tzFromLatLng(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    return tzLookup(lat, lng);
  } catch {
    return null;
  }
}

export interface MetabaseConfig {
  url: string;
  apiKey: string;
  databaseId: number;
}

export function readMetabaseConfig(): MetabaseConfig | null {
  const url = process.env.METABASE_BASE_URL ?? process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;
  if (!url || !apiKey) return null;
  return {
    url: url.replace(/\/+$/, ""),
    apiKey,
    databaseId: Number(process.env.METABASE_DATABASE_ID) || 7, // 7 = "Zoca Aurora"
  };
}

type Row = Record<string, unknown>;

// Run an ad-hoc read query against Zoca Aurora (read-only). Used by Alfred's
// support-ticket and review-detail tools. Throws if Metabase isn't configured.
export async function queryAurora(sql: string): Promise<Row[]> {
  const cfg = readMetabaseConfig();
  if (!cfg) throw new Error("Metabase not configured (METABASE_BASE_URL / METABASE_API_KEY)");
  return runDataset(cfg, sql);
}

async function runDataset(cfg: MetabaseConfig, sql: string): Promise<Row[]> {
  const res = await fetch(`${cfg.url}/api/dataset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey },
    body: JSON.stringify({
      database: cfg.databaseId,
      type: "native",
      native: { query: sql },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Metabase /api/dataset ${res.status}: ${body.slice(0, 300)}`);
  }
  const json: any = await res.json();
  if (json?.status === "failed" || json?.error) {
    throw new Error(`Metabase query failed: ${String(json.error).slice(0, 300)}`);
  }
  const cols: Array<{ name: string }> = json?.data?.cols ?? [];
  const rows: unknown[][] = json?.data?.rows ?? [];
  return rows.map((r) => {
    const o: Row = {};
    cols.forEach((c, i) => (o[c.name] = r[i]));
    return o;
  });
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int0 = (v: unknown): number => Math.round(num(v) ?? 0);
const secToMs = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n * 1000);
};

function parseProducts(agents: unknown): string[] {
  if (!agents || typeof agents !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of agents.split(",")) {
    const label = labelAgent(tok);
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  // Discovery first, others after
  return out.sort((a, b) => (a === "Discovery" ? -1 : b === "Discovery" ? 1 : a.localeCompare(b)));
}

function toHealth(r: Row): HealthScore {
  const tierLabel = String(r.health_tier ?? "");
  const { tier, color } = mapTier(tierLabel);
  const reason = (r.health_tier_reason_names as string) || null;
  const action = (r.recommended_action as string) || null;
  return {
    engagement: num(r.score_engagement),
    value: num(r.score_value_realization),
    product: num(r.score_product_stability),
    composite: num(r.composite_health_score),
    tier,
    color,
    tierLabel,
    reason,
    recommendedAction: action,
  };
}

export interface MbRange {
  from: string;
  to: string;
  days: number;
}

export async function getAccountsFromMetabase(rangeArg: MbRange): Promise<AccountRow[]> {
  const cfg = readMetabaseConfig();
  if (!cfg) throw new Error("Metabase not configured (METABASE_BASE_URL / METABASE_API_KEY)");

  const [master, timing, trends, ticketCounts, webActive, ccUsage] = await Promise.all([
    runDataset(cfg, masterSql(rangeArg.from, rangeArg.to)),
    runDataset(cfg, timingSql()),
    runDataset(cfg, trendsSql(rangeArg.from, rangeArg.to, rangeArg.days)),
    getTicketCountsByEntity(rangeArg.from), // Linear tickets (Beacon logic), keyed by lowercased entity_id
    // Discovery Web (new web-app product) activation — entities.preferences.
    // Degrade gracefully to "none active" if this side query fails.
    runDataset(cfg, webActiveSql()).catch(() => [] as Row[]),
    // Command Center (AI-agent web app) per-entity usage — chat.* over 28d.
    runDataset(cfg, ccUsageSql()).catch(() => [] as Row[]),
  ]);

  const webActiveSet = new Set<string>(webActive.map((r) => String(r.entity_id)));
  const ccByEntity = new Map<string, { days: number; convos: number }>();
  for (const r of ccUsage) ccByEntity.set(String(r.entity_id), { days: int0(r.active_days_l28), convos: int0(r.conversations_l28) });
  const ccSegment = (days: number): AccountRow["ccSegment"] => (days >= 15 ? "Core" : days >= 5 ? "Regular" : days >= 1 ? "Casual" : null);
  const timingByEntity = new Map<string, Row>();
  for (const t of timing) timingByEntity.set(String(t.entity_id), t);
  const trendsByEntity = new Map<string, Row>();
  for (const t of trends) trendsByEntity.set(String(t.entity_id), t);

  return master.map((r): AccountRow => {
    const id = String(r.entity_id);
    const t = timingByEntity.get(id);
    const tr = trendsByEntity.get(id);
    return {
      entityId: id,
      name: (r.gbp_title as string) || "(unnamed)",
      city: (r.city as string) || null,
      state: (r.state as string) || null,
      lat: num(r.lat),
      lng: num(r.lng),
      accountManager: (r.am_name as string) || null,
      health: toHealth(r),
      mrr: num(r.total_mrr),
      leadsReceived: int0(r.leads_received),
      reviewsReceived: int0(r.reviews_received),
      photosUploaded: int0(r.photos_uploaded),
      profileClicks: int0(r.profile_clicks),
      websiteClicks: int0(r.website_clicks),
      bookOnlineClicks: r.book_online_active ? int0(r.book_online_clicks) : null,
      bookOnlineActive: r.book_online_active === true,
      webAppActive: webActiveSet.has(id),
      ccEnabled: ccByEntity.has(id),
      ccActiveDaysL28: ccByEntity.has(id) ? ccByEntity.get(id)!.days : null,
      ccConversationsL28: ccByEntity.has(id) ? ccByEntity.get(id)!.convos : null,
      ccSegment: ccByEntity.has(id) ? ccSegment(ccByEntity.get(id)!.days) : null,
      keywordsTracked: num(r.keywords_tracked),
      keywordsTop3Pct: num(r.keywords_top3_pct),
      avgCurrentRank: num(r.avg_current_rank),
      keywordImpressions: int0(r.keyword_impressions),
      daysToInvoice: num(r.days_to_invoice),
      daysOverdue: num(r.days_overdue),
      failedPayments: int0(r.failed_payments),
      tenureDays: num(r.tenure_days),
      openTickets: ticketCounts.get(id.toLowerCase())?.active ?? 0,
      closedTicketsWindow: ticketCounts.get(id.toLowerCase())?.closed ?? 0,
      avgReceivedToOpenedMs: t ? secToMs(t.recv_to_open_s) : null,
      avgReceivedToContactedMs: t ? secToMs(t.recv_to_contact_s) : null,
      avgOpenedToContactedMs: t ? secToMs(t.open_to_contact_s) : null,
      activeProducts: parseProducts(r.agents_paid_for),
      gbpVerified: r.gbp_verified === true, // null (no GBP) or false → Unverified
      websiteLive: r.website_live === true, // GBP lists a website URL (Google's own data)
      websiteUrl: (r.website_url as string) || null,
      lastConnected: (r.last_connected as string) || null,
      timezone: tzFromLatLng(num(r.lat), num(r.lng)),
      leadsDelta: tr ? { cur: int0(tr.cur_leads), prev: int0(tr.prev_leads) } : undefined,
      reviewsDelta: tr ? { cur: int0(tr.cur_reviews), prev: int0(tr.prev_reviews) } : undefined,
      clicksDelta: tr ? { cur: int0(tr.cur_clicks), prev: int0(tr.prev_clicks) } : undefined,
      sparkLeads: tr ? parseSpark(tr.leads_spark) : [],
      sparkClicks: tr ? parseSpark(tr.clicks_spark) : [],
    };
  });
}

/** Daily Command Center cohort series (active entities + conversations) for the
 *  landing adoption cluster. Independent of the book; degrades to []. */
export async function getCcDailyFromMetabase(days = 30): Promise<{ d: string; active: number; convos: number }[]> {
  const cfg = readMetabaseConfig();
  if (!cfg) return [];
  try {
    const rows = await runDataset(cfg, ccDailySql(days));
    return rows.map((r) => ({ d: String(r.d), active: int0(r.active), convos: int0(r.convos) }));
  } catch {
    return [];
  }
}

function parseSpark(v: unknown): number[] {
  if (!v) return [];
  let arr: unknown = v;
  if (typeof v === "string") {
    try {
      arr = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((o) => Number((o as { c?: unknown })?.c ?? 0))
    .filter((n) => Number.isFinite(n));
}

export async function getAccountDetailFromMetabase(
  id: string,
  windowDays: number
): Promise<AccountDetail> {
  const cfg = readMetabaseConfig();
  if (!cfg) throw new Error("Metabase not configured");
  const safe = (sql: string) => runDataset(cfg, sql).catch(() => [] as Row[]);
  const [pw, lr, rt, fn, au, bk, kr, im, rd, ls, cm, md, fc, rl, ll, ps, pw2, sv, rq, cs, ob, wo, sst, tb, bs, bc, wt, ca, pl] = await Promise.all([
    runDataset(cfg, detailProfileWeeklySql(id)),
    runDataset(cfg, detailLeadsReviewsMonthlySql(id)),
    runDataset(cfg, detailRankTrendSql(id)),
    runDataset(cfg, detailFunnelSql(id, Math.max(windowDays, 90))),
    safe(detailAppUsageSql(id)),
    safe(detailBookingsSql(id)),
    safe(detailKeywordRankSql(id)),
    safe(detailImpressionsSql(id)),
    safe(detailReviewsDistSql(id)),
    safe(detailLeadSourcesSql(id, Math.max(windowDays, 90))),
    getCommsWeekly(id, 90).catch(() => [] as CommsWeekPoint[]),
    safe(detailMediaSql(id)),
    safe(detailForecastSql(id)),
    safe(detailReviewsListSql(id)),
    safe(detailLeadsListSql(id, Math.max(windowDays, 90))),
    safe(detailPostsSql(id)),
    safe(detailPostsWeeklySql(id)),
    safe(detailServicesSql(id)),
    safe(detailRequestsSql(id)),
    safe(detailCsatSql(id)),
    safe(detailOnboardingSql(id)),
    safe(detailWinOnboardedSql(id)),
    safe(detailSchedulingStatusSql(id)),
    safe(detailTotalBookingsSql(id)),
    safe(detailBookingsByStatusSql(id)),
    safe(detailBookingsByCreatorSql(id)),
    safe(detailWowTasksSql(id)),
    safe(detailCallbackActionsSql(id)),
    safe(detailPaymentLinksSql(id)),
  ]);
  const f = fn[0] ?? {};
  const RATING = { FIVE: 5, FOUR: 4, THREE: 3, TWO: 2, ONE: 1, ZERO: 0 } as Record<string, number>;
  let rTot = 0, rSum = 0, rRated = 0, r30 = 0, r90 = 0; const rDist: Record<string, number> = {};
  for (const r of rd) {
    const n = int0(r.n), key = String(r.rating ?? "");
    rTot += n; r30 += int0(r.n30); r90 += int0(r.n90);
    if (key) rDist[String(RATING[key] ?? key)] = n;
    if (RATING[key] != null) { rSum += RATING[key] * n; rRated += n; }
  }
  let live = 0; const mediaCadence = md.map((r) => { live += int0(r.delta); return { wk: String(r.wk), live }; });
  const fcRow = fc[0] ?? {};
  return {
    entityId: id,
    profileWeekly: pw.map((r) => ({
      wk: String(r.wk),
      profileClicks: int0(r.profile_clicks),
      websiteClicks: int0(r.website_clicks),
      callClicks: int0(r.call_clicks),
      directions: int0(r.directions),
      leads: int0(r.leads),
      totalInteractions: int0(r.total_interactions),
    })),
    leadsReviews: lr.map((r) => ({
      mon: String(r.mon),
      leads: int0(r.leads),
      reviews: int0(r.reviews),
    })),
    rankTrend: rt
      .map((r) => ({ d: String(r.d), top3: num(r.top3), avgRank: num(r.avg_rank) }))
      .reverse(),
    funnel: {
      enquiries: int0(f.enquiries),
      opened: int0(f.opened),
      contacted: int0(f.contacted),
      booked: int0(f.booked),
    },
    appUsage: au.map((r) => ({ wk: String(r.wk), appOpen: int0(r.app_open), leads: int0(r.leads_view), reviews: int0(r.reviews_view), photos: int0(r.photos_view) })),
    bookings: bk.map((r) => ({ label: String(r.label), leads: int0(r.leads), bookings: int0(r.bookings) })),
    keywordRankings: kr.map((r) => ({ keyword: String(r.keyword), avgRank: int0(r.avg_rank), minRank: int0(r.min_rank), searchVolume: num(r.search_volume) })),
    impressions: im.map((r) => ({ ym: String(r.ym), impressions: int0(r.impressions) })),
    reviewsDist: rTot ? { total: rTot, avg: rRated ? Math.round((rSum / rRated) * 100) / 100 : null, last30: r30, last90: r90, dist: rDist } : null,
    comms: cm,
    leadSources: ls.map((r) => ({ bucket: String(r.bucket), n: int0(r.n) })),
    mediaCadence,
    forecast: fcRow.predicted != null || fcRow.actual != null ? { predicted: num(fcRow.predicted), actual: int0(fcRow.actual) } : null,
    reviewsList: rl.map((r) => ({
      reviewer: (r.reviewer_name as string) || null,
      rating: RATING[String(r.rating ?? "")] ?? null,
      platform: (r.platform as string) || null,
      text: (r.review_text as string) || null,
      date: (r.d as string) || null,
    })),
    leadsList: ll.map((r) => ({
      date: (r.d as string) || null,
      source: (r.source as string) || null,
      service: (r.service as string) || null,
      status: (r.status as string) || null,
      price: num(r.price),
      currency: (r.currency as string) || null,
      utm: (r.utm_source as string) || null,
    })),
    posts: ps.map((r) => ({
      date: (r.d as string) || null,
      summary: (r.summary as string) || null,
      event: (r.event as string) || null,
      offer: (r.offer as string) || null,
      cta: (r.cta as string) || null,
      topic: (r.topic_type as string) || null,
      state: (r.state as string) || null,
    })),
    postsWeekly: pw2.map((r) => ({ wk: String(r.wk), posts: int0(r.posts), cumsum: int0(r.cumsum) })),
    services: sv.map((r) => ({
      name: (r.name as string) || null,
      description: (r.description as string) || null,
      duration: num(r.duration),
      price: num(r.price),
      category: (r.category as string) || null,
    })),
    requests: rq.map((r) => ({
      date: (r.d as string) || null,
      status: (r.status as string) || null,
      priority: (r.priority as string) || null,
      requestType: (r.request_type as string) || null,
      details: (r.details as string) || null,
    })),
    csat: cs.map((r) => ({
      date: (r.d as string) || null,
      platform: (r.platform as string) || null,
      formType: (r.form_type as string) || null,
      question: (r.question as string) || null,
      answer: (r.answer as string) || null,
    })),
    onboarding: ob[0] || wo[0]
      ? {
          state: (ob[0]?.onboarding_state as string) || null,
          createdAt: (ob[0]?.d as string) || null,
          bookingLinkAdded: ob[0]?.is_booking_link_added == null ? null : Boolean(ob[0].is_booking_link_added),
          leadPredictionViewed: ob[0]?.is_lead_prediction_viewed == null ? null : Boolean(ob[0].is_lead_prediction_viewed),
          winOnboardedDate: (wo[0]?.onboarded_date as string) || null,
        }
      : null,
    schedulingStatus: sst[0]
      ? {
          schedulingProduct: (sst[0].scheduling_product as string) || null,
          websiteFlipped: (sst[0].website_flipped as string) || null,
          callCtaEnabled: (sst[0].call_cta as string) || null,
        }
      : null,
    totalBookings: tb[0] ? int0(tb[0].total_bookings) : null,
    bookingsByStatus: bs.map((r) => ({ status: (r.status as string) || null, count: int0(r.booking_count) })),
    bookingsByCreator: bc.map((r) => ({ creatorType: (r.created_by_type as string) || null, count: int0(r.booking_count) })),
    wowTasks: wt.map((r) => ({
      wk: String(r.wk),
      total: int0(r.total_tasks),
      completed: int0(r.completed),
      cancelled: int0(r.cancelled),
      pending: int0(r.pending),
      resolutionPct: num(r.resolution_rate_pct),
    })),
    callbackActions: ca.map((r) => ({ action: (r.action as string) || null, count: int0(r.count) })),
    paymentLinks: pl[0]
      ? {
          missedPayment: (pl[0].missed_payment as string) || null,
          paymentMethodUpdate: (pl[0].payment_method_update as string) || null,
        }
      : null,
  };
}
