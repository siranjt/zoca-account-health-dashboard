// ===========================================================================
// Data provider — picks the source (mock vs metabase), resolves the metrics
// window (preset OR custom from/to date range), always excludes churned.
// ===========================================================================

import { getAccountsFromMetabase, getAccountDetailFromMetabase, getCcDailyFromMetabase } from "./metabase";
import { getMockAccounts, getMockAccountDetail } from "./mock";
import { getPaymentDetail } from "./chargebee";
import { getSql, neonUrl } from "./neon";
import type { AccountDetail, AccountsPayload, AccountRow } from "./types";

export const ALLOWED_WINDOWS = [7, 30, 90, 180];
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function useMetabase(): boolean {
  return (process.env.DATA_SOURCE ?? "mock").toLowerCase() === "metabase";
}

export function getWindowDays(): number {
  const n = Number(process.env.METRICS_WINDOW_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export interface RangeInput {
  window?: number;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  all?: boolean; // "Default" — no timeframe (all data)
}

interface ResolvedRange {
  from: string;
  to: string;
  days: number;
  custom: boolean;
  allTime: boolean;
  windowDays: number;
}

// "All data" floor — before Zoca existed (earliest account data is 2022), so
// this captures every account's full history without spawning hundreds of empty
// monthly chart buckets that a true 1970 floor would.
const ALL_TIME_FROM = "2020-01-01T00:00:00.000Z";

function resolveRange(input?: RangeInput): ResolvedRange {
  const now = new Date();
  // "Default" — all data, no timeframe.
  if (input?.all) {
    const fromDate = new Date(ALL_TIME_FROM);
    const days = Math.max(1, Math.round((now.getTime() - fromDate.getTime()) / DAY));
    return { from: fromDate.toISOString(), to: now.toISOString(), days, custom: false, allTime: true, windowDays: days };
  }
  // Custom from/to range wins when both are valid dates.
  if (input?.from && input?.to && DATE_RE.test(input.from) && DATE_RE.test(input.to) && input.from <= input.to) {
    const fromDate = new Date(`${input.from}T00:00:00.000Z`);
    const toExcl = new Date(`${input.to}T00:00:00.000Z`);
    toExcl.setUTCDate(toExcl.getUTCDate() + 1); // inclusive end date
    const days = Math.max(1, Math.round((toExcl.getTime() - fromDate.getTime()) / DAY));
    return { from: fromDate.toISOString(), to: toExcl.toISOString(), days, custom: true, allTime: false, windowDays: days };
  }
  // Preset "last N days".
  const w = input?.window && ALLOWED_WINDOWS.includes(input.window) ? input.window : getWindowDays();
  return {
    from: new Date(now.getTime() - w * DAY).toISOString(),
    to: now.toISOString(),
    days: w,
    custom: false,
    allTime: false,
    windowDays: w,
  };
}

// The book (all 831 accounts + health/metrics) takes ~6s to build from Metabase
// and every /api/ask question and dashboard load needs it. Health data moves
// slowly, so cache the payload per-window for a short TTL — turning that ~6s
// into ~0 for the common case. Only successful fetches are cached (a Metabase
// failure falls back to mock and is NOT cached, so it retries next call).
const BOOK_TTL_MS = 120_000; // 2 min
const bookCache = new Map<string, { at: number; payload: AccountsPayload }>();
const bookInflight = new Map<string, Promise<AccountsPayload>>();

function bookKey(r: ResolvedRange): string {
  return r.custom ? `c:${r.from}:${r.to}` : `w:${r.windowDays}`;
}

// ---- L2 book cache (Neon) --------------------------------------------------
// The in-memory bookCache above is L1 — fast, but it dies with each Vercel
// serverless instance, so cold instances re-fetch the ~6s book. This L2 in Neon
// survives instances: a cold instance reads the last full book from Postgres
// (~50-100ms) instead of hitting Metabase. Full book only (viewer-independent);
// role-scoping still happens after the read, in the page components. Fail-safe:
// any Neon error falls through to the live Metabase fetch (never worse than today).
let bookCacheTableReady: Promise<void> | null = null;
function ensureBookCacheTable(): Promise<void> {
  if (!bookCacheTableReady) {
    bookCacheTableReady = (async () => {
      const sql = getSql();
      await sql.query(`CREATE SCHEMA IF NOT EXISTS alfred`);
      await sql.query(`CREATE TABLE IF NOT EXISTS alfred.book_cache (
        cache_key text PRIMARY KEY,
        payload jsonb NOT NULL,
        at timestamptz DEFAULT now())`);
    })().catch((e) => { bookCacheTableReady = null; throw e; });
  }
  return bookCacheTableReady;
}

async function readBookL2(key: string): Promise<AccountsPayload | null> {
  if (!neonUrl()) return null;
  try {
    await ensureBookCacheTable();
    const rows = (await getSql()`
      SELECT payload, extract(epoch from (now() - at)) * 1000 AS age_ms
      FROM alfred.book_cache WHERE cache_key = ${key}`) as Array<{ payload: AccountsPayload | string; age_ms: number }>;
    const row = rows[0];
    if (!row || Number(row.age_ms) >= BOOK_TTL_MS) return null;
    return typeof row.payload === "string" ? (JSON.parse(row.payload) as AccountsPayload) : row.payload;
  } catch (e) {
    console.error("[data] book L2 read failed (falling through to fetch):", e);
    return null;
  }
}

async function writeBookL2(key: string, payload: AccountsPayload): Promise<void> {
  if (!neonUrl()) return;
  try {
    await ensureBookCacheTable();
    await getSql()`
      INSERT INTO alfred.book_cache (cache_key, payload, at)
      VALUES (${key}, ${JSON.stringify(payload)}::jsonb, now())
      ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, at = now()`;
  } catch (e) {
    console.error("[data] book L2 write failed (non-fatal):", e);
  }
}

export async function getAccountsPayload(input?: RangeInput): Promise<AccountsPayload> {
  const r = resolveRange(input);
  const key = bookKey(r);

  const hit = bookCache.get(key);
  if (hit && Date.now() - hit.at < BOOK_TTL_MS) return hit.payload;
  // Coalesce concurrent misses so N simultaneous questions trigger one fetch.
  const inflight = bookInflight.get(key);
  if (inflight) return inflight;

  const run = (async (): Promise<AccountsPayload> => {
    // L2: a warm Neon copy from another instance skips the ~6s Metabase fetch.
    if (useMetabase()) {
      const l2 = await readBookL2(key);
      if (l2) { bookCache.set(key, { at: Date.now(), payload: l2 }); return l2; }
    }
    let source: "mock" | "metabase" = "mock";
    let accounts: AccountRow[];
    let cacheable = true;
    if (useMetabase()) {
      try {
        accounts = await getAccountsFromMetabase({ from: r.from, to: r.to, days: r.days });
        source = "metabase";
      } catch (err) {
        console.error("[data] Metabase fetch failed, using mock:", err);
        accounts = getMockAccounts();
        cacheable = false; // don't pin the fallback — retry next call
      }
    } else {
      accounts = getMockAccounts();
    }
    const payload: AccountsPayload = {
      generatedAt: new Date().toISOString(),
      source, windowDays: r.windowDays, from: r.from, to: r.to, custom: r.custom, allTime: r.allTime, accounts,
    };
    if (cacheable) {
      bookCache.set(key, { at: Date.now(), payload });
      // Persist to L2 (awaited: Vercel kills post-response background work). Only
      // real Metabase data — never the mock fallback (cacheable already guards that).
      if (source === "metabase") await writeBookL2(key, payload);
    }
    return payload;
  })().finally(() => bookInflight.delete(key));

  bookInflight.set(key, run);
  return run;
}

// Daily Command Center cohort series (active entities + conversations) for the
// landing adoption cluster. Cached ~5 min; returns [] off-Metabase (mock landing
// still gets the cohort aggregates it computes from the book).
let ccDailyCache: { at: number; rows: { d: string; active: number; convos: number }[] } | null = null;
export async function getCcDaily(): Promise<{ d: string; active: number; convos: number }[]> {
  if (ccDailyCache && Date.now() - ccDailyCache.at < 300_000) return ccDailyCache.rows;
  if (!useMetabase()) return [];
  const rows = await getCcDailyFromMetabase(30).catch(() => []);
  if (rows.length) ccDailyCache = { at: Date.now(), rows };
  return rows;
}

// The per-account detail (all the time-series Metabase queries + Chargebee
// payment detail) is the slow leg of "opening an account": it re-runs on every
// dossier open and on navigate-away-and-back. Cache it per (id, window) with a
// short TTL and coalesce concurrent misses, exactly like the book payload — so
// revisiting an account (or bouncing between the overview and a dossier) is ~0.
const DETAIL_TTL_MS = 120_000; // 2 min — health/comms move slowly
const detailCache = new Map<string, { at: number; detail: AccountDetail }>();
const detailInflight = new Map<string, Promise<AccountDetail>>();

export async function getAccountDetail(id: string, windowDaysOverride?: number): Promise<AccountDetail> {
  const windowDays = windowDaysOverride && windowDaysOverride > 0 ? windowDaysOverride : getWindowDays();
  if (!useMetabase()) return getMockAccountDetail(id); // mock includes its own payments

  const key = `${id}:${windowDays}`;
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.detail;
  const inflight = detailInflight.get(key);
  if (inflight) return inflight;

  const run = (async (): Promise<AccountDetail> => {
    // Real source: fetch the Metabase time-series and the Chargebee payment
    // detail in parallel; a failure in either degrades gracefully.
    let cacheable = true;
    const [base, payments] = await Promise.all([
      getAccountDetailFromMetabase(id, windowDays).catch((err) => {
        console.error("[data] account detail fetch failed, using mock:", err);
        cacheable = false; // don't pin a degraded (mock) result — retry next open
        return getMockAccountDetail(id);
      }),
      getPaymentDetail(id).catch(() => null),
    ]);
    base.payments = payments;
    if (cacheable) detailCache.set(key, { at: Date.now(), detail: base });
    return base;
  })().finally(() => detailInflight.delete(key));

  detailInflight.set(key, run);
  return run;
}
