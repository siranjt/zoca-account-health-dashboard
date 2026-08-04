#!/usr/bin/env node
// One-shot backfill of alfred.am_daily from the Python workbooks that ran
// before the app owned this report. Five weekdays: 28/07, 29/07, 30/07, 31/07,
// 03/08 (01/08 and 02/08 were a weekend — the launchd job logged runs and
// produced no file). Rows land with source='backfill' so they are always
// distinguishable from cron rows.
//
//   node scripts/backfill-am-daily.mjs --dry-run
//   node scripts/backfill-am-daily.mjs
//   node scripts/backfill-am-daily.mjs --dir /some/other/folder
//
// Reads DATABASE_URL from the environment or from .env.local at the repo root.
//
// metric_version: 0 for 28/07-31/07, 1 from 03/08. SMS left the untouched-human
// test on 03/08/26, which moved that number 110 -> 187. Without the version flag
// that step reads as a service collapse.
//
// Header matching is deliberately strict: an unrecognised column ABORTS with the
// exact header text printed. Silently defaulting a metric to zero would put a
// wrong number into the only AM history that exists.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx-js-style";
import { neon } from "@neondatabase/serverless";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** date -> workbook file; metric_version follows the definition live that day. */
const DAYS = [
  { date: "2026-07-28", metricVersion: 0 },
  { date: "2026-07-29", metricVersion: 0 },
  { date: "2026-07-30", metricVersion: 0 },
  { date: "2026-07-31", metricVersion: 0 },
  { date: "2026-08-03", metricVersion: 1 },
];

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const dirFlag = args.indexOf("--dir");
const DIR = dirFlag >= 0 ? args[dirFlag + 1] : join(homedir(), "Downloads");

// ---------------------------------------------------------------- env

function loadEnvLocal() {
  const p = join(REPO_ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

// ---------------------------------------------------------------- parsing

/** lowercase alphanumerics, with % and $ preserved as words so "churn %" and
 *  "missed $" stay distinguishable from their sibling columns. */
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/%/g, " pct ")
    .replace(/\$/g, " usd ")
    .replace(/[^a-z0-9]+/g, "");
}

// Ordered: the first predicate that matches an unclaimed field wins, so the
// narrower test (product active, churn pct) must come before the broader one.
const FIELDS = [
  ["amName", (h) => h === "am" || h === "amname" || h.includes("accountmanager") || h.includes("manager") || h === "owner"],
  ["churnPct30d", (h) => h.includes("churn") && h.includes("pct") && (h.includes("30") || h.includes("l30"))],
  ["churnPctMtd", (h) => h.includes("churn") && h.includes("pct") && h.includes("mtd")],
  ["churned30d", (h) => h.includes("churn") && (h.includes("30") || h.includes("l30"))],
  ["churnedMtd", (h) => h.includes("churn") && h.includes("mtd")],
  ["missedPaymentAmount", (h) => h.includes("missed") && (h.includes("amount") || h.includes("usd") || h.includes("value"))],
  ["missedPaymentAccounts", (h) => h.includes("missed")],
  ["mrr", (h) => h.includes("mrr")],
  ["retentionRiskTickets", (h) => h.includes("retention")],
  ["schedProvisioned", (h) => h.includes("provision")],
  ["schedProductActive", (h) => h.includes("product") && h.includes("active")],
  ["schedOnboarded", (h) => h.includes("onboard")],
  ["schedIncomplete", (h) => h.includes("incomplete")],
  ["untouchedHuman30d", (h) => h.includes("untouched") && h.includes("human")],
  ["untouchedAll30d", (h) => h.includes("untouched")],
  // Legacy header, 28/07 only. "Scheduling active" then meant website book-now
  // clicks (mixpanel_website.daily_page_views.unique_book_now_clicks), which fired
  // for 752 of 819 accounts. It is NOT the same measure as schedProductActive
  // (product provisioning, ~109). Mapping it across would invent a cliff from 752
  // to 109 that never happened, so it is claimed here purely to keep the strict
  // header check happy, and its value is never read.
  //
  // It claims the column but NOT the field: schedProductActive stays unclaimed
  // for that workbook, which is what makes it write NULL below. (This comment
  // used to assert the NULL came from the key being absent from the INSERT's
  // $1..$18 params. It did not: every sched_* field was coerced through
  // `?? 0` and the columns were NOT NULL DEFAULT 0, so 28/07 landed four
  // measured zeros — the fake 0 -> 106 step visible on the page.)
  ["_dropLegacySchedulingActive", (h) => h === "schedulingactive"],
  ["activeAccounts", (h) => h.includes("active") || h === "accounts" || h.includes("livebook")],
];

const COUNT_FIELDS = [
  "activeAccounts", "missedPaymentAccounts", "churned30d", "churnedMtd", "retentionRiskTickets",
  "schedProvisioned", "schedProductActive", "schedOnboarded", "schedIncomplete",
  "untouchedHuman30d", "untouchedAll30d",
];

// The only columns alfred.am_daily stores nullable — i.e. the only metrics that
// can say "this workbook did not measure me". Everything else is NOT NULL, so a
// workbook missing that column has no honest representation and must abort
// rather than record a zero it never measured.
const NULLABLE_FIELDS = new Set([
  "schedProvisioned", "schedProductActive", "schedOnboarded", "schedIncomplete",
]);

function num(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,%\s]/g, "").replace(/[()]/g, "");
  if (!s || /^(n\/?a|-|none)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A percentage cell arrives either as 8.6 or as 0.086 depending on the cell
 * format, and the two readings differ by 100x. Guessing on magnitude alone is
 * wrong for a genuine sub-1% rate (one churn against a 150-account book is
 * 0.67%), so reconcile against the counts in the same row and take whichever
 * reading sits closer. Falls back to the magnitude heuristic only when there is
 * nothing to reconcile against, and derives the rate outright when the column
 * is missing or blank.
 *
 * Returns null whenever the AM holds no live book — never 100.
 */
function pctFrom(raw, churned, active) {
  if (!active) return null;
  const expected = (churned / active) * 100;
  const n = num(raw);
  if (n == null) return round2(expected);
  if (churned > 0) {
    return Math.abs(n - expected) <= Math.abs(n * 100 - expected) ? round2(n) : round2(n * 100);
  }
  return n > 0 && n <= 1 ? round2(n * 100) : round2(n);
}

function mapHeaders(header) {
  const byIndex = {};
  const claimed = new Set();
  const unmatched = [];
  header.forEach((raw, i) => {
    const h = norm(raw);
    if (!h) return;
    const hit = FIELDS.find(([f, pred]) => !claimed.has(f) && pred(h));
    if (!hit) { unmatched.push(String(raw).trim()); return; }
    claimed.add(hit[0]);
    byIndex[i] = hit[0];
  });
  return { byIndex, claimed, unmatched };
}

const SKIP_AM = /^(total|totals|grand\s*total|all|all\s*ams|company|overall|sum)$/i;

function parseWorkbook(file) {
  const wb = XLSX.readFile(file);
  const name = wb.SheetNames.find((n) => n.trim().toLowerCase() === "summary") ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  // Row 1 is a note, row 2 is blank, row 3 is the header -> start at index 2.
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 2, blankrows: false, raw: true, defval: null });
  if (!grid.length) throw new Error(`${file}: sheet "${name}" has no rows at/after row 3`);

  const [header, ...body] = grid;
  const { byIndex, claimed, unmatched } = mapHeaders(header);
  if (unmatched.length) {
    throw new Error(
      `${file}: unrecognised Summary columns: ${unmatched.map((u) => `"${u}"`).join(", ")}\n` +
      `  Add a matcher in FIELDS rather than letting a metric default to zero.`,
    );
  }
  const required = ["amName", "activeAccounts", "untouchedHuman30d", "untouchedAll30d"];
  const missing = required.filter((f) => !claimed.has(f));
  if (missing.length) throw new Error(`${file}: Summary sheet is missing column(s): ${missing.join(", ")}`);

  // A field the workbook never measured is written as NULL below. That only
  // works for the columns declared nullable; for the rest, NULL would trip the
  // NOT NULL constraint with an opaque driver error at write time. Say it here
  // instead, while the file that caused it is still in hand.
  const unrepresentable = [...COUNT_FIELDS, "mrr", "missedPaymentAmount"]
    .filter((f) => !claimed.has(f) && !NULLABLE_FIELDS.has(f));
  if (unrepresentable.length) {
    throw new Error(
      `${file}: Summary sheet has no column for: ${unrepresentable.join(", ")}\n` +
      `  These columns are NOT NULL, so "not measured" cannot be recorded. Add a\n` +
      `  matcher in FIELDS, or make the column nullable — do not default to zero.`,
    );
  }

  const rows = [];
  for (const r of body) {
    const rec = {};
    for (const [i, field] of Object.entries(byIndex)) rec[field] = r[Number(i)];
    const rawAm = String(rec.amName ?? "").trim();
    // A totals row is not an AM. Say so out loud — a silent drop reads as
    // "covered everything" when it did not.
    if (SKIP_AM.test(rawAm)) { console.log(`  skipped non-AM row "${rawAm}"`); continue; }
    if (!rawAm && !COUNT_FIELDS.some((f) => num(rec[f]))) continue; // padding row
    // A blank owner is the `(unassigned)` book — real data, never dropped.
    const amName = rawAm || "(unassigned)";

    const out = { amName };
    // Claimed column, blank cell => a measured 0 (the AM genuinely had none).
    // Column absent from the workbook entirely => NULL, "not measured". The two
    // are different facts and the table now distinguishes them; collapsing both
    // to 0 is what put four fake zeros on every 28/07 row.
    for (const f of COUNT_FIELDS) out[f] = claimed.has(f) ? Math.round(num(rec[f]) ?? 0) : null;
    out.mrr = Math.round((num(rec.mrr) ?? 0) * 100) / 100;
    out.missedPaymentAmount = Math.round((num(rec.missedPaymentAmount) ?? 0) * 100) / 100;
    // NULL, never 100, when the AM holds no live book.
    out.churnPct30d = pctFrom(rec.churnPct30d, out.churned30d, out.activeAccounts);
    out.churnPctMtd = pctFrom(rec.churnPctMtd, out.churnedMtd, out.activeAccounts);
    rows.push(out);
  }
  if (!rows.length) throw new Error(`${file}: parsed zero AM rows from sheet "${name}"`);
  return rows;
}

// ---------------------------------------------------------------- write

const DDL_SCHEMA = `CREATE SCHEMA IF NOT EXISTS alfred`;
const DDL_TABLE = `CREATE TABLE IF NOT EXISTS alfred.am_daily (
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
  sched_provisioned          integer,
  sched_product_active       integer,
  sched_onboarded            integer,
  sched_incomplete           integer,
  untouched_human_30d        integer       NOT NULL DEFAULT 0,
  untouched_all_30d          integer       NOT NULL DEFAULT 0,
  source                     text          NOT NULL DEFAULT 'cron',
  metric_version             integer       NOT NULL DEFAULT 1,
  created_at                 timestamptz   DEFAULT now(),
  PRIMARY KEY (snapshot_date, am_name))`;

// Mirrors the migration in src/lib/amSnapshot.ts: the table already exists in
// production with these four columns NOT NULL DEFAULT 0, so CREATE TABLE IF NOT
// EXISTS above will not touch them. Both statements are idempotent.
const DDL_SCHED_NULLABLE = [
  "sched_provisioned", "sched_product_active", "sched_onboarded", "sched_incomplete",
].flatMap((c) => [
  `ALTER TABLE alfred.am_daily ALTER COLUMN ${c} DROP NOT NULL`,
  `ALTER TABLE alfred.am_daily ALTER COLUMN ${c} DROP DEFAULT`,
]);

const DELETE_DAY = `DELETE FROM alfred.am_daily WHERE snapshot_date = $1`;

const INSERT = `INSERT INTO alfred.am_daily
  (snapshot_date, am_name, active_accounts, mrr, missed_payment_accounts, missed_payment_amount,
   churned_30d, churn_pct_30d, churned_mtd, churn_pct_mtd, retention_risk_tickets,
   sched_provisioned, sched_product_active, sched_onboarded, sched_incomplete,
   untouched_human_30d, untouched_all_30d, source, metric_version)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'backfill',$18)
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

async function main() {
  loadEnvLocal();
  const parsed = [];
  for (const day of DAYS) {
    const file = join(DIR, `AM_Daily_Report_${day.date}.xlsx`);
    if (!existsSync(file)) throw new Error(`missing workbook: ${file}`);
    const rows = parseWorkbook(file);
    parsed.push({ ...day, file, rows });
    const unassigned = rows.find((r) => r.amName === "(unassigned)");
    console.log(
      `${day.date}  v${day.metricVersion}  ${rows.length} AM rows  ` +
      `accounts=${rows.reduce((s, r) => s + r.activeAccounts, 0)}  ` +
      `untouched(human)=${rows.reduce((s, r) => s + r.untouchedHuman30d, 0)}  ` +
      `${unassigned ? "(unassigned) present" : "NO (unassigned) row"}`,
    );
  }

  if (DRY) {
    console.log("\n--dry-run: nothing written. Sample row:");
    console.log(JSON.stringify(parsed[parsed.length - 1].rows[0], null, 2));
    return;
  }

  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL not set (env or .env.local)");
  const sql = neon(url);
  await sql.query(DDL_SCHEMA);
  await sql.query(DDL_TABLE);
  for (const stmt of DDL_SCHED_NULLABLE) await sql.query(stmt);

  // One transaction per day, delete-then-insert: the day ends up exactly as the
  // workbook describes it, or entirely untouched. Row-at-a-time over the HTTP
  // driver autocommits, so a throw partway through used to leave a day that was
  // neither the old snapshot nor the new one, with nothing recording which.
  let written = 0;
  for (const day of parsed) {
    await sql.transaction([
      sql.query(DELETE_DAY, [day.date]),
      ...day.rows.map((r) => sql.query(INSERT, [
        day.date, r.amName, r.activeAccounts, r.mrr, r.missedPaymentAccounts, r.missedPaymentAmount,
        r.churned30d, r.churnPct30d, r.churnedMtd, r.churnPctMtd, r.retentionRiskTickets,
        r.schedProvisioned, r.schedProductActive, r.schedOnboarded, r.schedIncomplete,
        r.untouchedHuman30d, r.untouchedAll30d, day.metricVersion,
      ])),
    ]);
    written += day.rows.length;
  }
  console.log(`\nwrote ${written} rows across ${parsed.length} days (source='backfill')`);
}

main().catch((e) => {
  console.error(`\nbackfill failed: ${e.message}`);
  process.exit(1);
});
