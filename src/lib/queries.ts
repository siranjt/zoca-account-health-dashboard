// ===========================================================================
// Live all-accounts SQL, ported from the Retool "Customer Dashboard" queries
// and re-shaped to return every active account in one pass. Anchored on
// cx.health_score (831 rows). Windowed metrics use an explicit [from, to) date
// range so any custom span (incl. 3 days) works, not just presets.
// ===========================================================================

const UUIDRE = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const PC = "m.desktop_map_clicks+m.desktop_search_clicks+m.mobile_map_clicks+m.mobile_search_clicks";

/** `col >= from AND col < to` (both ISO timestamps). */
function range(col: string, from: string, to: string): string {
  return `${col} >= '${from}'::timestamptz AND ${col} < '${to}'::timestamptz`;
}

/** Master query: identity + health + windowed metrics + payments. */
export function masterSql(from: string, to: string): string {
  return `
WITH hs AS (
  SELECT entity_id, gbp_title, am_name, health_tier, composite_health_score,
         score_engagement, score_value_realization, score_product_stability,
         health_tier_reason_names, recommended_action, agents_paid_for,
         total_mrr, active_subs, onboarding_date
  FROM cx.health_score
),
loc AS (SELECT entity_id, storefront_address->>'locality' AS city, storefront_address->>'administrativeArea' AS state FROM gbp.locations),
leads AS (SELECT entity_id, COUNT(*) AS leads FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND ${range("created_at", from, to)} GROUP BY 1),
rev AS (SELECT entity_id, COUNT(*) AS reviews FROM reviews.reviews WHERE is_deleted=false AND ${range("review_time", from, to)} GROUP BY 1),
-- photos = actually uploaded in the window (media.media_entities has a real created_at)
pho AS (SELECT mme.entity_id, COUNT(*) AS photos FROM media.media_entities mme JOIN media.media mm ON mme.media_id=mm.id WHERE mm.is_active=true AND ${range("mme.created_at", from, to)} GROUP BY 1),
met AS (SELECT gl.entity_id, SUM(${PC}) AS profile_clicks, SUM(m.website_clicks) AS website_clicks FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE ${range("m.metrics_timestamp", from, to)} GROUP BY 1),
web AS (SELECT entity_id::uuid AS entity_id, SUM(unique_book_now_clicks) AS book_online, TRUE AS book_active FROM mixpanel_website.daily_page_views WHERE ${range("week_start_date", from, to)} AND entity_id ~ '${UUIDRE}' GROUP BY 1),
rnk AS (
  SELECT entity_id, COUNT(*) AS kw,
    ROUND((100.0*COUNT(*) FILTER (WHERE cur_rank<=3)/NULLIF(COUNT(*),0))::numeric,2) AS top3_pct,
    ROUND(AVG(cur_rank)::numeric,1) AS avg_rank
  FROM (SELECT entity_id, keyword, avg_rank AS cur_rank, ROW_NUMBER() OVER (PARTITION BY entity_id, keyword ORDER BY dateval DESC) AS rn FROM local_seo.rank WHERE is_active) x
  WHERE rn=1 GROUP BY entity_id
),
imp AS (
  SELECT gl.entity_id, SUM(k.value) AS impressions
  FROM (SELECT location_name, value, (year*100+month) AS ym, MAX(year*100+month) OVER (PARTITION BY location_name) AS mx FROM gbp.keyword_impressions) k
  JOIN gbp.locations gl ON gl.name=k.location_name WHERE k.ym=k.mx GROUP BY gl.entity_id
),
-- payments (map chargebee customer <-> entity via subscription custom field)
ec AS (SELECT DISTINCT (custom_fields::jsonb->>'cf_entity_id')::uuid AS entity_id, customer_id FROM chargebee.subscriptions WHERE (custom_fields::jsonb->>'cf_entity_id') ~ '${UUIDRE}'),
nb AS (SELECT ec.entity_id, MIN(cs.next_billing_at) AS nbill FROM chargebee.subscriptions cs JOIN ec ON ec.customer_id=cs.customer_id WHERE cs.status IN ('active','non_renewing','future') AND cs.next_billing_at IS NOT NULL GROUP BY 1),
od AS (SELECT ec.entity_id, MIN(i.due_date) AS oldest_due FROM chargebee.invoices i JOIN ec ON ec.customer_id=i.customer_id WHERE i.deleted=false AND i.status='payment_due' AND i.amount_due>0 GROUP BY 1),
ms AS (SELECT ec.entity_id, COUNT(*) AS c FROM chargebee.transactions t JOIN ec ON ec.customer_id=t.customer_id WHERE t.status='failure' GROUP BY 1)
SELECT hs.entity_id, hs.gbp_title, loc.city, loc.state, hs.am_name,
       hs.health_tier, hs.composite_health_score, hs.score_engagement, hs.score_value_realization, hs.score_product_stability,
       hs.health_tier_reason_names, hs.recommended_action, hs.agents_paid_for, hs.total_mrr, hs.active_subs,
       COALESCE(leads.leads,0) AS leads_received,
       COALESCE(rev.reviews,0) AS reviews_received,
       COALESCE(pho.photos,0) AS photos_uploaded,
       COALESCE(met.profile_clicks,0) AS profile_clicks,
       COALESCE(met.website_clicks,0) AS website_clicks,
       COALESCE(web.book_online,0) AS book_online_clicks,
       COALESCE(web.book_active,false) AS book_online_active,
       rnk.kw AS keywords_tracked, rnk.top3_pct AS keywords_top3_pct, rnk.avg_rank AS avg_current_rank,
       COALESCE(imp.impressions,0) AS keyword_impressions,
       (nb.nbill::date - CURRENT_DATE) AS days_to_invoice,
       (CURRENT_DATE - od.oldest_due::date) AS days_overdue,
       COALESCE(ms.c,0) AS failed_payments,
       (CURRENT_DATE - hs.onboarding_date::date) AS tenure_days
FROM hs
LEFT JOIN loc USING(entity_id) LEFT JOIN leads USING(entity_id) LEFT JOIN rev USING(entity_id)
LEFT JOIN pho USING(entity_id) LEFT JOIN met USING(entity_id) LEFT JOIN web USING(entity_id)
LEFT JOIN rnk USING(entity_id) LEFT JOIN imp USING(entity_id)
LEFT JOIN nb USING(entity_id) LEFT JOIN od USING(entity_id) LEFT JOIN ms USING(entity_id)
ORDER BY hs.gbp_title`;
}

/** Lead-response timing (avg seconds) per account. */
export function timingSql(leadDays = 90, mixpanelDays = 120): string {
  return `
WITH be AS (SELECT entity_id, id AS enquiry_id, created_at FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND created_at >= now()-interval '${leadDays} days' AND entity_id IN (SELECT entity_id FROM cx.health_score)),
opened AS (SELECT lead_id, MIN(time) AS t FROM mixpanelzocaappdata.export WHERE event='Leads-View-Chat' AND lead_id IS NOT NULL AND time >= now()-interval '${mixpanelDays} days' GROUP BY lead_id),
contacted AS (SELECT enquiry_id, MIN(created_at) AS t FROM clients.communication_logs WHERE type IN ('SMS','CALL') GROUP BY enquiry_id),
j AS (SELECT be.entity_id, be.created_at, o.t AS opened_at, c.t AS contacted_at FROM be LEFT JOIN opened o ON o.lead_id::text=be.enquiry_id::text LEFT JOIN contacted c ON c.enquiry_id::text=be.enquiry_id::text)
SELECT entity_id,
  ROUND(AVG(EXTRACT(EPOCH FROM (opened_at-created_at))) FILTER (WHERE opened_at IS NOT NULL AND opened_at>=created_at)) AS recv_to_open_s,
  ROUND(AVG(EXTRACT(EPOCH FROM (contacted_at-created_at))) FILTER (WHERE contacted_at IS NOT NULL AND contacted_at>=created_at)) AS recv_to_contact_s,
  ROUND(AVG(EXTRACT(EPOCH FROM (contacted_at-opened_at))) FILTER (WHERE contacted_at IS NOT NULL AND opened_at IS NOT NULL AND contacted_at>=opened_at)) AS open_to_contact_s
FROM j GROUP BY entity_id`;
}

// (Tickets now come from the Linear Metabase CSV via src/lib/tickets.ts — the
// Beacon-parity source — not from hubspot.tickets. Removed the HubSpot query.)

/** current-vs-previous deltas + 12-week sparklines. prev = [from-lenDays, from). */
export function trendsSql(from: string, to: string, lenDays: number): string {
  const cur = (col: string) => range(col, from, to);
  const prev = (col: string) => `${col} >= '${from}'::timestamptz - interval '${lenDays} days' AND ${col} < '${from}'::timestamptz`;
  return `
WITH
lc AS (SELECT entity_id, COUNT(*) c FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND ${cur("created_at")} GROUP BY 1),
lp AS (SELECT entity_id, COUNT(*) c FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND ${prev("created_at")} GROUP BY 1),
rc AS (SELECT entity_id, COUNT(*) c FROM reviews.reviews WHERE is_deleted=false AND ${cur("review_time")} GROUP BY 1),
rp AS (SELECT entity_id, COUNT(*) c FROM reviews.reviews WHERE is_deleted=false AND ${prev("review_time")} GROUP BY 1),
pc AS (SELECT gl.entity_id, SUM(${PC}) c FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE ${cur("m.metrics_timestamp")} GROUP BY 1),
pp AS (SELECT gl.entity_id, SUM(${PC}) c FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE ${prev("m.metrics_timestamp")} GROUP BY 1),
lspark AS (SELECT entity_id, json_agg(json_build_object('w',to_char(wk,'YYYY-MM-DD'),'c',c) ORDER BY wk) s FROM (SELECT entity_id, date_trunc('week',created_at)::date wk, COUNT(*) c FROM website.booking_enquiries WHERE source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '84 days' GROUP BY 1,2) x GROUP BY 1),
pspark AS (SELECT entity_id, json_agg(json_build_object('w',to_char(wk,'YYYY-MM-DD'),'c',c) ORDER BY wk) s FROM (SELECT gl.entity_id, date_trunc('week',m.metrics_timestamp)::date wk, SUM(${PC}) c FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE m.metrics_timestamp>=now()-interval '84 days' GROUP BY 1,2) y GROUP BY 1)
SELECT hs.entity_id,
  COALESCE(lc.c,0) cur_leads, COALESCE(lp.c,0) prev_leads,
  COALESCE(rc.c,0) cur_reviews, COALESCE(rp.c,0) prev_reviews,
  COALESCE(pc.c,0) cur_clicks, COALESCE(pp.c,0) prev_clicks,
  lspark.s leads_spark, pspark.s clicks_spark
FROM cx.health_score hs
LEFT JOIN lc USING(entity_id) LEFT JOIN lp USING(entity_id) LEFT JOIN rc USING(entity_id) LEFT JOIN rp USING(entity_id)
LEFT JOIN pc USING(entity_id) LEFT JOIN pp USING(entity_id) LEFT JOIN lspark USING(entity_id) LEFT JOIN pspark USING(entity_id)`;
}

// ---- per-account detail (unchanged) ---------------------------------------
export function detailProfileWeeklySql(id: string): string {
  return `
WITH g AS (SELECT date_trunc('week',m.metrics_timestamp)::date wk, SUM(m.website_clicks) wc, SUM(m.call_clicks) cc, SUM(m.business_direction_requests) dc, SUM(${PC}) pc FROM gbp.metrics m JOIN gbp.locations gl ON gl.name=m.location_name WHERE gl.entity_id='${id}'::uuid AND m.metrics_timestamp>=now()-interval '26 weeks' GROUP BY 1),
l AS (SELECT date_trunc('week',created_at)::date wk, COUNT(*) leads FROM website.booking_enquiries WHERE entity_id='${id}'::uuid AND source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '26 weeks' GROUP BY 1)
SELECT to_char(COALESCE(g.wk,l.wk),'YYYY-MM-DD') wk, COALESCE(g.pc,0) profile_clicks, COALESCE(g.wc,0) website_clicks, COALESCE(g.cc,0) call_clicks, COALESCE(g.dc,0) directions, COALESCE(l.leads,0) leads, COALESCE(g.wc,0)+COALESCE(g.cc,0)+COALESCE(g.dc,0) total_interactions
FROM g FULL JOIN l ON g.wk=l.wk ORDER BY 1`;
}
export function detailLeadsReviewsMonthlySql(id: string): string {
  return `
WITH l AS (SELECT date_trunc('month',created_at)::date m, COUNT(*) leads FROM website.booking_enquiries WHERE entity_id='${id}'::uuid AND source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '12 months' GROUP BY 1),
r AS (SELECT date_trunc('month',review_time)::date m, COUNT(*) reviews FROM reviews.reviews WHERE entity_id='${id}'::uuid AND is_deleted=false AND review_time>=now()-interval '12 months' GROUP BY 1)
SELECT to_char(COALESCE(l.m,r.m),'YYYY-MM') mon, COALESCE(l.leads,0) leads, COALESCE(r.reviews,0) reviews FROM l FULL JOIN r ON l.m=r.m ORDER BY 1`;
}
export function detailRankTrendSql(id: string): string {
  return `SELECT to_char(dateval,'YYYY-MM-DD') d, ROUND((100.0*COUNT(*) FILTER (WHERE avg_rank<=3)/NULLIF(COUNT(*),0))::numeric,1) top3, ROUND(AVG(avg_rank)::numeric,1) avg_rank FROM local_seo.rank WHERE entity_id='${id}'::uuid AND is_active GROUP BY dateval ORDER BY dateval DESC LIMIT 16`;
}
export function detailFunnelSql(id: string, windowDays: number): string {
  return `
WITH be AS (SELECT id AS enquiry_id, status FROM website.booking_enquiries WHERE entity_id='${id}'::uuid AND source='WEBSITE' AND is_test_lead=false AND created_at>=now()-interval '${windowDays} days'),
opened AS (SELECT DISTINCT lead_id FROM mixpanelzocaappdata.export WHERE event='Leads-View-Chat' AND lead_id IS NOT NULL),
contacted AS (SELECT DISTINCT enquiry_id FROM clients.communication_logs WHERE type IN ('SMS','CALL'))
SELECT COUNT(*) enquiries,
  COUNT(*) FILTER (WHERE be.enquiry_id::text IN (SELECT lead_id::text FROM opened)) opened,
  COUNT(*) FILTER (WHERE be.enquiry_id::text IN (SELECT enquiry_id::text FROM contacted)) contacted,
  COUNT(*) FILTER (WHERE be.status='BOOKED') booked
FROM be`;
}

// ============================================================================
// Extra per-account detail charts (ported from the Retool Customer Dashboard).
// Each is parameterized on `id` (a UUID, validated by the /api/account route).
// ============================================================================

/** Weekly app engagement (Mixpanel) — home/leads/reviews/photos screen opens. */
export function detailAppUsageSql(id: string): string {
  return `SELECT date_trunc('week', time::date)::date AS wk,
    SUM((event = 'Home-View-Home')::int) AS app_open,
    SUM((event LIKE 'Leads-%')::int)     AS leads_view,
    SUM((event LIKE 'Review-%')::int)    AS reviews_view,
    SUM((event LIKE 'Photos-%')::int)    AS photos_view
  FROM mixpanelzocaappdata.export
  WHERE "locationEntityId" = '${id}' AND time >= (CURRENT_DATE - INTERVAL '140 days')
  GROUP BY 1 ORDER BY 1`;
}

/** Weekly unique leads vs unique bookings (last 3 months). */
export function detailBookingsSql(id: string): string {
  return `WITH weeks AS (SELECT generate_series(date_trunc('week',current_date-interval '3 months'),date_trunc('week',current_date),'1 week'::interval)::date ws),
    lw AS (SELECT date_trunc('week',created_at)::date ws, count(distinct client_id) leads FROM website.booking_enquiries WHERE entity_id='${id}'::uuid AND is_test_lead=false AND created_at>=current_date-interval '3 months' GROUP BY 1),
    bw AS (SELECT date_trunc('week',created_at)::date ws, count(distinct client_id) bookings FROM scheduling.bookings WHERE entity_id='${id}'::uuid AND created_at>=current_date-interval '3 months' GROUP BY 1)
    SELECT to_char(w.ws,'YYYY-MM-DD') label, coalesce(lw.leads,0) leads, coalesce(bw.bookings,0) bookings
    FROM weeks w LEFT JOIN lw ON lw.ws=w.ws LEFT JOIN bw ON bw.ws=w.ws ORDER BY w.ws`;
}

/** Latest rank per keyword (top by best avg rank). */
export function detailKeywordRankSql(id: string): string {
  return `WITH base AS (SELECT keyword, floor(avg_rank) avg_rank, floor(min_rank) min_rank, search_volume,
      rank() over(partition by keyword order by created_at::date desc) rnk FROM local_seo.rank WHERE entity_id='${id}')
    SELECT keyword, avg_rank, min_rank, search_volume FROM base WHERE rnk=1 AND avg_rank IS NOT NULL ORDER BY avg_rank ASC LIMIT 60`;
}

/** Monthly Google search impressions (summed across keywords). */
export function detailImpressionsSql(id: string): string {
  return `WITH loc AS (SELECT entity_id, name FROM gbp.locations)
    SELECT ki.year||'-'||lpad(ki.month::text,2,'0') ym, sum(ki.value) impressions
    FROM gbp.keyword_impressions ki JOIN loc ON loc.name::text = ki.location_name::text
    WHERE loc.entity_id='${id}' GROUP BY 1 ORDER BY 1`;
}

/** Review rating distribution + 30/90-day velocity. */
export function detailReviewsDistSql(id: string): string {
  return `SELECT rating::text rating, count(*)::int n,
      count(*) filter (where created_at > now() - interval '30 days')::int n30,
      count(*) filter (where created_at > now() - interval '90 days')::int n90
    FROM reviews.reviews WHERE entity_id='${id}' GROUP BY 1`;
}

/** Weekly comms activity (SMS / calls) joined via enquiry → entity. */
export function detailCommsSql(id: string): string {
  return `SELECT date_trunc('week', cl.created_at)::date wk,
      sum((cl.type='SMS')::int) sms, sum((cl.type='CALL')::int) call
    FROM clients.communication_logs cl
    JOIN website.booking_enquiries be ON be.id::text = cl.enquiry_id::text
    WHERE be.entity_id='${id}'::uuid AND cl.created_at >= current_date - interval '3 months'
    GROUP BY 1 ORDER BY 1`;
}

/** Weekly net media (photos) delta on the GBP — cumulate in JS for "live" count. */
export function detailMediaSql(id: string): string {
  return `WITH base AS (SELECT create_time::timestamptz cat, deleted_at, is_deleted FROM gbp.media_items WHERE entity_id='${id}'),
    s AS (SELECT date_trunc('week', cat)::date wk, 1 p FROM base WHERE cat IS NOT NULL
          UNION ALL SELECT date_trunc('week', deleted_at::timestamptz)::date wk, -1 p FROM base WHERE is_deleted=true AND deleted_at IS NOT NULL)
    SELECT wk, sum(p)::int delta FROM s WHERE wk IS NOT NULL GROUP BY 1 ORDER BY 1`;
}

/** ICP-predicted 6-month leads vs actual leads delivered. */
export function detailForecastSql(id: string): string {
  return `SELECT
      (SELECT predicted_6_month_leads FROM entities.location_insights WHERE entity_id::text='${id}' ORDER BY created_at DESC LIMIT 1) AS predicted,
      (SELECT count(*) FROM website.booking_enquiries WHERE entity_id='${id}'::uuid AND is_test_lead=false AND created_at >= current_date - interval '6 months') AS actual`;
}

// ============================================================================
// Row-level detail (the Retool "Reviews List" / "Lead Table" widgets) — the
// actual records, not just aggregates.
// ============================================================================

/** Every non-deleted review with its text, author, rating, platform, date. */
export function detailReviewsListSql(id: string): string {
  return `SELECT reviewer_name, rating::text rating, platform, review_text,
      to_char(COALESCE(review_time, created_at),'YYYY-MM-DD') d
    FROM reviews.reviews
    WHERE entity_id='${id}'::uuid AND is_deleted=false
    ORDER BY COALESCE(review_time, created_at) DESC NULLS LAST
    LIMIT 300`;
}

/** Individual lead rows (booking enquiries) within the selected window. */
export function detailLeadsListSql(id: string, windowDays: number): string {
  return `SELECT to_char(created_at,'YYYY-MM-DD') d, source, status,
      COALESCE(service, service_variation_name) service, price, currency, utm_source
    FROM website.booking_enquiries
    WHERE entity_id='${id}'::uuid AND is_test_lead=false
      AND created_at >= now() - interval '${windowDays} days'
    ORDER BY created_at DESC
    LIMIT 500`;
}
