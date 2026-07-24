import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getSql, neonUrl } from "@/lib/neon";
import { ensureAlfred } from "@/lib/memory";

// Admin-only Alfred usage: summary + leaderboards (askers / accounts / tools)
// + a browsable conversation log. Reads alfred.messages only. Never Slack.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!neonUrl()) return NextResponse.json({ reason: "Alfred store not configured", summary: null, askers: [], accounts: [], tools: [], conversations: [] });

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
  const limit = Math.min(300, Math.max(1, Number(searchParams.get("limit")) || 100));
  const user = searchParams.get("user") || null;
  const q = searchParams.get("q")?.trim() || null;

  try {
    await ensureAlfred();
    const sql = getSql();
    const like = q ? `%${q}%` : null;

    // CSV export of the (filtered) conversation log.
    if (searchParams.get("format") === "csv") {
      const rows = (await sql`
        SELECT ts, email, name, am_name, role, question, reply, tools, entities, status, latency_ms, tokens_in, tokens_out, model
        FROM alfred.messages
        WHERE ts > now() - make_interval(days => ${days})
          AND (${user}::text IS NULL OR email = ${user})
          AND (${like}::text IS NULL OR question ILIKE ${like} OR reply ILIKE ${like})
        ORDER BY ts DESC LIMIT 5000`) as Array<Record<string, unknown>>;
      const cell = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["When", "Who", "Email", "Role", "AM", "Accounts", "Question", "Reply", "Tools", "LatencyMs", "TokensIn", "TokensOut", "Model", "Status"];
      const lines = [header.join(",")];
      for (const r of rows) {
        const ents = Array.isArray(r.entities) ? (r.entities as Array<{ name?: string }>).map((e) => e?.name).filter(Boolean).join(" | ") : "";
        const tools = Array.isArray(r.tools) ? (r.tools as string[]).join(" | ") : "";
        const email = (r.email as string) || "";
        lines.push([
          new Date(r.ts as string).toISOString(), (r.name as string) || email.split("@")[0] || "", email,
          (r.role as string) || "", (r.am_name as string) || "", ents, (r.question as string) || "", (r.reply as string) || "",
          tools, r.latency_ms ?? "", r.tokens_in ?? "", r.tokens_out ?? "", (r.model as string) || "", (r.status as string) || "",
        ].map(cell).join(","));
      }
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="alfred-conversations-${days}d.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const [summary, askers, accounts, tools, conversations] = await Promise.all([
      sql`SELECT count(*)::int total, count(DISTINCT email)::int users,
                 coalesce(round(avg(latency_ms)),0)::int avg_ms,
                 coalesce(sum(tokens_in),0)::bigint tok_in, coalesce(sum(tokens_out),0)::bigint tok_out
          FROM alfred.messages WHERE ts > now() - make_interval(days => ${days})`,
      sql`SELECT COALESCE(name, email, 'unknown') label, email, count(*)::int n
          FROM alfred.messages WHERE ts > now() - make_interval(days => ${days})
          GROUP BY 1, 2 ORDER BY n DESC LIMIT 20`,
      sql`SELECT e->>'name' name, count(*)::int n
          FROM alfred.messages, jsonb_array_elements(entities) e
          WHERE ts > now() - make_interval(days => ${days}) AND jsonb_typeof(entities)='array' AND e->>'name' IS NOT NULL
          GROUP BY 1 ORDER BY n DESC LIMIT 15`,
      sql`SELECT t tool, count(*)::int n
          FROM alfred.messages, jsonb_array_elements_text(tools) t
          WHERE ts > now() - make_interval(days => ${days}) AND jsonb_typeof(tools)='array'
          GROUP BY 1 ORDER BY n DESC LIMIT 15`,
      sql`SELECT id, ts, email, name, am_name, role, question, reply, tools, entities, status, latency_ms, tokens_in, tokens_out, model
          FROM alfred.messages
          WHERE ts > now() - make_interval(days => ${days})
            AND (${user}::text IS NULL OR email = ${user})
            AND (${like}::text IS NULL OR question ILIKE ${like} OR reply ILIKE ${like})
          ORDER BY ts DESC LIMIT ${limit}`,
    ]);
    return NextResponse.json(
      { summary: (summary as unknown[])[0] ?? null, askers, accounts, tools, conversations },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ reason: String((e as Error)?.message || e).slice(0, 200), summary: null, askers: [], accounts: [], tools: [], conversations: [] });
  }
}
