import "server-only";
import { queryAurora } from "@/lib/metabase";

// ===========================================================================
// Lead-drought readout (admin): accounts with no incoming website leads for a
// continuous stretch. "Drought" = days since the last lead (website.booking_
// enquiries, WEBSITE, non-test), or — for accounts that never received one —
// days since onboarding, so a brand-new account is never mislabelled as a long
// drought. Scoped to the book (cx.health_score = active, non-churned). The
// leads-masked flag marks accounts that are dry BY DESIGN (leads withheld), not
// organically, so they aren't misread as a servicing problem.
// ===========================================================================

export interface DroughtRow {
  entityId: string;
  name: string | null;
  amName: string | null;
  state: string | null;
  mrr: number | null;
  healthTier: string | null;
  lastLead: string | null; // YYYY-MM-DD, or null when never had a lead
  neverHadLead: boolean;
  leadsMasked: boolean;
  droughtDays: number;
}

const SQL = `WITH ll AS (
    SELECT entity_id, MAX(created_at) last_lead
    FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false GROUP BY 1),
  lm AS (SELECT entity_id, (lead_masking->>'status')='true' AS leads_masked FROM entities.locations WHERE lead_masking IS NOT NULL),
  loc AS (SELECT entity_id, storefront_address->>'administrativeArea' AS state FROM gbp.locations)
  SELECT hs.entity_id::text AS entity_id, hs.gbp_title AS name, hs.am_name, loc.state,
    hs.total_mrr AS mrr, hs.health_tier,
    to_char(ll.last_lead,'YYYY-MM-DD') AS last_lead,
    (ll.last_lead IS NULL) AS never_had_lead,
    COALESCE(lm.leads_masked,false) AS leads_masked,
    GREATEST(0, (EXTRACT(EPOCH FROM (now() - COALESCE(ll.last_lead, hs.onboarding_date::timestamp))) / 86400))::int AS drought_days
  FROM cx.health_score hs
  LEFT JOIN ll  ON ll.entity_id  = hs.entity_id
  LEFT JOIN lm  ON lm.entity_id  = hs.entity_id
  LEFT JOIN loc ON loc.entity_id = hs.entity_id
  WHERE COALESCE(ll.last_lead, hs.onboarding_date::timestamp) IS NOT NULL
  ORDER BY drought_days DESC`;

const TTL_MS = 10 * 60_000; // 10 min
let cache: { at: number; rows: DroughtRow[] } | null = null;
let inflight: Promise<DroughtRow[]> | null = null;

export async function getLeadDroughts(): Promise<DroughtRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    const rows = await queryAurora(SQL);
    const out: DroughtRow[] = rows.map((r) => ({
      entityId: String(r.entity_id),
      name: (r.name as string) || null,
      amName: (r.am_name as string) || null,
      state: (r.state as string) || null,
      mrr: r.mrr != null && r.mrr !== "" ? Number(r.mrr) : null,
      healthTier: (r.health_tier as string) || null,
      lastLead: (r.last_lead as string) || null,
      neverHadLead: r.never_had_lead === true,
      leadsMasked: r.leads_masked === true,
      droughtDays: Number(r.drought_days) || 0,
    }));
    cache = { at: Date.now(), rows: out };
    return out;
  })().finally(() => { inflight = null; });
  return inflight;
}
