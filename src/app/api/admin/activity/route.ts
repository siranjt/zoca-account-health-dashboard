import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getSql, neonUrl } from "@/lib/neon";
import { resolveDayRange } from "@/lib/istDate";

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
  // ?from=&to= (IST calendar days) or ?days=N. Same helper as the impact route,
  // so one timezone rule serves both. The 90-day ceiling stays: this endpoint
  // returns ROWS, not aggregates.
  const resolved = resolveDayRange(searchParams, { defaultDays: 7, maxDays: 90 });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const from = resolved.range.fromUtc.toISOString();
  const to = resolved.range.toUtc.toISOString();
  const user = searchParams.get("user") || null;
  const event = searchParams.get("event") || null;

  const sql = getSql();
  try {
    const [rows, events, users, matched] = await Promise.all([
      sql`SELECT id, email, name, role, am_name, event, surface, entity_id, detail, ts
          FROM cave_activity_log
          WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz
            AND (${user}::text IS NULL OR email = ${user})
            AND (${event}::text IS NULL OR event = ${event})
          ORDER BY ts DESC LIMIT ${limit}`,
      sql`SELECT event, count(*)::int n FROM cave_activity_log
          WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz GROUP BY 1 ORDER BY n DESC`,
      sql`SELECT COALESCE(name, email) label, email, count(*)::int n FROM cave_activity_log
          WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz GROUP BY 1, 2 ORDER BY n DESC LIMIT 60`,
      // How many rows the filters ACTUALLY match, so truncation can be stated
      // rather than inferred. A date picker makes it trivial to ask for a range
      // wider than `limit`, and a silently short list on a page someone is using
      // to count things is the same defect as the 2000-row Metabase cap already
      // logged in docs/tasks/am-report-OPEN-DEFECTS.md.
      sql`SELECT count(*)::int n FROM cave_activity_log
          WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz
            AND (${user}::text IS NULL OR email = ${user})
            AND (${event}::text IS NULL OR event = ${event})`,
    ]);
    const total = Number((matched as Record<string, unknown>[])[0]?.n ?? 0);
    const returned = (rows as unknown[]).length;
    return NextResponse.json(
      {
        rows, events, users,
        total, returned, limit,
        truncated: total > returned,
        from: resolved.range.fromDate,
        to: resolved.range.toDate,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // Table may not exist yet (no events logged). Return empty rather than 500.
    return NextResponse.json({ rows: [], events: [], users: [], reason: String((e as Error)?.message || e).slice(0, 200) });
  }
}
