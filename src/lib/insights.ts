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

export async function getSupportTickets(entityId: string) {
  const id = esc(entityId);
  if (!id) return { available: false as const, reason: "no entity_id" };
  try {
    const rows = await queryAurora(`
      select subject, status, priority, hubspot_owner_name, created_at::date d,
             count(*) over()::int total
      from hubspot.tickets
      where location_entity_id = '${id}' or user_entity_id = '${id}'
      order by created_at desc
      limit 12`);
    const total = rows.length ? Number(rows[0].total) || rows.length : 0;
    return {
      total_open: total,
      showing: rows.length,
      tickets: rows.map((r) => ({
        subject: r.subject, status: r.status, priority: r.priority,
        owner: r.hubspot_owner_name || null, created: r.d,
      })),
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
