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
