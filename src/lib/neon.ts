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
