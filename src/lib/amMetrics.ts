// ===========================================================================
// AM daily report — metric catalogue and the pure view model behind /am-report.
//
// Nothing here talks to a source system. It reads rows that already exist in
// `alfred.am_daily` (written by the cron in src/lib/amReport.ts, or by the
// backfill) and reshapes them for rendering. That separation is the point of
// the whole exercise: two implementations of twelve metrics drifted once
// already, across a seven-minute gap on 29/07, so there is now exactly one
// place a number is computed and everything else reads it.
//
// The single exception is documented at `companyTotal()` — the company row is
// summed from the stored per-AM rows, and its churn percentages are re-derived
// with the workbook's own formula rather than averaged. That is stated on the
// page as well as here.
//
// No "server-only" import: this file is pure and is shared by the page, the
// export endpoint, and anything that wants to test the shaping.
// ===========================================================================

export const UNASSIGNED = "(unassigned)";

/** Hours after which the newest snapshot is loudly stale on the page. Both
 *  scheduled jobs in this stack have failed silently — a laptop job that ran
 *  and wrote nothing, and a Vercel cron redirected to /signin for twelve days.
 *  Neither was noticed. A dashboard quietly serving four-day-old numbers is
 *  worse than one that is visibly down. */
export const STALE_AFTER_HOURS = 36;

export type MetricKey =
  | "active_accounts"
  | "mrr"
  | "missed_payment_accounts"
  | "missed_payment_amount"
  | "churned_30d"
  | "churn_pct_30d"
  | "churned_mtd"
  | "churn_pct_mtd"
  | "retention_risk_tickets"
  | "sched_provisioned"
  | "sched_product_active"
  | "sched_onboarded"
  | "sched_incomplete"
  | "untouched_human_30d"
  | "untouched_all_30d";

/** Whether a rise in this metric is good news, bad news, or neither. Drives the
 *  delta colour only — never the number. `neutral` is used deliberately where a
 *  direction would be a claim the data does not support (the two scheduling
 *  provisioning counts are flags, not usage). */
export type Direction = "up-good" | "up-bad" | "neutral";
export type MetricFormat = "int" | "money" | "pct";

export interface MetricDef {
  key: MetricKey;
  /** Column header — matches the workbook's Summary sheet wording. */
  label: string;
  /** Small-multiple chart title; short enough for a 200px card. */
  short: string;
  format: MetricFormat;
  direction: Direction;
  /** True when a metric_version bump changed what this metric counts. A step in
   *  such a series must be marked, or a definition change reads as a collapse. */
  versionSensitive?: boolean;
  /** One line, shown as the column tooltip. */
  tooltip: string;
  /** Full text for the Definitions section — sourced from the Definitions sheet
   *  of ~/scripts/daily_am_report_detailed.py so both artefacts say one thing. */
  definition: string;
  /** Optional caveat rendered as its own line, in warning ink. */
  caveat?: string;
}

/** Column order, and the order of the small multiples. Matches the workbook's
 *  Summary sheet so the page and the spreadsheet read left-to-right the same. */
export const AM_METRICS: MetricDef[] = [
  {
    key: "active_accounts",
    label: "Active accounts",
    short: "Active accounts",
    format: "int",
    direction: "up-good",
    tooltip: "Distinct entities with an active or non_renewing Chargebee subscription.",
    definition:
      "Distinct entities with an active or non_renewing Chargebee subscription (joined on the subscription custom field cf_entity_id).",
  },
  {
    key: "mrr",
    label: "MRR",
    short: "MRR",
    format: "money",
    direction: "up-good",
    tooltip: "Sum of subscription.mrr on active subs — Chargebee's normalised monthly value.",
    definition:
      "Sum of subscription.mrr on active subscriptions. Chargebee's normalised monthly value. Not subscription_items.amount, which is per billing period and is not monthly.",
  },
  {
    key: "missed_payment_accounts",
    label: "Missed pmt accts",
    short: "Missed payment accounts",
    format: "int",
    direction: "up-bad",
    tooltip: "Live accounts holding a payment_due invoice with amount_due > 0.",
    definition: "Live accounts with a payment_due invoice, amount_due > 0.",
  },
  {
    key: "missed_payment_amount",
    label: "Missed pmt amount",
    short: "Missed payment amount",
    format: "money",
    direction: "up-bad",
    tooltip: "Total amount_due across those invoices.",
    definition: "Sum of amount_due across the payment_due invoices counted above.",
  },
  {
    key: "churned_30d",
    label: "Churned 30d",
    short: "Churned 30d",
    format: "int",
    direction: "up-bad",
    tooltip: "Account-level: entity cancelled in the window AND holds no active sub.",
    definition:
      "ACCOUNT-level: the entity cancelled inside the 30-day window and holds no active subscription. 77 subscription cancellations were only 62 churned accounts — counting subscriptions overstates churn by about 24%.",
  },
  {
    key: "churn_pct_30d",
    label: "Churn % 30d",
    short: "Churn % 30d",
    format: "pct",
    direction: "up-bad",
    tooltip: "churned / (active + churned). Blank — never 100 — when the AM holds no live book.",
    definition:
      "churned / (active + churned). Left BLANK when the AM has no live book: a 100% rate on an empty denominator is arithmetic, not performance. Several AMs have left the company and still carry churned accounts against a zero book.",
  },
  {
    key: "churned_mtd",
    label: "Churned MTD",
    short: "Churned MTD",
    format: "int",
    direction: "up-bad",
    tooltip: "Same account-level test, calendar month to date.",
    definition: "The same account-level churn test, measured from the first of the calendar month to date.",
  },
  {
    key: "churn_pct_mtd",
    label: "Churn % MTD",
    short: "Churn % MTD",
    format: "pct",
    direction: "up-bad",
    tooltip: "churned MTD / (active + churned MTD). Blank on a zero book.",
    definition: "churned MTD / (active + churned MTD), under the same blank-on-a-zero-book rule as Churn % 30d.",
  },
  {
    key: "retention_risk_tickets",
    label: "Retention risk tickets",
    short: "Retention risk tickets",
    format: "int",
    direction: "up-bad",
    tooltip: "Open Linear tickets classified Retention Risk Alert or Churn Ticket, excluding FALSE_ALERT.",
    definition:
      "Open Linear tickets classified Retention Risk Alert or Churn Ticket, excluding FALSE_ALERT. Source: public Metabase question a3f0ebc6.",
  },
  {
    key: "sched_provisioned",
    label: "Sched provisioned",
    short: "Scheduling provisioned",
    format: "int",
    direction: "neutral",
    tooltip: "Entities the scheduling product (Product ID 10) is provisioned to.",
    definition:
      "Entities the scheduling product (Product ID 10) is provisioned to. Source: public Metabase question 6db8275e (owner-supplied 28/07/26).",
  },
  {
    key: "sched_product_active",
    label: "Sched product active",
    short: "Scheduling product active",
    format: "int",
    direction: "neutral",
    tooltip: "Provisioning flag, not usage — it overstates the real footprint. Read Sched ONBOARDED instead.",
    definition:
      "Of the provisioned entities, those whose product Is Active flag is true. Matches the master dashboard card 'Active Scheduling Product - Non Test' exactly.",
    caveat:
      "THIS OVERSTATES USAGE. It is a provisioning flag, not evidence that anyone is using scheduling. Quote Sched ONBOARDED instead.",
  },
  {
    key: "sched_onboarded",
    label: "Sched ONBOARDED",
    short: "Scheduling onboarded",
    format: "int",
    direction: "up-good",
    tooltip: "Locations that completed scheduling onboarding — the number to quote.",
    definition:
      "Locations that completed scheduling onboarding — master dashboard 'Scheduling & Payments' card 3778. THE number to quote. QC on 29/07/26 found 121 product-active against only 69 onboarded.",
  },
  {
    key: "sched_incomplete",
    label: "Sched onboarding incomplete",
    short: "Scheduling incomplete",
    format: "int",
    direction: "up-bad",
    tooltip: "Started onboarding, did not finish (card 3768) — the highest-yield call list on this report.",
    definition:
      "Started onboarding and did not finish (card 3768). The product is switched on and the setup is unfinished — the highest-yield call list on this report.",
  },
  {
    key: "untouched_human_30d",
    label: "Untouched 30d (human)",
    short: "Untouched (human)",
    format: "int",
    direction: "up-bad",
    versionSensitive: true,
    tooltip:
      "No ONE-TO-ONE contact in 30 days: staff app-chat, phone call, or meeting. This is the column to action.",
    definition:
      "Live accounts with NO one-to-one contact in 30 days: staff app-chat (member_type = 'Team Member'), phone call, or meeting. THE column to action — it answers 'has a person actually dealt with this client?'.",
    caveat:
      "Definition changed on 03/08/26 (metric version 0 to 1): SMS was removed. A bulk campaign reached +800 numbers in four days and cut this list 182 to 110 while every one-to-one channel declined. The step is marked on the trend, and a day-over-day delta across the boundary is suppressed rather than shown as movement.",
  },
  {
    key: "untouched_all_30d",
    label: "Untouched 30d (all channels)",
    short: "Untouched (all channels)",
    format: "int",
    direction: "up-bad",
    tooltip: "Adds SMS, email and HubSpot. Saturates near zero — NOT a work list.",
    definition:
      "Adds SMS, email and HubSpot last-connected to the test above. Those channels are largely automated — email alone reaches about 92% of the book — so this column saturates near zero (roughly 6 book-wide).",
    caveat:
      "Not a work list. It effectively reports whether billing and CRM sync are running. Read 'Untouched (human)' for anything actionable.",
  },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(
  AM_METRICS.map((m): [MetricKey, MetricDef] => [m.key, m]),
) as Record<MetricKey, MetricDef>;

/** Context that is not a column but belongs next to the numbers. Also lifted
 *  from the workbook's Definitions sheet. */
export const AM_CONTEXT_NOTES: Array<{ title: string; body: string }> = [
  {
    title: "AM attribution",
    body:
      "BaseSheet card 1335, falling back to cx.am_mapping then entities.employees. CURRENT assignment, per the owner's decision of 27/07/26 — not the assignment at the time of the event.",
  },
  {
    title: "(unassigned)",
    body:
      "A real row, never hidden and never merged. Churned accounts lose their AM link: 19 of 62 recent churns had no AM in either source. It carries churned accounts and tickets against a zero live book, which is why its churn percentages are blank. It is a data-quality signal, not an account manager.",
  },
  {
    title: "Scheduling — known QC issue",
    body:
      "The master dashboard contradicts itself: scalar card 4118 returns 121 while its own list card 4124 returns 115 rows for the same stated metric. Unresolved by the dashboard's owner. 'Websites Flipped' (127) also exceeds product-active (121).",
  },
  {
    title: "Known gaps",
    body:
      "sales.fireflies_meeting returns zero rows for the window and is unverified. Per-AM month denominators are not computed, so monthly churn remains company-wide in the workbook.",
  },
  {
    title: "Company total row",
    body:
      "The only figure derived on this page. Counts and amounts are summed from the stored per-AM rows. The two churn percentages are re-derived as sum(churned) / (sum(active) + sum(churned)) — the workbook's own TOTAL formula — because averaging per-AM percentages would weight a one-account book the same as a two-hundred-account book. Every per-AM value is read from the snapshot unchanged.",
  },
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Coerce a database value to a number, preserving NULL as null. A churn
 *  percentage that arrives as NULL must never become 0. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number {
  return num(v) ?? 0;
}

export interface AmSnapshotRow {
  date: string;
  amName: string;
  metricVersion: number;
  source: string;
  values: Record<MetricKey, number | null>;
}

/** Reshape the raw rows from getAmTrend() into typed snapshot rows. */
export function parseTrend(raw: Record<string, unknown>[]): AmSnapshotRow[] {
  return raw.map((r) => ({
    date: String(r.d ?? ""),
    amName: String(r.am_name ?? ""),
    metricVersion: int(r.metric_version),
    source: String(r.source ?? ""),
    values: {
      active_accounts: int(r.active_accounts),
      mrr: int(r.mrr),
      missed_payment_accounts: int(r.missed_payment_accounts),
      missed_payment_amount: int(r.missed_payment_amount),
      churned_30d: int(r.churned_30d),
      // SIX metrics are nullable, and NULL is load-bearing in every one of them:
      // the two churn percentages (see churn_pct_30d in AM_METRICS above) and the
      // four sched_* counts, whose NULL means "this day never measured scheduling"
      // — the pre-29/07 backfilled workbooks. int() collapsed that to 0 and
      // redrew the 0 -> 106 cliff that making the columns nullable was meant to
      // remove: the fix was applied to the write path and undone here on read.
      // num() preserves it; formatMetric() renders blank and deltaFor() returns
      // kind 'blank' rather than a jump that never happened.
      churn_pct_30d: num(r.churn_pct_30d),
      churned_mtd: int(r.churned_mtd),
      churn_pct_mtd: num(r.churn_pct_mtd),
      retention_risk_tickets: int(r.retention_risk_tickets),
      sched_provisioned: num(r.sched_provisioned),
      sched_product_active: num(r.sched_product_active),
      sched_onboarded: num(r.sched_onboarded),
      sched_incomplete: num(r.sched_incomplete),
      untouched_human_30d: int(r.untouched_human_30d),
      untouched_all_30d: int(r.untouched_all_30d),
    },
  }));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const COUNT_KEYS = AM_METRICS.filter((m) => m.format !== "pct").map((m) => m.key);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Company row for one day. Counts and amounts are summed from the stored per-AM
 * rows; the churn percentages are re-derived with the workbook's TOTAL formula
 * (see AM_CONTEXT_NOTES, "Company total row"). Nothing else on this page
 * calculates a metric.
 */
export function companyTotal(rowsForDay: AmSnapshotRow[]): Record<MetricKey, number | null> {
  const out = {} as Record<MetricKey, number | null>;
  for (const k of COUNT_KEYS) {
    const vals = rowsForDay.map((r) => r.values[k]);
    // An unmeasured value has no sum. `?? 0` here would rebuild the exact fake
    // zero that making sched_* nullable removed — and rebuild it on the company
    // row, the first line anyone reads. On 28/07 all fourteen AMs hold NULL
    // scheduling, so the total is NULL, and 29/07 shows no delta against it
    // rather than a +106 jump that never happened.
    out[k] = vals.some((v) => v === null || v === undefined)
      ? null
      : vals.reduce((s: number, v) => s + (v as number), 0);
  }

  const active = out.active_accounts ?? 0;
  const c30 = out.churned_30d ?? 0;
  const cMtd = out.churned_mtd ?? 0;
  // Same zero-book rule the per-AM rows obey: no live book, no percentage.
  out.churn_pct_30d = active ? round2((c30 / (active + c30)) * 100) : null;
  out.churn_pct_mtd = active ? round2((cMtd / (active + cMtd)) * 100) : null;
  return out;
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type DeltaKind =
  | "none" // no comparison day at all (first snapshot in the series)
  | "new" // this AM had no row on the comparison day
  | "flat" // unchanged
  | "change" // a real movement
  | "blank" // one side is NULL (a zero-book churn %) — nothing to compare
  | "version"; // the definition changed between the two days — a step, not a movement

export interface DeltaView {
  kind: DeltaKind;
  diff: number | null;
}

export interface AmRowView {
  amName: string;
  /** true for the derived company row. */
  isTotal?: boolean;
  metricVersion: number | null;
  values: Record<MetricKey, number | null>;
  deltas: Record<MetricKey, DeltaView>;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  metricVersion: number;
}

export interface AmSeries {
  amName: string;
  isTotal?: boolean;
  points: Record<MetricKey, SeriesPoint[]>;
}

export interface AmReportView {
  /** Every snapshot date present, oldest first. */
  dates: string[];
  latest: string | null;
  /** The preceding snapshot date — not "yesterday": weekends have no run. */
  previous: string | null;
  /** One row per AM for `latest`, ordered as the workbook orders them. */
  amRows: AmRowView[];
  totalRow: AmRowView | null;
  companySeries: AmSeries | null;
  amSeries: AmSeries[];
  /** Dates on which metric_version differs from the preceding date. */
  versionBoundaries: Array<{ date: string; from: number; to: number }>;
  amCount: number;
  /** Distinct sources present (cron / backfill), for the provenance line. */
  sources: string[];
}

function deltaFor(
  cur: number | null,
  prev: number | null,
  hadPrevRow: boolean,
  versionChanged: boolean,
): DeltaView {
  if (!hadPrevRow) return { kind: "new", diff: null };
  // A definition change is a step in the series, not movement in the business.
  // Colouring it green or red would be a lie in whichever direction it fell.
  if (versionChanged) return { kind: "version", diff: null };
  if (cur === null || prev === null) return { kind: "blank", diff: null };
  const diff = round2(cur - prev);
  if (diff === 0) return { kind: "flat", diff: 0 };
  return { kind: "change", diff };
}

const emptyDeltas = (): Record<MetricKey, DeltaView> =>
  Object.fromEntries(
    AM_METRICS.map((m): [MetricKey, DeltaView] => [m.key, { kind: "none", diff: null }]),
  ) as Record<MetricKey, DeltaView>;

const emptyPoints = (): Record<MetricKey, SeriesPoint[]> =>
  Object.fromEntries(AM_METRICS.map((m): [MetricKey, SeriesPoint[]] => [m.key, []])) as Record<
    MetricKey,
    SeriesPoint[]
  >;

/** Build everything the page renders from the raw snapshot rows. Pure. */
export function buildAmReportView(rows: AmSnapshotRow[]): AmReportView {
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const latest = dates.length ? dates[dates.length - 1] : null;
  const previous = dates.length > 1 ? dates[dates.length - 2] : null;

  const byDate = new Map<string, AmSnapshotRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }

  const amNames = Array.from(new Set(rows.map((r) => r.amName)));

  // ---- metric_version boundaries, read from the data rather than assumed ----
  // A day's version is the max present. A mixed day would be a write bug, and
  // taking the max means the boundary is still flagged rather than swallowed.
  const versionOfDate = new Map<string, number>(
    dates.map((d): [string, number] => [
      d,
      (byDate.get(d) ?? []).reduce((m, r) => Math.max(m, r.metricVersion), 0),
    ]),
  );
  const versionBoundaries: Array<{ date: string; from: number; to: number }> = [];
  let prevVersion: number | null = null;
  for (const d of dates) {
    const v = versionOfDate.get(d) ?? 0;
    if (prevVersion !== null && v !== prevVersion) versionBoundaries.push({ date: d, from: prevVersion, to: v });
    prevVersion = v;
  }

  // ---- today's rows, with a delta per cell ----
  const latestRows = latest ? (byDate.get(latest) ?? []) : [];
  const prevRows = previous ? (byDate.get(previous) ?? []) : [];
  const prevByAm = new Map<string, AmSnapshotRow>(
    prevRows.map((r): [string, AmSnapshotRow] => [r.amName, r]),
  );

  const amRows: AmRowView[] = latestRows
    .slice()
    // Same order as the workbook's Summary sheet: biggest book first, then name.
    // (unassigned) sorts to the bottom on its zero book — visible, never dropped.
    .sort(
      (a, b) =>
        (b.values.active_accounts ?? 0) - (a.values.active_accounts ?? 0) || a.amName.localeCompare(b.amName),
    )
    .map((r) => {
      const p = prevByAm.get(r.amName);
      const deltas = emptyDeltas();
      if (previous) {
        for (const m of AM_METRICS) {
          const versionChanged = !!m.versionSensitive && !!p && p.metricVersion !== r.metricVersion;
          deltas[m.key] = deltaFor(r.values[m.key], p ? p.values[m.key] : null, !!p, versionChanged);
        }
      }
      return { amName: r.amName, metricVersion: r.metricVersion, values: r.values, deltas };
    });

  let totalRow: AmRowView | null = null;
  if (latest) {
    const curTotals = companyTotal(latestRows);
    const deltas = emptyDeltas();
    if (previous) {
      const prevTotals = companyTotal(prevRows);
      const vChanged = versionOfDate.get(latest) !== versionOfDate.get(previous);
      for (const m of AM_METRICS) {
        deltas[m.key] = deltaFor(curTotals[m.key], prevTotals[m.key], true, !!m.versionSensitive && vChanged);
      }
    }
    totalRow = {
      amName: "COMPANY TOTAL",
      isTotal: true,
      metricVersion: versionOfDate.get(latest) ?? null,
      values: curTotals,
      deltas,
    };
  }

  // ---- series ----
  const companyPoints = emptyPoints();
  for (const d of dates) {
    const totals = companyTotal(byDate.get(d) ?? []);
    const v = versionOfDate.get(d) ?? 0;
    for (const m of AM_METRICS) companyPoints[m.key].push({ date: d, value: totals[m.key], metricVersion: v });
  }
  const companySeries: AmSeries | null = latest
    ? { amName: "COMPANY TOTAL", isTotal: true, points: companyPoints }
    : null;

  const rowByAmDate = new Map<string, AmSnapshotRow>();
  for (const r of rows) rowByAmDate.set(`${r.amName} ${r.date}`, r);

  // Per-AM detail follows the same order as the table above it.
  const orderedAmNames = amRows.length ? amRows.map((r) => r.amName) : amNames.slice().sort();
  const amSeries: AmSeries[] = orderedAmNames.map((name) => {
    const points = emptyPoints();
    for (const d of dates) {
      const r = rowByAmDate.get(`${name} ${d}`);
      const v = r ? r.metricVersion : (versionOfDate.get(d) ?? 0);
      for (const m of AM_METRICS) {
        // A day where this AM has no row is a genuine hole, not a zero.
        points[m.key].push({ date: d, value: r ? r.values[m.key] : null, metricVersion: v });
      }
    }
    return { amName: name, points };
  });

  return {
    dates,
    latest,
    previous,
    amRows,
    totalRow,
    companySeries,
    amSeries,
    versionBoundaries,
    amCount: amNames.length,
    sources: Array.from(new Set(rows.map((r) => r.source).filter(Boolean))).sort(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** dd/mm/yy — the house date format. Input is a `YYYY-MM-DD` snapshot_date, so
 *  it is reformatted as text rather than parsed into a Date and back out
 *  through a timezone that could move it a day. */
export function ddmmyy(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

/**
 * Postgres `timestamptz::text` ("2026-08-04 12:00:03.12+00") is not an ISO
 * string. V8 happens to parse it; the specification does not require that.
 * Normalise before trusting it.
 */
export function parsePgTimestamp(s: string | null | undefined): Date | null {
  if (!s) return null;
  let t = s.trim().replace(" ", "T");
  t = t.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const IST = "Asia/Kolkata";

/** "04/08/26 17:32" in IST — the timezone the cron and the team work in. */
export function ddmmyyHm(d: Date | null): string {
  if (!d) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function formatMetric(v: number | null, format: MetricFormat): string {
  // A blank churn percentage renders blank. Never 100, and never an em-dash
  // dressed up to look like a value.
  if (v === null || v === undefined) return "";
  if (format === "money") return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (format === "pct") return `${v.toFixed(1)}%`;
  return v.toLocaleString("en-US");
}

/** Signed delta text: "+3", "−12", "+1,204". */
export function formatDelta(diff: number, format: MetricFormat): string {
  const abs = Math.abs(diff);
  const body = format === "pct" ? `${abs.toFixed(1)}%` : abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${diff > 0 ? "+" : "−"}${body}`;
}

/** Is this delta good news, bad news, or neither? Colour only. */
export function deltaTone(diff: number, direction: Direction): "good" | "bad" | "flat" {
  if (diff === 0 || direction === "neutral") return "flat";
  const rising = diff > 0;
  return (direction === "up-good") === rising ? "good" : "bad";
}
