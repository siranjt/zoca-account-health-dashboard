// ===========================================================================
// Metabase client (SERVER-SIDE ONLY).
//
// This module talks to the Metabase REST API using an API key held in a
// server env var. It must never be imported into a client component — the
// API key must never reach the browser.
//
// Two query styles are supported:
//   • queryCard(cardId)  -> runs a saved Question (recommended: reuse the
//                           exact cards that power the Retool dashboard).
//   • queryNative(sql)   -> runs ad-hoc SQL against METABASE_DATABASE_ID.
//
// WIRING TODO (once the Metabase card IDs / SQL are known):
//   Fill METABASE_CARD_* env vars, then complete `getAccountsFromMetabase()`
//   below to map card rows -> AccountRow[]. The column->tab mapping is
//   documented in README.md and mirrored by the mock data.
// ===========================================================================

import type { AccountRow } from "./types";

export interface MetabaseConfig {
  url: string;
  apiKey: string;
  databaseId?: number;
  cards: Record<string, string | undefined>;
}

export function readMetabaseConfig(): MetabaseConfig | null {
  // Primary name matches the Vercel env var (METABASE_BASE_URL); METABASE_URL
  // kept as a fallback so either name works.
  const url = process.env.METABASE_BASE_URL ?? process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;
  if (!url || !apiKey) return null;
  return {
    url: url.replace(/\/+$/, ""),
    apiKey,
    databaseId: process.env.METABASE_DATABASE_ID
      ? Number(process.env.METABASE_DATABASE_ID)
      : undefined,
    cards: {
      accounts: process.env.METABASE_CARD_ACCOUNTS,
      leads: process.env.METABASE_CARD_LEADS,
      reviews: process.env.METABASE_CARD_REVIEWS,
      photos: process.env.METABASE_CARD_PHOTOS,
      rankings: process.env.METABASE_CARD_RANKINGS,
      impressions: process.env.METABASE_CARD_IMPRESSIONS,
      gbpMetrics: process.env.METABASE_CARD_GBP_METRICS,
      health: process.env.METABASE_CARD_HEALTH,
      products: process.env.METABASE_CARD_PRODUCTS,
    },
  };
}

interface MetabaseRow {
  [key: string]: unknown;
}

/** Convert Metabase's { data: { cols, rows } } into an array of objects. */
function rowsToObjects(json: any): MetabaseRow[] {
  const cols: Array<{ name: string }> = json?.data?.cols ?? [];
  const rows: unknown[][] = json?.data?.rows ?? [];
  return rows.map((row) => {
    const obj: MetabaseRow = {};
    cols.forEach((c, i) => {
      obj[c.name] = row[i];
    });
    return obj;
  });
}

/** Run a saved Metabase Question and return its rows as objects. */
export async function queryCard(
  cfg: MetabaseConfig,
  cardId: string,
  parameters: unknown[] = []
): Promise<MetabaseRow[]> {
  const res = await fetch(`${cfg.url}/api/card/${cardId}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": cfg.apiKey,
    },
    body: JSON.stringify({ parameters }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Metabase card ${cardId} query failed: ${res.status} ${res.statusText}`
    );
  }
  return rowsToObjects(await res.json());
}

/** Run ad-hoc SQL against the configured database. */
export async function queryNative(
  cfg: MetabaseConfig,
  sql: string,
  templateTags: Record<string, unknown> = {}
): Promise<MetabaseRow[]> {
  if (!cfg.databaseId) {
    throw new Error("METABASE_DATABASE_ID is required for native SQL queries");
  }
  const res = await fetch(`${cfg.url}/api/dataset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": cfg.apiKey,
    },
    body: JSON.stringify({
      database: cfg.databaseId,
      type: "native",
      native: { query: sql, "template-tags": templateTags },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Metabase native query failed: ${res.status} ${res.statusText}`
    );
  }
  return rowsToObjects(await res.json());
}

/**
 * Build the full list of non-churned accounts from Metabase.
 *
 * NOT YET IMPLEMENTED — needs the real card IDs / SQL. Until the cards are
 * wired, this throws so the API route cleanly falls back to mock data.
 *
 * Implementation plan (see README "Data mapping"):
 *   1. accounts card  -> base list + identity + lifecycle (filter out churned)
 *   2. health card    -> engagement/value/product per entityId -> buildHealth()
 *   3. leads card     -> leadsReceived (exclude test leads) + the three
 *                        received/opened/contacted timestamp averages
 *   4. reviews/photos/rankings/impressions/gbpMetrics cards -> remaining columns
 *   5. products card  -> activeProducts (paid "agents": discovery, front_desk, …)
 *   Join everything by entityId.
 */
export async function getAccountsFromMetabase(
  _windowDays: number
): Promise<AccountRow[]> {
  const cfg = readMetabaseConfig();
  if (!cfg) throw new Error("Metabase not configured");
  if (!cfg.cards.accounts) {
    throw new Error(
      "Metabase card IDs not set yet — fill METABASE_CARD_* env vars and complete getAccountsFromMetabase()"
    );
  }
  // TODO: implement the joins described above once card IDs are provided.
  throw new Error("getAccountsFromMetabase() not implemented — awaiting card IDs");
}
