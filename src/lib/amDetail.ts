import "server-only";
import { getSql, neonUrl } from "@/lib/neon";

// Account-level drill-down sheets for the AM daily report — the "which accounts"
// behind each Summary number. The Summary aggregates live in alfred.am_daily and
// are recomputed by the app; these detail rows can only be answered account by
// account, so they are computed ONCE, live, by the laptop workbook
// (~/scripts/daily_am_report_detailed.py) and POSTed here after the run.
//
// WHY STORE THE WORKBOOK'S OWN SHEET MODEL rather than normalise per metric:
//   • the workbook already assembles each sheet as (title, headers, rows,
//     total_row, notes) and styles them identically — storing that exact unit
//     means the app's xlsx export and the /am-report drill-down both render the
//     same rows the workbook does, with zero re-implementation of the queries;
//   • a new metric adds a sheet, not a migration. The shape is generic on
//     purpose.
//
// This is the read/write half of Phase B. The single writer is the ingest
// endpoint (POST /api/cron/am-report/detail), fed by the workbook; the readers
// are the xlsx export and the drill-down view. It never computes anything.

/** A cell as the workbook emits it: text, a number, or "" / null for blank. */
export type DetailCell = string | number | null;

export interface DetailSheet {
  title: string;
  headers: string[];
  rows: DetailCell[][];
  totalRow: DetailCell[] | null;
  notes: string | null;
  widths: number[] | null;
  /** Order the workbook produced the sheets in — preserved so the export lays
   *  them out in the same sequence as the reference file. */
  seq: number;
}

async function ensureDetailTable(): Promise<void> {
  const sql = getSql();
  await sql.query(`CREATE SCHEMA IF NOT EXISTS alfred`);
  await sql.query(`CREATE TABLE IF NOT EXISTS alfred.am_daily_detail (
    snapshot_date  date        NOT NULL,
    title          text        NOT NULL,
    seq            integer     NOT NULL,
    headers        jsonb       NOT NULL,
    rows           jsonb       NOT NULL,
    total_row      jsonb,
    notes          text,
    widths         jsonb,
    created_at     timestamptz DEFAULT now(),
    PRIMARY KEY (snapshot_date, title))`);
}

/**
 * Replace the whole of `date`'s detail with `sheets`, atomically — the same
 * DELETE-then-INSERT shape takeAmSnapshot() uses, and for the same reason: a
 * throw mid-write over the autocommitting Neon HTTP driver must not leave half a
 * day on disk. Re-running a day is idempotent.
 *
 * An empty `sheets` is refused rather than silently wiping a good day.
 */
export async function writeAmDetail(input: {
  date: string;
  sheets: DetailSheet[];
}): Promise<{ date: string; sheets: number }> {
  if (!neonUrl()) throw new Error("DATABASE_URL not set");
  if (!input.sheets.length) {
    throw new Error(`writeAmDetail: refusing to replace ${input.date} with zero sheets`);
  }
  await ensureDetailTable();
  const sql = getSql();
  const statements = [
    sql`DELETE FROM alfred.am_daily_detail WHERE snapshot_date = ${input.date}`,
    ...input.sheets.map(
      (s) => sql`INSERT INTO alfred.am_daily_detail
        (snapshot_date, title, seq, headers, rows, total_row, notes, widths)
        VALUES (${input.date}, ${s.title}, ${s.seq},
          ${JSON.stringify(s.headers)}, ${JSON.stringify(s.rows)},
          ${s.totalRow ? JSON.stringify(s.totalRow) : null},
          ${s.notes}, ${s.widths ? JSON.stringify(s.widths) : null})
        ON CONFLICT (snapshot_date, title) DO UPDATE SET
          seq=EXCLUDED.seq, headers=EXCLUDED.headers, rows=EXCLUDED.rows,
          total_row=EXCLUDED.total_row, notes=EXCLUDED.notes, widths=EXCLUDED.widths,
          created_at=now()`,
    ),
  ];
  await sql.transaction(statements);
  return { date: input.date, sheets: input.sheets.length };
}

/** Newest date holding detail, or null. Empty (never throws) when no DB. */
export async function latestDetailDate(): Promise<string | null> {
  if (!neonUrl()) return null;
  await ensureDetailTable();
  const r = (await getSql()`
    SELECT snapshot_date::text d FROM alfred.am_daily_detail
    ORDER BY snapshot_date DESC LIMIT 1`) as { d: string }[];
  return r[0]?.d ?? null;
}

/** Detail sheets for `date` (newest stored day if omitted), in workbook order.
 *  Empty (never throws) when no DB or no detail for the day, so callers degrade
 *  to a Summary-only export. jsonb columns come back already parsed. */
export async function getAmDetail(
  date?: string,
): Promise<{ date: string | null; sheets: DetailSheet[] }> {
  if (!neonUrl()) return { date: null, sheets: [] };
  await ensureDetailTable();
  const day = date ?? (await latestDetailDate());
  if (!day) return { date: null, sheets: [] };
  const rows = (await getSql()`
    SELECT title, seq, headers, rows, total_row, notes, widths
    FROM alfred.am_daily_detail
    WHERE snapshot_date = ${day}
    ORDER BY seq, title`) as {
    title: string;
    seq: number;
    headers: string[];
    rows: DetailCell[][];
    total_row: DetailCell[] | null;
    notes: string | null;
    widths: number[] | null;
  }[];
  return {
    date: day,
    sheets: rows.map((r) => ({
      title: r.title,
      headers: r.headers,
      rows: r.rows,
      totalRow: r.total_row,
      notes: r.notes,
      widths: r.widths,
      seq: r.seq,
    })),
  };
}
