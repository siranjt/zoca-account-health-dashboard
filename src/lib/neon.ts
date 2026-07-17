import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Shared Neon (Postgres) accessor. Points at the same Neon instance beacon
// uses — DATABASE_URL on Vercel (falls back to POSTGRES_URL). Holds both the
// Keeper facts (beacon_brain_facts) and the entity→Chargebee-customer map
// (dashboard_snapshots).

let _sql: NeonQueryFunction<false, false> | null = null;

export function neonUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = neonUrl();
    if (!url) throw new Error("DATABASE_URL not set");
    _sql = neon(url);
  }
  return _sql;
}

// entity_id → Chargebee customer_id, from beacon's latest Neon snapshot.
// Shared by the billing (Chargebee) and customer_facts (Keeper) tools — both
// key off the Chargebee customer_id, not the dashboard entity UUID.
const MAP_TTL_MS = 60 * 60 * 1000;
let mapCache: { map: Map<string, string>; at: number } | null = null;
let mapBuilding: Promise<Map<string, string>> | null = null;

async function buildEntityCustomerMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!neonUrl()) return map;
  const rows = (await getSql()`
    SELECT customer_data FROM dashboard_snapshots ORDER BY snapshot_date DESC LIMIT 1
  `) as Array<{ customer_data: unknown }>;
  const raw = rows?.[0]?.customer_data;
  const snap = (typeof raw === "string" ? JSON.parse(raw) : raw) as { customers?: Array<{ entity_id?: string; customer_id?: string }> } | null;
  for (const c of snap?.customers || []) {
    const eid = (c.entity_id || "").trim();
    if (eid && c.customer_id) map.set(eid, c.customer_id);
  }
  return map;
}

export async function getEntityCustomerMap(): Promise<Map<string, string>> {
  if (mapCache && Date.now() - mapCache.at < MAP_TTL_MS) return mapCache.map;
  if (mapBuilding) return mapBuilding;
  mapBuilding = buildEntityCustomerMap()
    .then((m) => { mapCache = { map: m, at: Date.now() }; return m; })
    .finally(() => { mapBuilding = null; });
  return mapBuilding;
}

export async function getEntityCustomerId(entityId: string): Promise<string | null> {
  const m = await getEntityCustomerMap();
  return m.get((entityId || "").trim()) || null;
}
