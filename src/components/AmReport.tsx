// ===========================================================================
// /am-report — the owner's readout over alfred.am_daily.
//
// A server component on purpose: there is no state to hold, so the page ships
// no JavaScript for the table or the charts. Every chart is hand-built SVG —
// CLAUDE.md bans chart libraries.
//
// Three things here are deliberate rather than stylistic, and each was earned:
//   • A NULL churn percentage renders as an empty cell. Not 100, not an
//     em-dash that looks like a value. AMs who have left still carry churned
//     accounts against a zero book.
//   • `(unassigned)` is rendered like any other row, flagged as a data-quality
//     signal. It is never hidden and never folded into another AM.
//   • A day-over-day delta that spans a metric_version change is shown as
//     "def." rather than a number, because the 182 -> 110 step on 03/08 was a
//     definition change and reads as a service collapse if left unmarked.
// ===========================================================================

import {
  AM_CONTEXT_NOTES,
  AM_METRICS,
  UNASSIGNED,
  STALE_AFTER_HOURS,
  type AmReportView,
  type AmRowView,
  type AmSeries,
  type MetricDef,
  type SeriesPoint,
  ddmmyy,
  ddmmyyHm,
  deltaTone,
  formatDelta,
  formatMetric,
  parsePgTimestamp,
} from "@/lib/amMetrics";

export interface RunLite {
  snapshot_date: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  duration_ms: number | null;
  am_rows: number | null;
  error: string | null;
}

interface Props {
  view: AmReportView;
  runs: RunLite[];
  /** false when DATABASE_URL is unset — the page shows an empty state, never crashes. */
  dbConfigured: boolean;
  now?: Date;
}

const PANEL: React.CSSProperties = {
  borderColor: "var(--cave-line)",
  background: "var(--cave-panel)",
};

const STICKY_COL: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "var(--cave-panel)",
  borderRight: "1px solid var(--cave-line)",
};

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/** YYYY-MM-DD as it reads in IST — the timezone the cron and the team run on. */
function istDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function daysBetweenDates(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
  return Math.round((tb - ta) / 86_400_000);
}

type FreshLevel = "ok" | "unverified" | "stale";

interface Freshness {
  level: FreshLevel;
  lastOkAt: Date | null;
  ageHours: number | null;
  /** The newest run attempt, successful or not. */
  lastAttempt: RunLite | null;
  attemptFailed: boolean;
  daysBehind: number | null;
  headline: string;
  detail: string;
}

function assessFreshness(runs: RunLite[], latestSnapshot: string | null, now: Date): Freshness {
  const lastAttempt = runs.length ? runs[0] : null;
  const lastOk = runs.find((r) => r.ok) ?? null;
  const lastOkAt = lastOk ? parsePgTimestamp(lastOk.finished_at ?? lastOk.started_at) : null;
  const ageHours = lastOkAt ? (now.getTime() - lastOkAt.getTime()) / 3_600_000 : null;
  const daysBehind = latestSnapshot ? daysBetweenDates(latestSnapshot, istDate(now)) : null;
  const attemptFailed = !!lastAttempt && !lastAttempt.ok;

  let level: FreshLevel = "ok";
  let headline: string;
  let detail: string;

  if (!latestSnapshot) {
    level = "stale";
    headline = "No snapshots recorded";
    detail = "alfred.am_daily is empty. Nothing below is real until the cron or the backfill has written a day.";
  } else if (ageHours !== null && ageHours > STALE_AFTER_HOURS) {
    level = "stale";
    headline = `Stale — last successful run was ${Math.floor(ageHours)}h ago`;
    detail = `These numbers are from ${ddmmyy(latestSnapshot)}. Threshold is ${STALE_AFTER_HOURS}h. Check /api/cron/am-report and the run log below before quoting anything on this page.`;
  } else if (ageHours === null) {
    // No successful run has ever been recorded, so the age of the data cannot
    // be established from a timestamp — only from the snapshot date. Say so
    // rather than inventing a clean "Updated" line over backfilled rows.
    level = daysBehind !== null && daysBehind >= 2 ? "stale" : "unverified";
    headline =
      level === "stale"
        ? `Stale — newest snapshot is ${daysBehind} days old and no run is recorded`
        : "Unverified — no successful scheduled run recorded";
    detail = `Newest snapshot is dated ${ddmmyy(latestSnapshot)}. alfred.am_daily_run holds no successful run, so these rows came from the backfill, not from a job that is proven to be running.`;
  } else {
    headline = `Updated ${ddmmyyHm(lastOkAt)} IST`;
    detail = `Snapshot ${ddmmyy(latestSnapshot)} · last successful run ${Math.floor(ageHours)}h ago${
      lastOk?.am_rows != null ? ` · ${lastOk.am_rows} AM rows` : ""
    }${lastOk?.duration_ms != null ? ` · ${Math.round(lastOk.duration_ms / 1000)}s` : ""}.`;
  }

  // A failed newest attempt is worth shouting about even when an older run
  // succeeded inside the window — that is exactly the silent-failure shape.
  if (attemptFailed && level === "ok") level = "unverified";

  return { level, lastOkAt, ageHours, lastAttempt, attemptFailed, daysBehind, headline, detail };
}

function FreshnessBanner({ f, view }: { f: Freshness; view: AmReportView }) {
  const tone =
    f.level === "stale"
      ? { ink: "var(--am-bad)", wash: "var(--am-bad-wash)", tag: "STALE" }
      : f.level === "unverified"
        ? { ink: "var(--am-warn)", wash: "var(--am-warn-wash)", tag: "UNVERIFIED" }
        : { ink: "var(--am-good)", wash: "rgba(61,220,151,.08)", tag: "LIVE" };

  return (
    <section
      aria-label="Data freshness"
      className={`rounded-xl border px-4 py-3 ${f.level === "stale" ? "am-stale" : ""}`}
      style={{ borderColor: tone.ink, background: tone.wash }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em]"
          style={{ background: tone.ink, color: "#04080a" }}
        >
          {tone.tag}
        </span>
        <span className="text-base font-semibold" style={{ color: tone.ink }}>
          {f.headline}
        </span>
        <span className="text-[11px] text-slate-400">{f.detail}</span>
      </div>

      {f.attemptFailed && f.lastAttempt && (
        <div className="mt-2 rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--am-bad)" }}>
          <b style={{ color: "var(--am-bad)" }}>Newest run FAILED</b>{" "}
          <span className="text-slate-400">({ddmmyy(f.lastAttempt.snapshot_date)}) — </span>
          <code className="break-all text-slate-500">{f.lastAttempt.error || "no error recorded"}</code>
        </div>
      )}

      <div className="mt-1.5 text-[11px] text-slate-500">
        {view.dates.length} snapshot day{view.dates.length === 1 ? "" : "s"}
        {view.dates.length > 0 && (
          <>
            {" "}
            ({ddmmyy(view.dates[0])} → {ddmmyy(view.latest)})
          </>
        )}{" "}
        · {view.amCount} AM{view.amCount === 1 ? "" : "s"}
        {view.sources.length > 0 && <> · source: {view.sources.join(" + ")}</>}
        {view.versionBoundaries.length > 0 && (
          <>
            {" "}
            ·{" "}
            <span style={{ color: "var(--am-warn)" }}>
              metric definition changed{" "}
              {view.versionBoundaries.map((b) => `${ddmmyy(b.date)} (v${b.from}→v${b.to})`).join(", ")}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Today — one row per AM, every metric, delta per cell
// ---------------------------------------------------------------------------

function DeltaCell({ row, m }: { row: AmRowView; m: MetricDef }) {
  const d = row.deltas[m.key];
  // Invisible placeholder rather than nothing: it holds the row height steady
  // without putting a character in front of a screen reader.
  if (d.kind === "none" || d.kind === "blank")
    return (
      <span aria-hidden className="opacity-0">
        ·
      </span>
    );
  if (d.kind === "new")
    return (
      <span style={{ color: "var(--cave-cy)" }} title="No row for this AM on the comparison day">
        new
      </span>
    );
  if (d.kind === "version")
    return (
      <span
        style={{ color: "var(--am-warn)" }}
        title="The definition of this metric changed between the two days. The step is a definition change, not movement — see Definitions."
      >
        def.
      </span>
    );
  const diff = d.diff;
  if (d.kind === "flat" || diff === null || diff === 0)
    return (
      <span style={{ color: "var(--am-flat)" }} title="Unchanged">
        ·
      </span>
    );
  const tone = deltaTone(diff, m.direction);
  const color = tone === "good" ? "var(--am-good)" : tone === "bad" ? "var(--am-bad)" : "var(--am-flat)";
  return (
    <span style={{ color }} title={`${formatDelta(diff, m.format)} vs the previous snapshot`}>
      {formatDelta(diff, m.format)}
    </span>
  );
}

function TodayTable({ view }: { view: AmReportView }) {
  const rows: AmRowView[] = view.totalRow ? [view.totalRow, ...view.amRows] : view.amRows;

  if (!rows.length) {
    return (
      <div className="rounded-xl border p-6 text-center text-sm text-slate-400" style={PANEL}>
        No snapshot rows to show.
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-3" style={PANEL}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cave-cy)" }}>
            Today · {ddmmyy(view.latest)}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Every metric, one row per AM. The small figure under each value is the change against{" "}
            {view.previous ? (
              <b>{ddmmyy(view.previous)}</b>
            ) : (
              <span>the previous snapshot (none yet — this is the first day)</span>
            )}
            . Column headers link to their definition.
          </p>
        </div>
        <a href="#definitions" className="text-[11px] underline" style={{ color: "var(--cave-cy)" }}>
          Metric definitions ↓
        </a>
      </div>

      <div className="table-scroll -mx-1">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-[3] text-left uppercase tracking-wide text-slate-400">
            <tr>
              {/* The corner cell is sticky on BOTH axes, and must out-stack the
                  row headers it crosses or it drifts under them when scrolled. */}
              <th
                className="px-2 py-1.5 font-semibold"
                style={{ ...STICKY_COL, top: 0, zIndex: 4, background: "var(--cave-panel2)" }}
              >
                Account manager
              </th>
              {AM_METRICS.map((m) => (
                <th
                  key={m.key}
                  className="whitespace-nowrap px-2 py-1.5 text-right align-bottom font-semibold"
                  style={{ background: "var(--cave-panel2)" }}
                >
                  <a
                    href={`#def-${m.key}`}
                    title={m.tooltip}
                    className="no-underline hover:underline"
                    style={{ color: "inherit" }}
                  >
                    {m.label}
                    {m.versionSensitive && (
                      <sup style={{ color: "var(--am-warn)" }} title="Definition changed — see Definitions">
                        †
                      </sup>
                    )}
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unassigned = r.amName === UNASSIGNED;
              const rowBg = r.isTotal ? "var(--cave-panel2)" : "var(--cave-panel)";
              return (
                <tr
                  key={r.amName}
                  className="border-t border-slate-100"
                  style={r.isTotal ? { borderBottom: "2px solid var(--cave-line2)" } : undefined}
                >
                  <td
                    className={`whitespace-nowrap px-2 py-1.5 ${r.isTotal ? "font-bold" : "font-medium"}`}
                    style={{
                      ...STICKY_COL,
                      background: rowBg,
                      color: r.isTotal ? "var(--cave-cy)" : "var(--cave-txt)",
                      borderLeft: unassigned ? "3px solid var(--am-warn)" : undefined,
                    }}
                  >
                    {r.amName}
                    {unassigned && (
                      <span
                        className="ml-1.5 rounded px-1 py-px text-[9px] uppercase tracking-wide"
                        style={{ color: "var(--am-warn)", border: "1px solid var(--am-warn)" }}
                        title="Churned accounts lose their AM link. This is a data-quality signal, not an account manager."
                      >
                        data quality
                      </span>
                    )}
                  </td>
                  {AM_METRICS.map((m) => {
                    const v = r.values[m.key];
                    return (
                      <td
                        key={m.key}
                        className="px-2 py-1.5 text-right align-top tabular-nums"
                        style={{ background: rowBg }}
                        title={
                          v === null && m.format === "pct"
                            ? `${r.amName} holds no live book, so this percentage is not computed. A rate on an empty denominator would print as 100% and read as an accusation.`
                            : undefined
                        }
                      >
                        {/* A NULL percentage is an EMPTY cell. Never 100. */}
                        <div className={r.isTotal ? "font-bold" : ""} style={{ color: "var(--cave-txt)" }}>
                          {v === null ? (
                            <span aria-hidden className="opacity-0">
                              ·
                            </span>
                          ) : (
                            formatMetric(v, m.format)
                          )}
                        </div>
                        <div className="text-[10px] leading-tight">
                          <DeltaCell row={r} m={m} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        Blank cell = no value, by design: churn % is left blank when the AM holds no live book, because a percentage on
        an empty denominator is arithmetic, not performance. <span style={{ color: "var(--am-warn)" }}>def.</span> = the
        metric&apos;s definition changed between the two days, so no delta is claimed.{" "}
        <span style={{ color: "var(--cave-cy)" }}>new</span> = the AM had no row on the comparison day.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend — hand-built small multiples. No chart library (CLAUDE.md).
// ---------------------------------------------------------------------------

function Spark({
  points,
  metric,
  boundaryDates,
  width = 196,
  height = 46,
}: {
  points: SeriesPoint[];
  metric: MetricDef;
  boundaryDates: string[];
  width?: number;
  height?: number;
}) {
  const padX = 3;
  const padY = 5;
  const real = points.filter((p) => p.value !== null) as Array<SeriesPoint & { value: number }>;

  if (real.length === 0) {
    return (
      <div className="text-[10px] text-slate-500" style={{ height }}>
        no data
      </div>
    );
  }
  // Sparse history is shown honestly: one point is a reading, not a trend.
  if (real.length < 2) {
    return (
      <div className="flex items-center text-[10px] text-slate-500" style={{ height }}>
        1 snapshot — no trend yet
      </div>
    );
  }

  const values = real.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const flat = rawMin === rawMax;
  const min = flat ? rawMin - 1 : rawMin;
  const max = flat ? rawMax + 1 : rawMax;
  const span = max - min || 1;

  const n = points.length;
  const x = (i: number) => padX + (n === 1 ? 0 : (i * (width - padX * 2)) / (n - 1));
  const y = (v: number) => height - padY - ((v - min) / span) * (height - padY * 2);

  // Null days break the line rather than being drawn through as if they were
  // measured. A lone surviving point becomes a dot.
  const segments: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur.length) segments.push(cur);
      cur = [];
      return;
    }
    cur.push([x(i), y(p.value)]);
  });
  if (cur.length) segments.push(cur);

  const lastIdx = points.reduce((acc, p, i) => (p.value !== null ? i : acc), 0);
  const lastVal = points[lastIdx].value as number;

  // Only mark a boundary on a series the change actually affected.
  const marks = metric.versionSensitive
    ? boundaryDates
        .map((d) => points.findIndex((p) => p.date === d))
        .filter((i) => i > 0)
        .map((i) => (x(i) + x(i - 1)) / 2)
    : [];

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`${metric.short}: ${formatMetric(lastVal, metric.format)}`}
    >
      {marks.map((mx, i) => (
        <g key={i}>
          <line
            x1={mx}
            x2={mx}
            y1={1}
            y2={height - 1}
            stroke="var(--am-warn)"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.85}
          />
          {height > 30 && (
            <text x={mx + 2} y={9} fontSize={7} fill="var(--am-warn)">
              def.
            </text>
          )}
        </g>
      ))}
      {segments.map((seg, i) =>
        seg.length === 1 ? (
          <circle key={i} cx={seg[0][0]} cy={seg[0][1]} r={1.6} fill="var(--cave-cy)" />
        ) : (
          <polyline
            key={i}
            points={seg.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--cave-cy)"
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
      <circle cx={x(lastIdx)} cy={y(lastVal)} r={2.2} fill="var(--cave-cy)" />
    </svg>
  );
}

function TrendCard({
  series,
  metric,
  boundaryDates,
  dates,
}: {
  series: AmSeries;
  metric: MetricDef;
  boundaryDates: string[];
  dates: string[];
}) {
  const points = series.points[metric.key];
  const real = points.filter((p) => p.value !== null) as Array<SeriesPoint & { value: number }>;
  const current = real.length ? real[real.length - 1].value : null;
  const lo = real.length ? Math.min(...real.map((p) => p.value)) : null;
  const hi = real.length ? Math.max(...real.map((p) => p.value)) : null;

  return (
    <div
      className="rounded-lg border p-2.5"
      style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel2)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <a
          href={`#def-${metric.key}`}
          title={metric.tooltip}
          className="truncate text-[10px] uppercase tracking-[0.1em] no-underline hover:underline"
          style={{ color: "var(--cave-dim)" }}
        >
          {metric.short}
          {metric.versionSensitive && <sup style={{ color: "var(--am-warn)" }}>†</sup>}
        </a>
        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--cave-txt)" }}>
          {current === null ? "—" : formatMetric(current, metric.format)}
        </span>
      </div>
      <div className="mt-1">
        <Spark points={points} metric={metric} boundaryDates={boundaryDates} />
      </div>
      {/* Each chart carries its own scale, so the range is printed rather than
          implied — otherwise an independent y-range reads as a bigger swing
          than it is. */}
      <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-slate-500">
        <span>{ddmmyy(dates[0])}</span>
        <span>{lo === null || hi === null ? "" : `${formatMetric(lo, metric.format)}–${formatMetric(hi, metric.format)}`}</span>
        <span>{ddmmyy(dates[dates.length - 1])}</span>
      </div>
    </div>
  );
}

function TrendGrid({ view }: { view: AmReportView }) {
  const cs = view.companySeries;
  if (!cs || view.dates.length === 0) return null;
  const boundaryDates = view.versionBoundaries.map((b) => b.date);

  return (
    <div className="rounded-xl border p-3" style={PANEL}>
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cave-cy)" }}>
        Company trend
      </h2>
      <p className="mb-3 mt-0.5 text-[11px] text-slate-400">
        One small chart per metric, each on its own scale (the range is printed under the line) — twelve series on a
        shared axis is unreadable.
        {view.versionBoundaries.length > 0 && (
          <>
            {" "}
            The dashed <span style={{ color: "var(--am-warn)" }}>def.</span> marker is a definition change, not a
            movement in the business.
          </>
        )}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {AM_METRICS.map((m) => (
          <TrendCard key={m.key} series={cs} metric={m} boundaryDates={boundaryDates} dates={view.dates} />
        ))}
      </div>
    </div>
  );
}

function PerAmTrends({ view }: { view: AmReportView }) {
  if (!view.amSeries.length || view.dates.length === 0) return null;
  const boundaryDates = view.versionBoundaries.map((b) => b.date);

  return (
    <div className="rounded-xl border p-3" style={PANEL}>
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cave-cy)" }}>
        Per-AM detail
      </h2>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-400">
        The same {view.dates.length} snapshot day{view.dates.length === 1 ? "" : "s"} for each account manager. Each
        sparkline has its own scale; the figure beside it is the current value.
      </p>
      <div className="table-scroll -mx-1">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-[3] text-left uppercase tracking-wide text-slate-400">
            <tr>
              {/* The corner cell is sticky on BOTH axes, and must out-stack the
                  row headers it crosses or it drifts under them when scrolled. */}
              <th
                className="px-2 py-1.5 font-semibold"
                style={{ ...STICKY_COL, top: 0, zIndex: 4, background: "var(--cave-panel2)" }}
              >
                Account manager
              </th>
              {AM_METRICS.map((m) => (
                <th
                  key={m.key}
                  className="whitespace-nowrap px-2 py-1.5 font-semibold"
                  style={{ background: "var(--cave-panel2)" }}
                >
                  <a
                    href={`#def-${m.key}`}
                    title={m.tooltip}
                    className="no-underline hover:underline"
                    style={{ color: "inherit" }}
                  >
                    {m.short}
                    {m.versionSensitive && <sup style={{ color: "var(--am-warn)" }}>†</sup>}
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.amSeries.map((s) => {
              const unassigned = s.amName === UNASSIGNED;
              return (
                <tr key={s.amName} className="border-t border-slate-100">
                  <td
                    className="whitespace-nowrap px-2 py-1 font-medium"
                    style={{
                      ...STICKY_COL,
                      color: "var(--cave-txt)",
                      borderLeft: unassigned ? "3px solid var(--am-warn)" : undefined,
                    }}
                  >
                    {s.amName}
                  </td>
                  {AM_METRICS.map((m) => {
                    const pts = s.points[m.key];
                    const real = pts.filter((p) => p.value !== null) as Array<SeriesPoint & { value: number }>;
                    const cur = real.length ? real[real.length - 1].value : null;
                    return (
                      <td key={m.key} className="px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <Spark points={pts} metric={m} boundaryDates={boundaryDates} width={64} height={20} />
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--cave-dim)" }}>
                            {cur === null ? "" : formatMetric(cur, m.format)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definitions — on the page, because the page gets screenshotted and shown to
// people who were never in the conversation that produced these numbers.
// ---------------------------------------------------------------------------

function Definitions() {
  return (
    <div id="definitions" className="am-anchor rounded-xl border p-3" style={PANEL}>
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cave-cy)" }}>
        Definitions
      </h2>
      <p className="mb-3 mt-0.5 text-[11px] text-slate-400">
        How every column is computed, and what not to trust. Same text as the Definitions sheet of the daily workbook.
      </p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        {AM_METRICS.map((m) => (
          <div key={m.key} id={`def-${m.key}`} className="am-anchor">
            <dt className="text-[11px] font-semibold" style={{ color: "var(--cave-txt)" }}>
              {m.label}
              {m.versionSensitive && <sup style={{ color: "var(--am-warn)" }}>†</sup>}
            </dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-slate-400">
              {m.definition}
              {m.caveat && (
                <div
                  className="mt-1 border-l-2 pl-2"
                  style={{ borderColor: "var(--am-warn)", color: "var(--am-warn)" }}
                >
                  {m.caveat}
                </div>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Context and known limits
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        {AM_CONTEXT_NOTES.map((c) => (
          <div key={c.title}>
            <dt className="text-[11px] font-semibold" style={{ color: "var(--cave-txt)" }}>
              {c.title}
            </dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-slate-400">{c.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run log — the evidence behind the freshness banner
// ---------------------------------------------------------------------------

function RunLog({ runs }: { runs: RunLite[] }) {
  if (!runs.length) return null;
  return (
    <details className="rounded-xl border p-3" style={PANEL}>
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Run log ({runs.length})
      </summary>
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead className="text-left uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-1 font-semibold">Date</th>
            <th className="px-2 py-1 font-semibold">Result</th>
            <th className="px-2 py-1 font-semibold">Finished</th>
            <th className="px-2 py-1 text-right font-semibold">AM rows</th>
            <th className="px-2 py-1 text-right font-semibold">Duration</th>
            <th className="px-2 py-1 font-semibold">Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.snapshot_date} className="border-t border-slate-100">
              <td className="px-2 py-1 tabular-nums text-slate-400">{ddmmyy(r.snapshot_date)}</td>
              <td className="px-2 py-1 font-semibold" style={{ color: r.ok ? "var(--am-good)" : "var(--am-bad)" }}>
                {r.ok ? "ok" : "FAILED"}
              </td>
              <td className="px-2 py-1 tabular-nums text-slate-400">{ddmmyyHm(parsePgTimestamp(r.finished_at))}</td>
              <td className="px-2 py-1 text-right tabular-nums text-slate-400">{r.am_rows ?? ""}</td>
              <td className="px-2 py-1 text-right tabular-nums text-slate-400">
                {r.duration_ms == null ? "" : `${Math.round(r.duration_ms / 1000)}s`}
              </td>
              <td className="px-2 py-1 text-slate-500">{r.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// ---------------------------------------------------------------------------

export default function AmReport({ view, runs, dbConfigured, now }: Props) {
  const at = now ?? new Date();

  if (!dbConfigured) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--am-warn)", background: "var(--am-warn-wash)" }}
      >
        <div className="text-sm font-semibold" style={{ color: "var(--am-warn)" }}>
          No snapshot store configured
        </div>
        <p className="mt-1 text-[12px] text-slate-400">
          <code>DATABASE_URL</code> is unset, so <code>alfred.am_daily</code> cannot be read. The page degrades to this
          empty state rather than rendering zeros — a zero here would be indistinguishable from a real one.
        </p>
      </div>
    );
  }

  const f = assessFreshness(runs, view.latest, at);

  return (
    <div className="space-y-4">
      <FreshnessBanner f={f} view={view} />
      {view.latest ? (
        <>
          <TodayTable view={view} />
          <TrendGrid view={view} />
          <PerAmTrends view={view} />
        </>
      ) : (
        <div className="rounded-xl border p-6 text-center text-sm text-slate-400" style={PANEL}>
          <code>alfred.am_daily</code> is empty. Run the backfill or wait for the cron at 17:30 IST.
        </div>
      )}
      <RunLog runs={runs} />
      <Definitions />
    </div>
  );
}
