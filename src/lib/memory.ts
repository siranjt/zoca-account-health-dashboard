import "server-only";
import { getSql, neonUrl } from "@/lib/neon";

// Alfred's durable memory (Batch: durable-memory). Every /api/ask interaction
// is logged to alfred.messages (isolated schema in Neon) so Alfred can recall
// past conversations across sessions. Read/append only to his OWN schema —
// never beacon's tables or the production Keeper.

export type LogRec = {
  question: string; reply: string; tools: string[];
  entities: Array<{ name: string; entityId: string }>;
  status: string; latency_ms: number; tokens_in: number; tokens_out: number; model: string;
  // who asked — so conversations are attributed per person (for training + usage)
  email?: string | null; name?: string | null; am_name?: string | null; role?: string | null;
};

// Self-healing: creates the schema/table if missing and adds the actor columns
// to a pre-existing alfred.messages. Runs once per warm instance.
let ensuredAlfred = false;
export async function ensureAlfred(): Promise<void> {
  if (ensuredAlfred) return;
  const sql = getSql();
  await sql`CREATE SCHEMA IF NOT EXISTS alfred`;
  await sql`CREATE TABLE IF NOT EXISTS alfred.messages (
    id BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    question TEXT, reply TEXT, tools JSONB, entities JSONB, status TEXT,
    latency_ms INT, tokens_in INT, tokens_out INT, model TEXT
  )`;
  await sql`ALTER TABLE alfred.messages ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE alfred.messages ADD COLUMN IF NOT EXISTS name TEXT`;
  await sql`ALTER TABLE alfred.messages ADD COLUMN IF NOT EXISTS am_name TEXT`;
  await sql`ALTER TABLE alfred.messages ADD COLUMN IF NOT EXISTS role TEXT`;
  ensuredAlfred = true;
}

export async function logInteraction(r: LogRec): Promise<void> {
  if (!neonUrl()) return;
  try {
    await ensureAlfred();
    await getSql()`
      INSERT INTO alfred.messages
        (question, reply, tools, entities, status, latency_ms, tokens_in, tokens_out, model, email, name, am_name, role)
      VALUES
        (${r.question}, ${r.reply}, ${JSON.stringify(r.tools)}::jsonb, ${JSON.stringify(r.entities)}::jsonb,
         ${r.status}, ${r.latency_ms}, ${r.tokens_in}, ${r.tokens_out}, ${r.model},
         ${r.email ?? null}, ${r.name ?? null}, ${r.am_name ?? null}, ${r.role ?? null})`;
  } catch { /* memory logging must never break a reply */ }
}

// --- Alfred's own remembered facts (Bat Cave Memory, append-only) ---

export async function rememberFact(r: { fact: string; entityId?: string; entityName?: string; source?: string }): Promise<{ ok: boolean; reason?: string }> {
  if (!neonUrl()) return { ok: false, reason: "memory store not configured" };
  const fact = (r.fact || "").trim();
  if (!fact) return { ok: false, reason: "empty fact" };
  try {
    await getSql()`
      INSERT INTO alfred.facts (entity_id, entity_name, fact, source)
      VALUES (${r.entityId || null}, ${r.entityName || null}, ${fact}, ${r.source || "user"})`;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message || e).slice(0, 140) };
  }
}

export async function getSavedNotes(entityId: string, limit = 20): Promise<Array<{ date: string; fact: string }>> {
  if (!neonUrl() || !entityId) return [];
  try {
    const rows = (await getSql()`
      SELECT to_char(ts,'DD/MM/YY') d, fact FROM alfred.facts
      WHERE entity_id = ${entityId} AND soft_deleted_at IS NULL
      ORDER BY ts DESC LIMIT ${Math.min(limit, 30)}`) as Array<{ d: string; fact: string }>;
    return rows.map((r) => ({ date: r.d, fact: r.fact }));
  } catch {
    return [];
  }
}

// --- Usage stats (analytics over the interaction log) ---

export async function getUsageStats(days = 30) {
  if (!neonUrl()) return { available: false as const, reason: "memory store not configured" };
  const d = Math.min(Math.max(days, 1), 365);
  try {
    const [totR, acctsR, toolsR] = await Promise.all([
      getSql()`SELECT count(*)::int n, coalesce(round(avg(latency_ms)),0)::int avg_ms
        FROM alfred.messages WHERE ts > now() - (${d}::int * interval '1 day')`,
      getSql()`SELECT e->>'name' name, count(*)::int n
        FROM alfred.messages, jsonb_array_elements(entities) e
        WHERE ts > now() - (${d}::int * interval '1 day') AND jsonb_typeof(entities)='array'
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`,
      getSql()`SELECT t tool, count(*)::int n
        FROM alfred.messages, jsonb_array_elements_text(tools) t
        WHERE ts > now() - (${d}::int * interval '1 day') AND jsonb_typeof(tools)='array'
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`,
    ]);
    const tot = totR as Array<{ n: number; avg_ms: number }>;
    const accts = acctsR as Array<{ name: string; n: number }>;
    const tools = toolsR as Array<{ tool: string; n: number }>;
    return {
      window_days: d,
      total_interactions: tot[0]?.n ?? 0,
      avg_latency_ms: tot[0]?.avg_ms ?? 0,
      top_accounts: accts.map((r) => ({ account: r.name, times: r.n })),
      top_tools: tools.map((r) => ({ tool: r.tool, times: r.n })),
    };
  } catch (e) {
    return { available: false as const, reason: `usage stats failed: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
}

// --- Pinned focus (the account Alfred treats as the current subject) ---

export async function setFocus(entityId: string, entityName: string): Promise<{ ok: boolean }> {
  if (!neonUrl()) return { ok: false };
  try {
    await getSql()`INSERT INTO alfred.focus (key, entity_id, entity_name, updated_at)
      VALUES ('current', ${entityId}, ${entityName}, now())
      ON CONFLICT (key) DO UPDATE SET entity_id=${entityId}, entity_name=${entityName}, updated_at=now()`;
    return { ok: true };
  } catch { return { ok: false }; }
}

export async function clearFocus(): Promise<{ ok: boolean }> {
  if (!neonUrl()) return { ok: false };
  try { await getSql()`DELETE FROM alfred.focus WHERE key='current'`; return { ok: true }; }
  catch { return { ok: false }; }
}

export async function getFocus(): Promise<{ entityId: string; entityName: string } | null> {
  if (!neonUrl()) return null;
  try {
    const r = (await getSql()`SELECT entity_id, entity_name FROM alfred.focus WHERE key='current'`) as Array<{ entity_id: string; entity_name: string }>;
    return r[0]?.entity_name ? { entityId: r[0].entity_id, entityName: r[0].entity_name } : null;
  } catch { return null; }
}

export type RecallResult =
  | { available: false; reason: string }
  | { count: number; interactions: Array<{ date: string; question: string; reply_excerpt: string }> };

export async function recall(opts: { entity?: string; text?: string; limit?: number }): Promise<RecallResult> {
  if (!neonUrl()) return { available: false, reason: "memory store not configured" };
  const limit = Math.min(opts.limit || 8, 15);
  try {
    let rows: Array<{ d: string; question: string; reply: string }>;
    if (opts.entity) {
      const like = "%" + opts.entity + "%";
      rows = (await getSql()`SELECT to_char(ts,'DD/MM/YY') d, question, left(reply,400) reply
        FROM alfred.messages WHERE entities::text ILIKE ${like} OR question ILIKE ${like}
        ORDER BY ts DESC LIMIT ${limit}`) as typeof rows;
    } else if (opts.text) {
      const like = "%" + opts.text + "%";
      rows = (await getSql()`SELECT to_char(ts,'DD/MM/YY') d, question, left(reply,400) reply
        FROM alfred.messages WHERE question ILIKE ${like} OR reply ILIKE ${like}
        ORDER BY ts DESC LIMIT ${limit}`) as typeof rows;
    } else {
      rows = (await getSql()`SELECT to_char(ts,'DD/MM/YY') d, question, left(reply,400) reply
        FROM alfred.messages ORDER BY ts DESC LIMIT ${limit}`) as typeof rows;
    }
    return { count: rows.length, interactions: rows.map((r) => ({ date: r.d, question: r.question, reply_excerpt: r.reply })) };
  } catch (e) {
    return { available: false, reason: `recall failed: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
}
