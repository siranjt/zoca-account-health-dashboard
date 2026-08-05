"use client";

// The Today table, promoted to a client island so it can sort and heat-map.
// The rest of /am-report stays server-rendered / zero-JS (see AmReport.tsx head):
// only this one interactive piece ships JS. All the earned rendering rules are
// preserved verbatim — NULL pct = empty cell, `def.`/`new` delta markers, the
// unassigned data-quality flag, the sticky first column, the company total pinned.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AM_METRICS,
  UNASSIGNED,
  ddmmyy,
  deltaTone,
  formatDelta,
  formatMetric,
  type AmRowView,
  type MetricDef,
  type MetricKey,
} from "@/lib/amMetrics";

// One drill-down sheet, as /api/am-report/detail returns it (the workbook's own
// model). Declared locally rather than imported from @/lib/amDetail, which is a
// server-only module — this island must not pull it into the client bundle.
type DrillCell = string | number | null;
interface DrillSheet {
  title: string;
  headers: string[];
  rows: DrillCell[][];
  totalRow: DrillCell[] | null;
  notes: string | null;
  seq: number;
}

// Which account-level sheet stands behind each metric. Metrics with no entry
// (active_accounts, mrr) describe the whole book and have no drill target.
const DRILL_SHEET: Partial<Record<MetricKey, string>> = {
  missed_payment_accounts: "Missed Payments",
  missed_payment_amount: "Missed Payments",
  churned_30d: "Churn 30d",
  churn_pct_30d: "Churn 30d",
  churned_mtd: "Churn 30d",
  churn_pct_mtd: "Churn 30d",
  retention_risk_tickets: "Retention Tickets",
  sched_provisioned: "Scheduling",
  sched_product_active: "Scheduling",
  sched_onboarded: "Scheduling",
  sched_incomplete: "Scheduling",
  untouched_human_30d: "Untouched (human)",
  untouched_all_30d: "Untouched (human)",
};

const PANEL: React.CSSProperties = { borderColor: "var(--cave-line)", background: "var(--cave-panel)" };
const STICKY_COL: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "var(--cave-panel)",
  borderRight: "1px solid var(--cave-line)",
};

// Metric groups — let the user collapse the 15-wide grid to one concern at a time.
type Group = "book" | "payments" | "churn" | "scheduling" | "touch";
const GROUP_OF: Record<MetricKey, Group> = {
  active_accounts: "book",
  mrr: "book",
  missed_payment_accounts: "payments",
  missed_payment_amount: "payments",
  churned_30d: "churn",
  churn_pct_30d: "churn",
  churned_mtd: "churn",
  churn_pct_mtd: "churn",
  retention_risk_tickets: "churn",
  sched_provisioned: "scheduling",
  sched_product_active: "scheduling",
  sched_onboarded: "scheduling",
  sched_incomplete: "scheduling",
  untouched_human_30d: "touch",
  untouched_all_30d: "touch",
};
const GROUPS: { key: Group | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "book", label: "Book" },
  { key: "payments", label: "Payments" },
  { key: "churn", label: "Churn & risk" },
  { key: "scheduling", label: "Scheduling" },
  { key: "touch", label: "Touch" },
];

type Delta = AmRowView["deltas"][MetricKey];

// A real, colourable movement — mirrors the fall-through branch in DeltaCell.
function isRealMove(d: Delta): boolean {
  return (
    !!d &&
    d.kind !== "none" &&
    d.kind !== "blank" &&
    d.kind !== "new" &&
    d.kind !== "version" &&
    d.kind !== "flat" &&
    d.diff !== null &&
    d.diff !== 0
  );
}

function DeltaCell({ row, m }: { row: AmRowView; m: MetricDef }) {
  const d = row.deltas[m.key];
  if (d.kind === "none" || d.kind === "blank")
    return <span aria-hidden className="opacity-0">·</span>;
  if (d.kind === "new")
    return <span style={{ color: "var(--cave-cy)" }} title="No row for this AM on the comparison day">new</span>;
  if (d.kind === "version")
    return (
      <span style={{ color: "var(--am-warn)" }} title="The definition of this metric changed between the two days. The step is a definition change, not movement — see Definitions.">
        def.
      </span>
    );
  const diff = d.diff;
  if (d.kind === "flat" || diff === null || diff === 0)
    return <span style={{ color: "var(--am-flat)" }} title="Unchanged">·</span>;
  const tone = deltaTone(diff, m.direction);
  const color = tone === "good" ? "var(--am-good)" : tone === "bad" ? "var(--am-bad)" : "var(--am-flat)";
  return (
    <span style={{ color }} title={`${formatDelta(diff, m.format)} vs the previous snapshot`}>
      {formatDelta(diff, m.format)}
    </span>
  );
}

// One cell in a drill-down sheet. Numbers are right-aligned tabular figures with
// locale grouping; a Linear/http value becomes a link; everything else is text.
function DrillCellView({ value }: { value: DrillCell }) {
  if (typeof value === "number") {
    return <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--cave-txt)" }}>{value.toLocaleString()}</td>;
  }
  const s = value == null ? "" : String(value);
  if (/^https?:\/\//.test(s)) {
    return (
      <td className="whitespace-nowrap px-2 py-1.5">
        <a href={s} target="_blank" rel="noreferrer noopener" className="underline" style={{ color: "var(--cave-cy)" }}>
          open ↗
        </a>
      </td>
    );
  }
  return <td className="whitespace-nowrap px-2 py-1.5" style={{ color: s ? "var(--cave-txt)" : "var(--cave-dim)" }}>{s}</td>;
}

export default function AmTodayTable({
  amRows,
  totalRow,
  latest,
  previous,
}: {
  amRows: AmRowView[];
  totalRow: AmRowView | null;
  latest: string;
  previous: string | null;
}) {
  const [sort, setSort] = useState<{ key: MetricKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  const [focus, setFocus] = useState<Group | "all">("all");

  // Drill-down: which sheet is open and (optionally) scoped to one AM. The detail
  // is fetched lazily the first time a cell is clicked, so the page stays light
  // for anyone who never drills in.
  const [drill, setDrill] = useState<{ sheet: string; am: string | null } | null>(null);
  const [detail, setDetail] = useState<DrillSheet[] | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");

  const ensureDetail = useCallback(async () => {
    if (detail || detailStatus === "loading") return;
    setDetailStatus("loading");
    try {
      const r = await fetch("/api/am-report/detail");
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { sheets?: DrillSheet[] };
      setDetail(d.sheets ?? []);
      setDetailStatus("idle");
    } catch {
      setDetailStatus("error");
    }
  }, [detail, detailStatus]);

  function openDrill(sheet: string, am: string | null) {
    void ensureDetail();
    setDrill({ sheet, am });
  }

  // Escape closes the panel — the expected way out of a disclosed layer.
  useEffect(() => {
    if (!drill) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrill(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drill]);

  // Columns to DISPLAY (heat scale + movers still use the full set below).
  const shown = focus === "all" ? AM_METRICS : AM_METRICS.filter((m) => GROUP_OF[m.key] === focus);

  // Per-metric value range over REAL AMs (unassigned excluded so its data-quality
  // extremes don't wash out the colour scale for everyone else).
  const ranges = useMemo(() => {
    const r: Partial<Record<MetricKey, { min: number; max: number }>> = {};
    for (const m of AM_METRICS) {
      const vals = amRows
        .filter((x) => x.amName !== UNASSIGNED)
        .map((x) => x.values[m.key])
        .filter((v): v is number => v !== null);
      if (vals.length) r[m.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return r;
  }, [amRows]);

  const sortedAms = useMemo(() => {
    if (!sort.key) return amRows;
    const k = sort.key;
    return [...amRows].sort((a, b) => {
      const av = a.values[k], bv = b.values[k];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last, both directions
      if (bv === null) return -1;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [amRows, sort]);

  const rows = totalRow ? [totalRow, ...sortedAms] : sortedAms;

  // Biggest movers today — normalise |diff| by each column's spread so a move in
  // any metric competes fairly; skip the unassigned data-quality row.
  const movers = useMemo(() => {
    const items: { am: string; m: MetricDef; diff: number; tone: "good" | "bad"; sig: number }[] = [];
    for (const row of amRows) {
      if (row.amName === UNASSIGNED) continue;
      for (const m of AM_METRICS) {
        const d = row.deltas[m.key];
        if (!isRealMove(d) || d.diff === null) continue;
        const tone = deltaTone(d.diff, m.direction);
        if (tone !== "good" && tone !== "bad") continue;
        const rg = ranges[m.key];
        const scale = rg ? Math.max(1, rg.max - rg.min) : Math.max(1, Math.abs(d.diff));
        items.push({ am: row.amName, m, diff: d.diff, tone, sig: Math.abs(d.diff) / scale });
      }
    }
    return items.sort((a, b) => b.sig - a.sig).slice(0, 6);
  }, [amRows, ranges]);

  function toggleSort(k: MetricKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: "desc" }));
  }

  function heatBg(m: MetricDef, v: number | null, isTotal: boolean): string | undefined {
    if (isTotal || v === null || m.direction === "neutral") return undefined;
    const rg = ranges[m.key];
    if (!rg || rg.max === rg.min) return undefined;
    const t = Math.max(0, Math.min(1, (v - rg.min) / (rg.max - rg.min)));
    const good = m.direction === "up-good" ? t : 1 - t; // 1 good, 0 bad
    const dev = good - 0.5;
    if (Math.abs(dev) < 0.12) return undefined; // middle band → no tint, keeps it calm
    const pct = Math.round((Math.min(0.5, Math.abs(dev)) / 0.5) * 22); // up to ~22% into the panel
    const tone = dev > 0 ? "var(--am-good)" : "var(--am-bad)";
    return `color-mix(in srgb, ${tone} ${pct}%, var(--cave-panel))`;
  }

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
            Today · {ddmmyy(latest)}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            One row per AM · the small figure under each value is the change against{" "}
            {previous ? <b>{ddmmyy(previous)}</b> : <span>the previous snapshot (none yet)</span>}. Cells are shaded
            green/red by whether the value is good or bad; <b>click a column header to sort</b>, or{" "}
            <b>click an underlined value to see the accounts behind it</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/am-report/export"
            className="rounded border px-2 py-1 text-[11px] no-underline transition-colors hover:text-slate-200"
            style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
            title="Download the full report as a formatted Excel workbook — Summary, the account-level detail sheets, and Definitions"
          >
            ⇩ Export Excel
          </a>
          <a href="#definitions" className="text-[11px] underline" style={{ color: "var(--cave-cy)" }}>
            Metric definitions ↓
          </a>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Focus</span>
        {GROUPS.map((g) => {
          const active = focus === g.key;
          return (
            <button
              key={g.key}
              onClick={() => setFocus(g.key)}
              className="rounded-full border px-2.5 py-0.5 text-[10.5px] transition-colors"
              style={{
                borderColor: active ? "var(--cave-cy)" : "var(--cave-line)",
                color: active ? "var(--cave-cy)" : "var(--cave-dim)",
                background: active ? "color-mix(in srgb, var(--cave-cy) 12%, transparent)" : "transparent",
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {movers.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Biggest movers today</span>
          {movers.map((mv, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]"
              style={{
                color: mv.tone === "good" ? "var(--am-good)" : "var(--am-bad)",
                border: `1px solid ${mv.tone === "good" ? "var(--am-good)" : "var(--am-bad)"}`,
                background: `color-mix(in srgb, ${mv.tone === "good" ? "var(--am-good)" : "var(--am-bad)"} 12%, transparent)`,
              }}
              title={`${mv.am} · ${mv.m.label}: ${formatDelta(mv.diff, mv.m.format)} vs previous`}
            >
              <b style={{ color: "var(--cave-txt)" }}>{mv.am.split(" ")[0]}</b> {mv.m.short} {formatDelta(mv.diff, mv.m.format)}
            </span>
          ))}
        </div>
      )}

      <div className="table-scroll -mx-1">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-[3] text-left uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-semibold" style={{ ...STICKY_COL, top: 0, zIndex: 4, background: "var(--cave-panel2)" }}>
                Account manager
              </th>
              {shown.map((m) => {
                const active = sort.key === m.key;
                return (
                  <th
                    key={m.key}
                    onClick={() => toggleSort(m.key)}
                    title={`${m.tooltip} — click to sort`}
                    className="cursor-pointer select-none whitespace-nowrap px-2 py-1.5 text-right align-bottom font-semibold hover:text-slate-200"
                    style={{ background: "var(--cave-panel2)", color: active ? "var(--cave-cy)" : undefined }}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {m.label}
                      {m.versionSensitive && <sup style={{ color: "var(--am-warn)" }}>†</sup>}
                      <span className="w-2 text-[9px]">{active ? (sort.dir === "desc" ? "▼" : "▲") : ""}</span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unassigned = r.amName === UNASSIGNED;
              const rowBg = r.isTotal ? "var(--cave-panel2)" : "var(--cave-panel)";
              return (
                <tr key={r.amName} className="border-t border-slate-100" style={r.isTotal ? { borderBottom: "2px solid var(--cave-line2)" } : undefined}>
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
                  {shown.map((m) => {
                    const v = r.values[m.key];
                    const bg = heatBg(m, v, !!r.isTotal) ?? rowBg;
                    const sheetTitle = DRILL_SHEET[m.key];
                    // Drillable when this metric has an account list and the cell
                    // holds a value: the total row opens the whole company list,
                    // an AM row opens that AM's slice.
                    const drillable = !!sheetTitle && v !== null;
                    const scope = r.isTotal ? null : r.amName;
                    const num =
                      v === null ? <span aria-hidden className="opacity-0">·</span> : formatMetric(v, m.format);
                    return (
                      <td
                        key={m.key}
                        className="px-2 py-1.5 text-right align-top tabular-nums"
                        style={{ background: bg }}
                        title={
                          v === null && m.format === "pct"
                            ? `${r.amName} holds no live book, so this percentage is not computed. A rate on an empty denominator would print as 100% and read as an accusation.`
                            : undefined
                        }
                      >
                        {drillable ? (
                          <button
                            type="button"
                            onClick={() => openDrill(sheetTitle!, scope)}
                            className={`w-full cursor-pointer text-right underline decoration-dotted decoration-slate-500 underline-offset-2 outline-none transition-colors hover:decoration-solid focus-visible:decoration-solid ${r.isTotal ? "font-bold" : ""}`}
                            style={{ color: "var(--cave-txt)" }}
                            title={`View the ${sheetTitle} accounts behind this${scope ? ` for ${scope}` : " (whole company)"}`}
                            aria-label={`View ${sheetTitle} accounts behind ${m.label}${scope ? ` for ${scope}` : ", whole company"}`}
                          >
                            {num}
                          </button>
                        ) : (
                          <div className={r.isTotal ? "font-bold" : ""} style={{ color: "var(--cave-txt)" }}>
                            {num}
                          </div>
                        )}
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

      {drill &&
        (() => {
          const sheet = detail?.find((s) => s.title === drill.sheet) ?? null;
          const amCol = sheet ? sheet.headers.indexOf("AM") : -1;
          const scoped =
            sheet && drill.am && amCol >= 0
              ? sheet.rows.filter((row) => String(row[amCol]) === drill.am)
              : (sheet?.rows ?? []);
          return (
            <div
              className="am-drill mt-3 rounded-lg border"
              style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel2)" }}
              role="region"
              aria-label={`${drill.sheet} accounts`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--cave-line)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cave-cy)" }}>
                    {drill.sheet}
                  </span>
                  {drill.am ? (
                    <button
                      type="button"
                      onClick={() => setDrill({ sheet: drill.sheet, am: null })}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]"
                      style={{ borderColor: "var(--cave-cy)", color: "var(--cave-cy)", background: "color-mix(in srgb, var(--cave-cy) 12%, transparent)" }}
                      title="Clear the AM filter — show the whole company"
                    >
                      {drill.am} <span aria-hidden>✕</span>
                    </button>
                  ) : (
                    <span className="text-[10.5px] text-slate-400">whole company</span>
                  )}
                  {sheet && <span className="text-[10.5px] text-slate-400">· {scoped.length} account{scoped.length === 1 ? "" : "s"}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setDrill(null)}
                  className="rounded px-2 py-0.5 text-xs text-slate-400 outline-none transition-colors hover:text-slate-200 focus-visible:text-slate-200"
                  aria-label="Close accounts panel"
                  title="Close (Esc)"
                >
                  ✕ Close
                </button>
              </div>

              {detailStatus === "loading" && !sheet && (
                <div className="px-3 py-6 text-center text-xs text-slate-400">Loading accounts…</div>
              )}
              {detailStatus === "error" && !sheet && (
                <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-6 text-center text-xs" style={{ color: "var(--am-bad)" }}>
                  Couldn’t load the account detail.
                  <button
                    type="button"
                    onClick={() => {
                      setDetailStatus("idle");
                      void ensureDetail();
                    }}
                    className="rounded border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {detail && !sheet && detailStatus !== "loading" && (
                <div className="px-3 py-6 text-center text-xs text-slate-400">
                  No <b>{drill.sheet}</b> detail for this day yet — the workbook writes it after the 17:30 run.
                </div>
              )}
              {sheet && scoped.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-slate-400">
                  No accounts{drill.am ? <> for <b>{drill.am}</b></> : ""} on this sheet — nothing to action here.
                </div>
              )}

              {sheet && scoped.length > 0 && (
                <div className="px-3 pb-3">
                  {sheet.notes && <p className="py-2 text-[10.5px] italic text-slate-500">{sheet.notes}</p>}
                  <div className="drill-scroll max-h-[26rem] overflow-auto rounded border" style={{ borderColor: "var(--cave-line)" }}>
                    <table className="w-full border-collapse text-[11px]">
                      <thead className="sticky top-0 z-[2]">
                        <tr>
                          {sheet.headers.map((h, i) => (
                            <th
                              key={i}
                              className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-white"
                              style={{ background: "var(--cave-hdr, #1f2937)" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scoped.map((row, ri) => (
                          <tr key={ri} className="border-t" style={{ borderColor: "var(--cave-line)" }}>
                            {row.map((cell, ci) => (
                              <DrillCellView key={ci} value={cell} />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {!drill.am && sheet.totalRow && (
                        <tfoot>
                          <tr style={{ background: "var(--cave-panel)", borderTop: "2px solid var(--cave-line2)" }}>
                            {sheet.totalRow.map((cell, ci) => (
                              <td
                                key={ci}
                                className={`whitespace-nowrap px-2 py-1.5 font-bold tabular-nums ${typeof cell === "number" ? "text-right" : "text-left"}`}
                                style={{ color: "var(--cave-txt)" }}
                              >
                                {typeof cell === "number" ? cell.toLocaleString() : (cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      <p className="mt-2 text-[10px] text-slate-500">
        Blank cell = no value, by design: churn % is left blank when the AM holds no live book, because a percentage on
        an empty denominator is arithmetic, not performance. <span style={{ color: "var(--am-warn)" }}>def.</span> = the
        metric&apos;s definition changed between the two days, so no delta is claimed.{" "}
        <span style={{ color: "var(--cave-cy)" }}>new</span> = the AM had no row on the comparison day. Cell shading:
        greener = better, redder = worse for that metric across AMs.
      </p>
    </div>
  );
}
