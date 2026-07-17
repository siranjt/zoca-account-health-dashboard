import "server-only";
import { getSql, neonUrl, getEntityCustomerId } from "@/lib/neon";

// Keeper facts client for Alfred (Batch 2). Reads the curated customer facts
// in Neon (beacon_brain_facts) — the "Bat Cave Memory". Facts are keyed by
// the Chargebee customer_id (NOT the dashboard entity UUID), so we resolve
// entity_id → customer_id via the shared snapshot map first. Read-only;
// Alfred never writes to the production Keeper.

export type KeeperFact = { topic: string; field: string; value: string; confidence: string | null };

export type KeeperResult =
  | { available: false; reason: string }
  | { count: number; facts: KeeperFact[] };

export async function getFactsByEntityId(entityId: string, limit = 60): Promise<KeeperResult> {
  const eid = (entityId || "").trim();
  if (!eid) return { available: false, reason: "no entity_id" };
  if (!neonUrl())
    return { available: false, reason: "Keeper (Neon) is not configured (DATABASE_URL missing)." };
  try {
    const customerId = await getEntityCustomerId(eid);
    if (!customerId) return { count: 0, facts: [] };
    const rows = (await getSql()`
      SELECT topic_subcategory, field_name, value, confidence_state
      FROM beacon_brain_facts
      WHERE customer_id = ${customerId}
        AND soft_deleted_at IS NULL
      ORDER BY topic_subcategory, field_name
      LIMIT ${Math.min(limit, 120)}
    `) as Array<{ topic_subcategory: string; field_name: string; value: string; confidence_state: string | null }>;
    return {
      count: rows.length,
      facts: rows.map((r) => ({ topic: r.topic_subcategory, field: r.field_name, value: r.value, confidence: r.confidence_state })),
    };
  } catch (e) {
    return { available: false, reason: `Keeper query failed: ${String((e as Error)?.message || e).slice(0, 160)}` };
  }
}
