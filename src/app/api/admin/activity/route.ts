import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getSql, neonUrl } from "@/lib/neon";

// Admin-only read over the activity log: recent rows (filterable by person /
// event / window) plus event + user facet counts for the filter dropdowns.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!neonUrl()) return NextResponse.json({ rows: [], events: [], users: [], reason: "activity store not configured" });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200));
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days")) || 7));
  const user = searchParams.get("user") || null;
  const event = searchParams.get("event") || null;

  const sql = getSql();
  try {
    const [rows, events, users] = await Promise.all([
      sql`SELECT id, email, name, role, am_name, event, surface, entity_id, detail, ts
          FROM cave_activity_log
          WHERE ts > NOW() - make_interval(days => ${days})
            AND (${user}::text IS NULL OR email = ${user})
            AND (${event}::text IS NULL OR event = ${event})
          ORDER BY ts DESC LIMIT ${limit}`,
      sql`SELECT event, count(*)::int n FROM cave_activity_log
          WHERE ts > NOW() - make_interval(days => ${days}) GROUP BY 1 ORDER BY n DESC`,
      sql`SELECT COALESCE(name, email) label, email, count(*)::int n FROM cave_activity_log
          WHERE ts > NOW() - make_interval(days => ${days}) GROUP BY 1, 2 ORDER BY n DESC LIMIT 60`,
    ]);
    return NextResponse.json({ rows, events, users }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Table may not exist yet (no events logged). Return empty rather than 500.
    return NextResponse.json({ rows: [], events: [], users: [], reason: String((e as Error)?.message || e).slice(0, 200) });
  }
}
