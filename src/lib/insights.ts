import "server-only";
import { queryAurora } from "@/lib/metabase";

// Alfred Batch 2 pt.2 — HubSpot support tickets and review-level detail, both
// read directly from Zoca Aurora (read-only), keyed by entity_id:
//   hubspot.tickets.location_entity_id / user_entity_id
//   reviews.reviews.entity_id  (rating is an enum: FIVE..ZERO)

const RATING_MAP: Record<string, number> = { FIVE: 5, FOUR: 4, THREE: 3, TWO: 2, ONE: 1, ZERO: 0 };

// entity_ids come from our own account list (not user free-text), but escape
// single quotes defensively before interpolation.
const esc = (id: string) => String(id || "").replace(/'/g, "''");

export async function getSupportTickets(entityId: string, windowDays = 30) {
  const id = esc(entityId);
  if (!id) return { available: false as const, reason: "no entity_id" };
  const days = Math.min(Math.max(windowDays, 1), 365);
  try {
    // location_entity_id is the ACCOUNT the ticket is about. The curated
    // hubspot.tickets status is unreliable, so join hubspot_stitch.tickets for
    // the real open/closed state (property_hs_is_closed) and close date.
    const [cats, recent] = await Promise.all([
      queryAurora(`
        select substring(ht.subject from '^[A-Z_]+') category,
          count(*) filter (where st.property_hs_is_closed::text='false')::int active,
          count(*) filter (where st.property_hs_is_closed::text='true'
                             and st.property_closed_date::timestamptz >= now() - interval '${days} days')::int closed
        from hubspot.tickets ht
        join hubspot_stitch.tickets st on st.id = ht.hubspot_ticket_id
        where ht.location_entity_id = '${id}'
        group by 1`),
      queryAurora(`
        select ht.subject, ht.priority, ht.hubspot_owner_name, ht.created_at::date d
        from hubspot.tickets ht
        join hubspot_stitch.tickets st on st.id = ht.hubspot_ticket_id
        where ht.location_entity_id = '${id}' and st.property_hs_is_closed::text='false'
        order by ht.created_at desc limit 10`),
    ]);
    const byCat = cats
      .map((c) => ({ category: c.category || "OTHER", active: Number(c.active) || 0, closed: Number(c.closed) || 0 }))
      .filter((c) => c.active > 0 || c.closed > 0)
      .sort((a, b) => (b.active + b.closed) - (a.active + a.closed));
    return {
      active_total: byCat.reduce((s, c) => s + c.active, 0),
      closed_in_window_total: byCat.reduce((s, c) => s + c.closed, 0),
      window_days: days,
      by_category: byCat,
      category_note: "category = ticket subject prefix. website = WEBSITE_*; billing/finance = SUBSCIPTION_SUPPORT; google/GBP = GOOGLE_SUPPORT + GBP_*; also REVIEWS_/LEADS_/SOCIAL_MEDIA_/ADS_/APP_/LOYALTY_SUPPORT, *_OFFBOARDING, DELETE_MEDIA. Sum the matching prefixes for a grouped question. 'closed' counts tickets closed within the window_days only; 'active' is current open.",
      recent_active: recent.map((r) => ({ subject: r.subject, priority: r.priority, owner: r.hubspot_owner_name || null, created: r.d })),
    };
  } catch (e) {
    return { available: false as const, reason: `tickets query failed: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
}

export async function getReviewsDetail(entityId: string) {
  const id = esc(entityId);
  if (!id) return { available: false as const, reason: "no entity_id" };
  try {
    const [agg, recent] = await Promise.all([
      queryAurora(`
        select rating::text rating, count(*)::int n,
          count(*) filter (where created_at > now() - interval '30 days')::int n30,
          count(*) filter (where created_at > now() - interval '90 days')::int n90
        from reviews.reviews where entity_id = '${id}' group by 1`),
      queryAurora(`
        select reviewer_name, rating::text rating, created_at::date d
        from reviews.reviews where entity_id = '${id}' order by created_at desc limit 5`),
    ]);
    let total = 0, sum = 0, rated = 0, n30 = 0, n90 = 0;
    const dist: Record<string, number> = {};
    for (const r of agg) {
      const c = Number(r.n) || 0;
      const key = String(r.rating ?? "");
      total += c;
      n30 += Number(r.n30) || 0;
      n90 += Number(r.n90) || 0;
      if (key) dist[key] = c;
      const v = RATING_MAP[key];
      if (v != null) { sum += v * c; rated += c; }
    }
    return {
      total_reviews: total,
      avg_rating: rated ? Math.round((sum / rated) * 100) / 100 : null,
      rating_distribution: dist,
      last_30_days: n30,
      last_90_days: n90,
      recent: recent.map((r) => ({ reviewer: r.reviewer_name || null, rating: RATING_MAP[String(r.rating)] ?? r.rating, date: r.d })),
    };
  } catch (e) {
    return { available: false as const, reason: `reviews query failed: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
}
