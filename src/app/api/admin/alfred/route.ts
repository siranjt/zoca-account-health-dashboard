import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getSql, neonUrl } from "@/lib/neon";
import { ensureAlfred } from "@/lib/memory";

// Admin-only Alfred usage: summary + leaderboards (askers / accounts / tools)
// + a browsable conversation log. Reads alfred.messages only. Never Slack.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// List-price estimate ($ per 1M tokens) by model family. Actual cost may be
// lower with prompt caching; this is a ceiling estimate for tracking.
const PRICE: Record<string, { in: number; out: number }> = {
  opus: { in: 15, out: 75 },
  sonnet: { in: 3, out: 15 },
  haiku: { in: 0.8, out: 4 },
  fable: { in: 3, out: 15 },
};
function priceFor(model?: string | null) {
  const m = (model || "").toLowerCase();
  if (m.includes("opus")) return PRICE.opus;
  if (m.includes("haiku")) return PRICE.haiku;
  if (m.includes("fable")) return PRICE.fable;
  return PRICE.sonnet; // default / unknown
}
function costOf(model: string | null | undefined, tokensIn: number, tokensOut: number): number {
  const p = priceFor(model);
  return (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
}

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!neonUrl()) return NextResponse.json({ reason: "Alfred store not configured", summary: null, askers: [], accounts: [], tools: [], conversations: [], daily: [] });

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

    const [summaryR, askerRows, accounts, tools, conversations, dailyRows] = await Promise.all([
      sql`SELECT count(*)::int total, count(DISTINCT email)::int users,
                 coalesce(round(avg(latency_ms)),0)::int avg_ms,
                 coalesce(sum(tokens_in),0)::bigint tok_in, coalesce(sum(tokens_out),0)::bigint tok_out
          FROM alfred.messages WHERE ts > now() - make_interval(days => ${days})`,
      // per person + model, so cost can be computed with the right price per model
      sql`SELECT COALESCE(name, email, 'unknown') label, email, model,
                 count(*)::int n, coalesce(sum(tokens_in),0)::bigint ti, coalesce(sum(tokens_out),0)::bigint too
          FROM alfred.messages WHERE ts > now() - make_interval(days => ${days})
          GROUP BY 1, 2, 3`,
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
      // per day + model, for the daily cost trend
      sql`SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') d, model,
                 coalesce(sum(tokens_in),0)::bigint ti, coalesce(sum(tokens_out),0)::bigint too
          FROM alfred.messages WHERE ts > now() - make_interval(days => ${days})
          GROUP BY 1, 2`,
    ]);

    // daily cost trend (gap-filled across the window)
    const dayCost = new Map<string, number>();
    for (const r of dailyRows as Array<{ d: string; model: string | null; ti: number; too: number }>) {
      dayCost.set(r.d, (dayCost.get(r.d) ?? 0) + costOf(r.model, Number(r.ti), Number(r.too)));
    }
    const daily: Array<{ day: string; cost: number }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(today);
      dt.setUTCDate(dt.getUTCDate() - i);
      const key = dt.toISOString().slice(0, 10);
      daily.push({ day: key, cost: Math.round((dayCost.get(key) ?? 0) * 100) / 100 });
    }

    // roll up per-person cost (list-price estimate) from the per-model rows
    const perPerson = new Map<string, { label: string; email: string | null; n: number; cost: number }>();
    let totalCost = 0;
    for (const r of askerRows as Array<{ label: string; email: string | null; model: string | null; n: number; ti: number; too: number }>) {
      const c = costOf(r.model, Number(r.ti), Number(r.too));
      totalCost += c;
      const key = r.email || r.label;
      const p = perPerson.get(key) ?? { label: r.label, email: r.email, n: 0, cost: 0 };
      p.n += r.n; p.cost += c;
      perPerson.set(key, p);
    }
    const askers = [...perPerson.values()].sort((a, b) => b.n - a.n).slice(0, 20)
      .map((p) => ({ ...p, cost: Math.round(p.cost * 100) / 100 }));

    const summary = {
      ...((summaryR as Array<Record<string, unknown>>)[0] ?? {}),
      cost: Math.round(totalCost * 100) / 100,
      cost_per_day: Math.round((totalCost / days) * 100) / 100,
    };

    return NextResponse.json({ summary, askers, accounts, tools, conversations, daily }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ reason: String((e as Error)?.message || e).slice(0, 200), summary: null, askers: [], accounts: [], tools: [], conversations: [], daily: [] });
  }
}
