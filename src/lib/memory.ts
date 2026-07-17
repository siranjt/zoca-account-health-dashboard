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
};

export async function logInteraction(r: LogRec): Promise<void> {
  if (!neonUrl()) return;
  try {
    await getSql()`
      INSERT INTO alfred.messages
        (question, reply, tools, entities, status, latency_ms, tokens_in, tokens_out, model)
      VALUES
        (${r.question}, ${r.reply}, ${JSON.stringify(r.tools)}::jsonb, ${JSON.stringify(r.entities)}::jsonb,
         ${r.status}, ${r.latency_ms}, ${r.tokens_in}, ${r.tokens_out}, ${r.model})`;
  } catch { /* memory logging must never break a reply */ }
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
