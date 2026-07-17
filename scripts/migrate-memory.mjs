#!/usr/bin/env node
// One-time (idempotent) migration: Alfred's durable memory lives in an
// ISOLATED `alfred` schema in the same Neon instance — it never touches
// beacon's tables or the production Keeper. Run with DATABASE_URL set.
//   node scripts/migrate-memory.mjs
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

const stmts = [
  `CREATE SCHEMA IF NOT EXISTS alfred`,
  `CREATE TABLE IF NOT EXISTS alfred.messages (
     id          bigserial PRIMARY KEY,
     ts          timestamptz NOT NULL DEFAULT now(),
     question    text NOT NULL,
     reply       text,
     tools       jsonb,
     entities    jsonb,
     status      text,
     latency_ms  integer,
     tokens_in   integer,
     tokens_out  integer,
     model       text
   )`,
  `CREATE INDEX IF NOT EXISTS idx_alfred_messages_ts ON alfred.messages (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_alfred_messages_entities ON alfred.messages USING gin (entities)`,
  // Alfred's own "Bat Cave Memory" — facts the user tells him to remember.
  // Distinct from beacon_brain_facts (the production Keeper), which he never writes.
  `CREATE TABLE IF NOT EXISTS alfred.facts (
     id              bigserial PRIMARY KEY,
     ts              timestamptz NOT NULL DEFAULT now(),
     entity_id       text,
     entity_name     text,
     fact            text NOT NULL,
     source          text NOT NULL DEFAULT 'user',
     soft_deleted_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS idx_alfred_facts_entity ON alfred.facts (entity_id) WHERE soft_deleted_at IS NULL`,
];

for (const s of stmts) { await sql.query(s); console.log("✓", s.split("\n")[0].trim().slice(0, 70)); }
const chk = await sql.query(`SELECT count(*)::int n FROM alfred.messages`);
console.log(`\nalfred.messages ready — ${chk[0].n} rows.`);
