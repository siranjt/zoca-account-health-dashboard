import { NextResponse } from "next/server";
import { neonUrl } from "@/lib/neon";
import { getAmRuns, getAmTrend } from "@/lib/amSnapshot";
import { AM_METRICS, buildAmReportView, companyTotal, parseTrend, type MetricKey } from "@/lib/amMetrics";

// Read-only snapshot export. The consumer is the laptop workbook script
// (~/scripts/daily_am_report_detailed.py), which used to recompute all twelve
// metrics itself and drifted from this app's compute across a seven-minute gap
// on 29/07. It now reads the Summary numbers from here instead.
//
// WHY AN ENDPOINT RATHER THAN NEON DIRECTLY, which was the other option:
//   • the script has no Postgres driver and no DATABASE_URL — direct access
//     means a new dependency plus a database credential sitting on a laptop,
//     for a job that only ever reads;
//   • it already speaks HTTP with urllib for Chargebee and Metabase, so this
//     adds no import;
//   • it exercises the same read path the page uses, so a break in the read
//     shows up in one place instead of two.
//
// WHY IT LIVES UNDER /api/cron: src/middleware.ts exempts that prefix from the
// SSO redirect. Anything else gets bounced to /signin — which is precisely how
// the snapshot cron failed silently for twelve days (fixed in bb82584).
//
// The bearer secret is REQUIRED, not optional. The sibling cron route skips its
// check when CRON_SECRET is unset, which is tolerable for a job that writes on
// a schedule and intolerable for an endpoint that hands out the whole book. An
// unauthenticated production data route was removed once already (ca0ad0e); it
// is not coming back.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured; this endpoint stays closed rather than open." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  if (!neonUrl()) {
    return NextResponse.json({ ok: false, error: "no database configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const wanted = url.searchParams.get("date");
  if (wanted && !DATE_RE.test(wanted)) {
    return NextResponse.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const [trendRaw, runs] = await Promise.all([getAmTrend(), getAmRuns(60)]);
  const rows = parseTrend(trendRaw);
  const view = buildAmReportView(rows);

  const date = wanted ?? view.latest;
  if (!date) {
    return NextResponse.json({ ok: false, error: "alfred.am_daily is empty" }, { status: 404 });
  }
  const dayRows = rows.filter((r) => r.date === date);
  if (!dayRows.length) {
    return NextResponse.json(
      { ok: false, error: `no snapshot for ${date}`, available: view.dates },
      { status: 404 },
    );
  }

  // The row for `date` is rebuilt here rather than reusing view.amRows, which
  // only ever describes the newest day.
  const ordered = dayRows
    .slice()
    .sort(
      (a, b) =>
        (b.values.active_accounts ?? 0) - (a.values.active_accounts ?? 0) || a.amName.localeCompare(b.amName),
    );

  const flatten = (values: Record<MetricKey, number | null>) =>
    Object.fromEntries(AM_METRICS.map((m): [MetricKey, number | null] => [m.key, values[m.key]]));

  // Same helper the page uses, so the workbook's TOTAL row and the page's
  // company row agree by construction rather than by coincidence.
  const totalsForDate = companyTotal(dayRows);

  const run = runs.find((r) => r.snapshot_date === date) ?? null;
  const lastOk = runs.find((r) => r.ok) ?? null;

  return NextResponse.json({
    ok: true,
    date,
    metricVersion: Math.max(...dayRows.map((r) => r.metricVersion)),
    sources: Array.from(new Set(dayRows.map((r) => r.source))).sort(),
    availableDates: view.dates,
    versionBoundaries: view.versionBoundaries,
    run: run
      ? {
          ok: run.ok,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          durationMs: run.duration_ms,
          amRows: run.am_rows,
          error: run.error,
        }
      : null,
    lastSuccessfulRun: lastOk ? { date: lastOk.snapshot_date, finishedAt: lastOk.finished_at } : null,
    columns: AM_METRICS.map((m) => ({ key: m.key, label: m.label, format: m.format, definition: m.definition })),
    rows: ordered.map((r) => ({ am: r.amName, metricVersion: r.metricVersion, ...flatten(r.values) })),
    total: flatten(totalsForDate),
  });
}
