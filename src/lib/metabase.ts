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
  detailProfileWeeklySql,
  detailLeadsReviewsMonthlySql,
  detailRankTrendSql,
  detailFunnelSql,
} from "./queries";
import { labelAgent } from "./types";
import { mapTier } from "./health";
import type { AccountDetail, AccountRow, HealthScore } from "./types";

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

export async function getAccountsFromMetabase(windowDays: number): Promise<AccountRow[]> {
  const cfg = readMetabaseConfig();
  if (!cfg) throw new Error("Metabase not configured (METABASE_BASE_URL / METABASE_API_KEY)");

  const [master, timing, trends] = await Promise.all([
    runDataset(cfg, masterSql(windowDays)),
    runDataset(cfg, timingSql()),
    runDataset(cfg, trendsSql(windowDays)),
  ]);

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
      keywordsTracked: num(r.keywords_tracked),
      keywordsTop3Pct: num(r.keywords_top3_pct),
      avgCurrentRank: num(r.avg_current_rank),
      keywordImpressions: int0(r.keyword_impressions),
      avgReceivedToOpenedMs: t ? secToMs(t.recv_to_open_s) : null,
      avgReceivedToContactedMs: t ? secToMs(t.recv_to_contact_s) : null,
      avgOpenedToContactedMs: t ? secToMs(t.open_to_contact_s) : null,
      activeProducts: parseProducts(r.agents_paid_for),
      leadsDelta: tr ? { cur: int0(tr.cur_leads), prev: int0(tr.prev_leads) } : undefined,
      reviewsDelta: tr ? { cur: int0(tr.cur_reviews), prev: int0(tr.prev_reviews) } : undefined,
      clicksDelta: tr ? { cur: int0(tr.cur_clicks), prev: int0(tr.prev_clicks) } : undefined,
      sparkLeads: tr ? parseSpark(tr.leads_spark) : [],
      sparkClicks: tr ? parseSpark(tr.clicks_spark) : [],
    };
  });
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
  const [pw, lr, rt, fn] = await Promise.all([
    runDataset(cfg, detailProfileWeeklySql(id)),
    runDataset(cfg, detailLeadsReviewsMonthlySql(id)),
    runDataset(cfg, detailRankTrendSql(id)),
    runDataset(cfg, detailFunnelSql(id, Math.max(windowDays, 90))),
  ]);
  const f = fn[0] ?? {};
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
  };
}
