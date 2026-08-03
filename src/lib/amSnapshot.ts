import "server-only";
import { getSql, neonUrl } from "@/lib/neon";

// Historical AM daily snapshots (one row per AM per day) in the isolated
// `alfred` schema — the storage half of the AM daily report. The Python
// workbook recomputes the same twelve metrics every weekday and keeps nothing;
// this table is what makes "untouched 182 → 110 → 187" a series instead of five
// files sitting in a downloads folder.
//
// Phase 1 stores and reads. The live compute (port of daily_am_report_detailed.py)
// lands in phase 2 — until then the only writer is the backfill script
// (`scripts/backfill-am-daily.mjs`, source='backfill').
//
// Two rules the data itself enforces:
//   • churn_pct_* is NULL — never 100 — when active_accounts = 0. Three AMs who
//     have left still carry churned accounts against an empty book; a naive
//     denominator prints 100% and reads as an accusation.
//   • `(unassigned)` is a real AM row and is never dropped.

export interface AmDailyRow {
  amName: string;
  activeAccounts: number;
  mrr: number;
  missedPaymentAccounts: number;
  missedPaymentAmount: number;
  churned30d: number;
  /** NULL when activeAccounts = 0 — see note above. */
  churnPct30d: number | null;
  churnedMtd: number;
  churnPctMtd: number | null;
  retentionRiskTickets: number;
  schedProvisioned: number;
  schedProductActive: number;
  schedOnboarded: number;
  schedIncomplete: number;
  untouchedHuman30d: number;
  untouchedAll30d: number;
}

export type AmSnapshotSource = "cron" | "backfill";

/** Bump when a metric definition changes so a step in the series can be told
 *  apart from a service collapse. v1 = SMS excluded from untouched-human
 *  (live from 03/08/26). v0 = the pre-03/08 definition, SMS included. */
export const AM_METRIC_VERSION = 1;

async function ensureTables() {
  const sql = getSql();
  await sql.query(`CREATE SCHEMA IF NOT EXISTS alfred`);
  await sql.query(`CREATE TABLE IF NOT EXISTS alfred.am_daily (
    snapshot_date              date          NOT NULL,
    am_name                    text          NOT NULL,
    active_accounts            integer       NOT NULL DEFAULT 0,
    mrr                        numeric(12,2) NOT NULL DEFAULT 0,
    missed_payment_accounts    integer       NOT NULL DEFAULT 0,
    missed_payment_amount      numeric(12,2) NOT NULL DEFAULT 0,
    churned_30d                integer       NOT NULL DEFAULT 0,
    churn_pct_30d              numeric(5,2),
    churned_mtd                integer       NOT NULL DEFAULT 0,
    churn_pct_mtd              numeric(5,2),
    retention_risk_tickets     integer       NOT NULL DEFAULT 0,
    sched_provisioned          integer       NOT NULL DEFAULT 0,
    sched_product_active       integer       NOT NULL DEFAULT 0,
    sched_onboarded            integer       NOT NULL DEFAULT 0,
    sched_incomplete           integer       NOT NULL DEFAULT 0,
    untouched_human_30d        integer       NOT NULL DEFAULT 0,
    untouched_all_30d          integer       NOT NULL DEFAULT 0,
    source                     text          NOT NULL DEFAULT 'cron',
    metric_version             integer       NOT NULL DEFAULT 1,
    created_at                 timestamptz   DEFAULT now(),
    PRIMARY KEY (snapshot_date, am_name))`);
  await sql.query(`CREATE TABLE IF NOT EXISTS alfred.am_daily_run (
    snapshot_date  date PRIMARY KEY,
    started_at     timestamptz NOT NULL,
    finished_at    timestamptz,
    ok             boolean     NOT NULL DEFAULT false,
    duration_ms    integer,
    am_rows        integer,
    error          text)`);
}

/** NULL, never 100, when the AM holds no live book. */
function pct(part: number, activeAccounts: number): number | null {
  if (!activeAccounts) return null;
  return Math.round((part / activeAccounts) * 100 * 100) / 100;
}

/** Derive both churn percentages from the counts, honouring the zero-book rule.
 *  Callers that already have percentages (the workbook backfill) pass them
 *  through; callers that only have counts use this. */
// churnPercentages() was removed on 04/08/26. It divided by `activeAccounts`
// alone, while the report — and the five backfilled days already in the table —
// use `churned / (active + churned)`. Two churn definitions one file apart, with
// the wrong one exported and uncalled, is a trap: picking it up would silently
// change the series and look like a real movement. The live definition lives in
// amReport.ts (`churnPct`), next to the data it describes.

/**
 * Upsert one row per AM for `date`. Re-running the same day updates in place —
 * the primary key is (snapshot_date, am_name), so a re-run never duplicates.
 */
export async function takeAmSnapshot(input: {
  date: string;
  rows: AmDailyRow[];
  source?: AmSnapshotSource;
  metricVersion?: number;
}): Promise<{ date: string; rows: number }> {
  if (!neonUrl()) throw new Error("DATABASE_URL not set");
  await ensureTables();
  const sql = getSql();
  const source = input.source ?? "cron";
  const version = input.metricVersion ?? AM_METRIC_VERSION;

  for (const r of input.rows) {
    // Belt and braces: a percentage against an empty book is meaningless
    // whatever the caller passed.
    const p30 = r.activeAccounts ? r.churnPct30d : null;
    const pMtd = r.activeAccounts ? r.churnPctMtd : null;
    await sql`INSERT INTO alfred.am_daily
      (snapshot_date, am_name, active_accounts, mrr, missed_payment_accounts, missed_payment_amount,
       churned_30d, churn_pct_30d, churned_mtd, churn_pct_mtd, retention_risk_tickets,
       sched_provisioned, sched_product_active, sched_onboarded, sched_incomplete,
       untouched_human_30d, untouched_all_30d, source, metric_version)
      VALUES (${input.date}, ${r.amName}, ${r.activeAccounts}, ${r.mrr}, ${r.missedPaymentAccounts}, ${r.missedPaymentAmount},
       ${r.churned30d}, ${p30}, ${r.churnedMtd}, ${pMtd}, ${r.retentionRiskTickets},
       ${r.schedProvisioned}, ${r.schedProductActive}, ${r.schedOnboarded}, ${r.schedIncomplete},
       ${r.untouchedHuman30d}, ${r.untouchedAll30d}, ${source}, ${version})
      ON CONFLICT (snapshot_date, am_name) DO UPDATE SET
        active_accounts=EXCLUDED.active_accounts, mrr=EXCLUDED.mrr,
        missed_payment_accounts=EXCLUDED.missed_payment_accounts, missed_payment_amount=EXCLUDED.missed_payment_amount,
        churned_30d=EXCLUDED.churned_30d, churn_pct_30d=EXCLUDED.churn_pct_30d,
        churned_mtd=EXCLUDED.churned_mtd, churn_pct_mtd=EXCLUDED.churn_pct_mtd,
        retention_risk_tickets=EXCLUDED.retention_risk_tickets,
        sched_provisioned=EXCLUDED.sched_provisioned, sched_product_active=EXCLUDED.sched_product_active,
        sched_onboarded=EXCLUDED.sched_onboarded, sched_incomplete=EXCLUDED.sched_incomplete,
        untouched_human_30d=EXCLUDED.untouched_human_30d, untouched_all_30d=EXCLUDED.untouched_all_30d,
        source=EXCLUDED.source, metric_version=EXCLUDED.metric_version, created_at=now()`;
  }
  return { date: input.date, rows: input.rows.length };
}

/** Whole history, oldest first — one row per AM per day. Empty (never throws)
 *  when no database is configured, so callers degrade to an empty state. */
export async function getAmTrend(): Promise<Record<string, unknown>[]> {
  if (!neonUrl()) return [];
  await ensureTables();
  return (await getSql()`
    SELECT snapshot_date::text d, am_name,
      active_accounts, mrr::float mrr,
      missed_payment_accounts, missed_payment_amount::float missed_payment_amount,
      churned_30d, churn_pct_30d::float churn_pct_30d,
      churned_mtd, churn_pct_mtd::float churn_pct_mtd,
      retention_risk_tickets,
      sched_provisioned, sched_product_active, sched_onboarded, sched_incomplete,
      untouched_human_30d, untouched_all_30d, source, metric_version
    FROM alfred.am_daily ORDER BY snapshot_date, am_name`) as Record<string, unknown>[];
}

export interface AmRun {
  snapshot_date: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  duration_ms: number | null;
  am_rows: number | null;
  error: string | null;
}

/** Newest run first. Feeds the freshness banner — a scheduled job in this stack
 *  has now failed silently twice, so "when did this last succeed" is data, not
 *  an assumption. */
export async function getAmRuns(limit = 30): Promise<AmRun[]> {
  if (!neonUrl()) return [];
  await ensureTables();
  return (await getSql()`
    SELECT snapshot_date::text snapshot_date, started_at::text started_at,
      finished_at::text finished_at, ok, duration_ms, am_rows, error
    FROM alfred.am_daily_run ORDER BY snapshot_date DESC LIMIT ${limit}`) as unknown as AmRun[];
}

export async function beginAmRun(date: string): Promise<void> {
  if (!neonUrl()) return;
  await ensureTables();
  await getSql()`INSERT INTO alfred.am_daily_run (snapshot_date, started_at, ok)
    VALUES (${date}, now(), false)
    ON CONFLICT (snapshot_date) DO UPDATE SET
      started_at=now(), finished_at=NULL, ok=false, duration_ms=NULL, am_rows=NULL, error=NULL`;
}

export async function finishAmRun(
  date: string,
  r: { ok: boolean; durationMs: number; amRows: number | null; error?: string | null },
): Promise<void> {
  if (!neonUrl()) return;
  await getSql()`UPDATE alfred.am_daily_run
    SET finished_at=now(), ok=${r.ok}, duration_ms=${r.durationMs}, am_rows=${r.amRows}, error=${r.error ?? null}
    WHERE snapshot_date=${date}`;
}
