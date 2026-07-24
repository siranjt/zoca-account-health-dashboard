import { NextResponse } from "next/server";
import { getSql, neonUrl } from "@/lib/neon";
import { postActivitySlack, who, type Actor } from "@/lib/activity";

// Hourly rollup: every event from the last hour, grouped by person, posted as
// one narrative message. Complements the real-time pings — this is where the
// page-view-level detail surfaces without flooding the channel in real time.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

interface Row {
  email: string | null; name: string | null; role: string | null; am_name: string | null;
  event: string; entity_id: string | null; detail: Record<string, unknown> | null;
}

const VERB: Record<string, (n: number, d?: Record<string, unknown>) => string> = {
  page_view: (n) => `${n} page view${n === 1 ? "" : "s"}`,
  account_opened: (n) => `opened ${n} account${n === 1 ? "" : "s"}`,
  tab_viewed: (n) => `${n} tab view${n === 1 ? "" : "s"}`,
  alfred_asked: (n) => `${n} Alfred ask${n === 1 ? "" : "s"}`,
  window_changed: (n) => `changed window ${n}×`,
  product_toggled: (n) => `checked product MRR ${n}×`,
  csv_exported: (n) => `exported CSV ${n}×`,
  website_checked: (n) => `${n} website check${n === 1 ? "" : "s"}`,
  sign_in: () => `signed in`,
  sign_out: () => `signed out`,
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  }
  if (!neonUrl()) return NextResponse.json({ ok: false, reason: "no database configured" });

  const sql = getSql();
  const rows = (await sql`
    SELECT email, name, role, am_name, event, entity_id, detail
    FROM cave_activity_log
    WHERE ts > NOW() - INTERVAL '1 hour'
    ORDER BY COALESCE(name, email), event
  `) as Row[];

  if (!rows.length) return NextResponse.json({ ok: true, count: 0, posted: false });

  // group by actor
  const byUser = new Map<string, { actor: Actor; events: Map<string, { n: number; sample?: Record<string, unknown> }> }>();
  for (const r of rows) {
    const key = r.email || r.name || "unknown";
    let u = byUser.get(key);
    if (!u) {
      u = { actor: { email: r.email, name: r.name, role: (r.role as Actor["role"]) ?? null, amName: r.am_name }, events: new Map() };
      byUser.set(key, u);
    }
    const e = u.events.get(r.event) ?? { n: 0, sample: r.detail ?? undefined };
    e.n += 1;
    u.events.set(r.event, e);
  }

  const lines: string[] = [`:bar_chart: *CAVE//OS activity · last hour* — ${byUser.size} ${byUser.size === 1 ? "person" : "people"}, ${rows.length} action${rows.length === 1 ? "" : "s"}`];
  for (const { actor, events } of byUser.values()) {
    const total = [...events.values()].reduce((s, e) => s + e.n, 0);
    const parts = [...events.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([ev, e]) => (VERB[ev] ? VERB[ev](e.n, e.sample) : `${e.n}× ${ev}`));
    lines.push(`${who(actor)} — ${total} action${total === 1 ? "" : "s"}\n     • ${parts.join(" · ")}`);
  }

  await postActivitySlack(lines.join("\n"));
  return NextResponse.json({ ok: true, count: rows.length, users: byUser.size, posted: !!process.env.ACTIVITY_SLACK_WEBHOOK_URL });
}
