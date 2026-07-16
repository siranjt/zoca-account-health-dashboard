// ===========================================================================
// Live all-accounts SQL, ported 1:1 from the Retool "Customer Dashboard"
// queries (which are per-account) and re-shaped to return every active,
// non-churned account in one pass. Anchored on cx.health_score (831 rows).
// Verified against Retool (Amenity Wax Spot & Spa) on 2026-07-16.
// ===========================================================================

/** Master query: identity + health + all numeric metric columns. */
export function masterSql(windowDays: number): string {
  const w = `interval '${windowDays} days'`;
  return `
WITH hs AS (
  SELECT entity_id, gbp_title, am_name, health_tier,
         composite_health_score, score_engagement, score_value_realization,
         score_product_stability, health_tier_reason_names, recommended_action,
         agents_paid_for, total_mrr, active_subs
  FROM cx.health_score
),
loc AS (
  SELECT entity_id,
         storefront_address->>'locality' AS city,
         storefront_address->>'administrativeArea' AS state
  FROM gbp.locations
),
leads AS (
  SELECT entity_id, COUNT(*) AS leads
  FROM website.booking_enquiries
  WHERE source='WEBSITE' AND is_test_lead=false AND created_at >= now()-${w}
  GROUP BY entity_id
),
rev AS (
  SELECT entity_id, COUNT(*) AS reviews
  FROM reviews.reviews
  WHERE is_deleted=false AND review_time >= now()-${w}
  GROUP BY entity_id
),
pho AS (
  SELECT entity_id, COUNT(*) FILTER (WHERE status='POSTED') AS photos
  FROM gbp.scheduled_media GROUP BY entity_id
),
met AS (
  SELECT gl.entity_id,
    SUM(m.desktop_map_clicks+m.desktop_search_clicks+m.mobile_map_clicks+m.mobile_search_clicks) AS profile_clicks,
    SUM(m.website_clicks) AS website_clicks
  FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name
  WHERE m.metrics_timestamp >= now()-${w}
  GROUP BY gl.entity_id
),
web AS (
  SELECT entity_id::uuid AS entity_id,
         SUM(unique_book_now_clicks) AS book_online,
         SUM(unique_page_views) AS page_views,
         TRUE AS book_active
  FROM mixpanel_website.daily_page_views
  WHERE week_start_date >= now()-${w}
    AND entity_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  GROUP BY entity_id
),
rnk AS (
  SELECT entity_id, COUNT(*) AS kw,
    ROUND((100.0*COUNT(*) FILTER (WHERE cur_rank<=3)/NULLIF(COUNT(*),0))::numeric,2) AS top3_pct,
    ROUND(AVG(cur_rank)::numeric,1) AS avg_rank
  FROM (
    SELECT entity_id, keyword, avg_rank AS cur_rank,
           ROW_NUMBER() OVER (PARTITION BY entity_id, keyword ORDER BY dateval DESC) AS rn
    FROM local_seo.rank WHERE is_active
  ) x
  WHERE rn = 1
  GROUP BY entity_id
),
imp AS (
  SELECT gl.entity_id, SUM(k.value) AS impressions
  FROM (
    SELECT location_name, value, (year*100+month) AS ym,
           MAX(year*100+month) OVER (PARTITION BY location_name) AS mx
    FROM gbp.keyword_impressions
  ) k
  JOIN gbp.locations gl ON gl.name=k.location_name
  WHERE k.ym = k.mx
  GROUP BY gl.entity_id
)
SELECT hs.entity_id, hs.gbp_title, loc.city, loc.state, hs.am_name,
       hs.health_tier, hs.composite_health_score, hs.score_engagement,
       hs.score_value_realization, hs.score_product_stability,
       hs.health_tier_reason_names, hs.recommended_action,
       hs.agents_paid_for, hs.total_mrr, hs.active_subs,
       COALESCE(leads.leads,0) AS leads_received,
       COALESCE(rev.reviews,0) AS reviews_received,
       COALESCE(pho.photos,0) AS photos_uploaded,
       COALESCE(met.profile_clicks,0) AS profile_clicks,
       COALESCE(met.website_clicks,0) AS website_clicks,
       COALESCE(web.book_online,0) AS book_online_clicks,
       COALESCE(web.book_active,false) AS book_online_active,
       rnk.kw AS keywords_tracked, rnk.top3_pct AS keywords_top3_pct, rnk.avg_rank AS avg_current_rank,
       COALESCE(imp.impressions,0) AS keyword_impressions
FROM hs
LEFT JOIN loc   USING (entity_id)
LEFT JOIN leads USING (entity_id)
LEFT JOIN rev   USING (entity_id)
LEFT JOIN pho   USING (entity_id)
LEFT JOIN met   USING (entity_id)
LEFT JOIN web   USING (entity_id)
LEFT JOIN rnk   USING (entity_id)
LEFT JOIN imp   USING (entity_id)
ORDER BY hs.gbp_title`;
}

/** Lead-response timing (avg seconds) per account. Windowed to recent leads. */
export function timingSql(leadDays = 90, mixpanelDays = 120): string {
  return `
WITH be AS (
  SELECT entity_id, id AS enquiry_id, created_at
  FROM website.booking_enquiries
  WHERE source='WEBSITE' AND is_test_lead=false AND created_at >= now()-interval '${leadDays} days'
    AND entity_id IN (SELECT entity_id FROM cx.health_score)
),
opened AS (
  SELECT lead_id, MIN(time) AS t
  FROM mixpanelzocaappdata.export
  WHERE event='Leads-View-Chat' AND lead_id IS NOT NULL AND time >= now()-interval '${mixpanelDays} days'
  GROUP BY lead_id
),
contacted AS (
  SELECT enquiry_id, MIN(created_at) AS t
  FROM clients.communication_logs
  WHERE type IN ('SMS','CALL')
  GROUP BY enquiry_id
),
j AS (
  SELECT be.entity_id, be.created_at, o.t AS opened_at, c.t AS contacted_at
  FROM be
  LEFT JOIN opened o    ON o.lead_id::text    = be.enquiry_id::text
  LEFT JOIN contacted c ON c.enquiry_id::text = be.enquiry_id::text
)
SELECT entity_id,
  ROUND(AVG(EXTRACT(EPOCH FROM (opened_at-created_at)))
        FILTER (WHERE opened_at IS NOT NULL AND opened_at>=created_at)) AS recv_to_open_s,
  ROUND(AVG(EXTRACT(EPOCH FROM (contacted_at-created_at)))
        FILTER (WHERE contacted_at IS NOT NULL AND contacted_at>=created_at)) AS recv_to_contact_s,
  ROUND(AVG(EXTRACT(EPOCH FROM (contacted_at-opened_at)))
        FILTER (WHERE contacted_at IS NOT NULL AND opened_at IS NOT NULL AND contacted_at>=opened_at)) AS open_to_contact_s
FROM j
GROUP BY entity_id`;
}

// ===========================================================================
// TRENDS (all-accounts): current-vs-previous deltas + 12-week sparklines.
// One query, 831 rows, ~2s. Powers the in-row sparklines and ▲/▼ arrows.
// ===========================================================================
export function trendsSql(windowDays: number): string {
  const w = `interval '${windowDays} days'`;
  const w2 = `interval '${windowDays * 2} days'`;
  const PC = "m.desktop_map_clicks+m.desktop_search_clicks+m.mobile_map_clicks+m.mobile_search_clicks";
  return `
WITH
lc AS (SELECT entity_id, COUNT(*) c FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND created_at>=now()-${w} GROUP BY 1),
lp AS (SELECT entity_id, COUNT(*) c FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND created_at>=now()-${w2} AND created_at<now()-${w} GROUP BY 1),
rc AS (SELECT entity_id, COUNT(*) c FROM reviews.reviews WHERE is_deleted=false AND review_time>=now()-${w} GROUP BY 1),
rp AS (SELECT entity_id, COUNT(*) c FROM reviews.reviews WHERE is_deleted=false AND review_time>=now()-${w2} AND review_time<now()-${w} GROUP BY 1),
pc AS (SELECT gl.entity_id, SUM(${PC}) c FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE m.metrics_timestamp>=now()-${w} GROUP BY 1),
pp AS (SELECT gl.entity_id, SUM(${PC}) c FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE m.metrics_timestamp>=now()-${w2} AND m.metrics_timestamp<now()-${w} GROUP BY 1),
lspark AS (SELECT entity_id, json_agg(json_build_object('w',to_char(wk,'YYYY-MM-DD'),'c',c) ORDER BY wk) s
  FROM (SELECT entity_id, date_trunc('week',created_at)::date wk, COUNT(*) c FROM website.booking_enquiries
        WHERE source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '84 days' GROUP BY 1,2) x GROUP BY 1),
pspark AS (SELECT entity_id, json_agg(json_build_object('w',to_char(wk,'YYYY-MM-DD'),'c',c) ORDER BY wk) s
  FROM (SELECT gl.entity_id, date_trunc('week',m.metrics_timestamp)::date wk, SUM(${PC}) c FROM gbp.metrics m
        JOIN gbp.locations gl ON gl.name=m.location_name WHERE m.metrics_timestamp>=now()-interval '84 days' GROUP BY 1,2) y GROUP BY 1)
SELECT hs.entity_id,
  COALESCE(lc.c,0) cur_leads, COALESCE(lp.c,0) prev_leads,
  COALESCE(rc.c,0) cur_reviews, COALESCE(rp.c,0) prev_reviews,
  COALESCE(pc.c,0) cur_clicks, COALESCE(pp.c,0) prev_clicks,
  lspark.s leads_spark, pspark.s clicks_spark
FROM cx.health_score hs
LEFT JOIN lc USING(entity_id) LEFT JOIN lp USING(entity_id)
LEFT JOIN rc USING(entity_id) LEFT JOIN rp USING(entity_id)
LEFT JOIN pc USING(entity_id) LEFT JOIN pp USING(entity_id)
LEFT JOIN lspark USING(entity_id) LEFT JOIN pspark USING(entity_id)`;
}

// ===========================================================================
// DETAIL (one account) — lazy-loaded when a row is expanded.
// ===========================================================================
const PCX = "m.desktop_map_clicks+m.desktop_search_clicks+m.mobile_map_clicks+m.mobile_search_clicks";

export function detailProfileWeeklySql(id: string): string {
  return `
WITH g AS (SELECT date_trunc('week',m.metrics_timestamp)::date wk,
  SUM(m.website_clicks) wc, SUM(m.call_clicks) cc, SUM(m.business_direction_requests) dc, SUM(${PCX}) pc
  FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name
  WHERE gl.entity_id='${id}'::uuid AND m.metrics_timestamp>=now()-interval '26 weeks' GROUP BY 1),
l AS (SELECT date_trunc('week',created_at)::date wk, COUNT(*) leads FROM website.booking_enquiries
  WHERE entity_id='${id}'::uuid AND source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '26 weeks' GROUP BY 1)
SELECT to_char(COALESCE(g.wk,l.wk),'YYYY-MM-DD') wk,
  COALESCE(g.pc,0) profile_clicks, COALESCE(g.wc,0) website_clicks, COALESCE(g.cc,0) call_clicks,
  COALESCE(g.dc,0) directions, COALESCE(l.leads,0) leads,
  COALESCE(g.wc,0)+COALESCE(g.cc,0)+COALESCE(g.dc,0) total_interactions
FROM g FULL JOIN l ON g.wk=l.wk ORDER BY 1`;
}

export function detailLeadsReviewsMonthlySql(id: string): string {
  return `
WITH l AS (SELECT date_trunc('month',created_at)::date m, COUNT(*) leads FROM website.booking_enquiries
  WHERE entity_id='${id}'::uuid AND source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '12 months' GROUP BY 1),
r AS (SELECT date_trunc('month',review_time)::date m, COUNT(*) reviews FROM reviews.reviews
  WHERE entity_id='${id}'::uuid AND is_deleted=false AND review_time>=now()-interval '12 months' GROUP BY 1)
SELECT to_char(COALESCE(l.m,r.m),'YYYY-MM') mon, COALESCE(l.leads,0) leads, COALESCE(r.reviews,0) reviews
FROM l FULL JOIN r ON l.m=r.m ORDER BY 1`;
}

export function detailRankTrendSql(id: string): string {
  return `
SELECT to_char(dateval,'YYYY-MM-DD') d,
  ROUND((100.0*COUNT(*) FILTER (WHERE avg_rank<=3)/NULLIF(COUNT(*),0))::numeric,1) top3,
  ROUND(AVG(avg_rank)::numeric,1) avg_rank
FROM local_seo.rank WHERE entity_id='${id}'::uuid AND is_active
GROUP BY dateval ORDER BY dateval DESC LIMIT 16`;
}

export function detailFunnelSql(id: string, windowDays: number): string {
  const w = `interval '${windowDays} days'`;
  return `
WITH be AS (SELECT id AS enquiry_id, status, created_at FROM website.booking_enquiries
  WHERE entity_id='${id}'::uuid AND source='WEBSITE' AND is_test_lead=false AND created_at>=now()-${w}),
opened AS (SELECT DISTINCT lead_id FROM mixpanelzocaappdata.export WHERE event='Leads-View-Chat' AND lead_id IS NOT NULL),
contacted AS (SELECT DISTINCT enquiry_id FROM clients.communication_logs WHERE type IN ('SMS','CALL'))
SELECT
  COUNT(*) enquiries,
  COUNT(*) FILTER (WHERE be.enquiry_id::text IN (SELECT lead_id::text FROM opened)) opened,
  COUNT(*) FILTER (WHERE be.enquiry_id::text IN (SELECT enquiry_id::text FROM contacted)) contacted,
  COUNT(*) FILTER (WHERE be.status='BOOKED') booked
FROM be`;
}
