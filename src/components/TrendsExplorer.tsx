"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MultiLineChart } from "@/components/Charts";
import { Sparkline } from "@/components/Sparkline";
import { VIZ } from "@/lib/theme";

const METRICS: { key: string; label: string; color: string }[] = [
  { key: "total_mrr", label: "Total MRR", color: "#4A7C59" },
  { key: "reds", label: "At-risk accounts", color: "#dc2626" },
  { key: "yellows", label: "Monitor accounts", color: "#d97706" },
  { key: "greens", label: "Healthy accounts", color: "#16a34a" },
  { key: "avg_composite", label: "Avg composite", color: VIZ.series[0] },
  { key: "total_leads", label: "Total leads", color: VIZ.series[1] },
  { key: "total_reviews", label: "Total reviews", color: VIZ.series[2] },
  { key: "total_tickets", label: "Open tickets", color: VIZ.series[3] },
  { key: "accounts", label: "Accounts in book", color: VIZ.series[0] },
];

type AcctTrend = { entityId: string; name: string; am: string; latest: number; prev: number; delta: number; tier: string; spark: number[] };
type Trajectory = { d: string; avg: number; green: number; yellow: number; red: number; n: number };
type HealthPayload = { configured: boolean; days: string[]; lookbackWeeks: number; trajectory: Trajectory[]; accounts: AcctTrend[]; decliners: number; scopedAccounts: number };

const LOOKBACKS = [4, 8, 12];
const tierHex = (t: string) => { const T = t.toUpperCase(); if (T.startsWith("HEALTHY") || T.startsWith("THRIVING")) return "#16a34a"; if (T.startsWith("MONITOR")) return "#d97706"; return "#dc2626"; };
const ddmm = (iso: string) => { const p = iso.slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : iso; };

export default function TrendsExplorer() {
  const [view, setView] = useState<"book" | "health">("book");

  // ── Book metrics (existing) ──
  const [series, setSeries] = useState<Record<string, unknown>[] | null>(null);
  const [metric, setMetric] = useState("total_mrr");
  useEffect(() => {
    fetch("/api/trends", { cache: "no-store" }).then((r) => r.json()).then((j) => setSeries(j.series || [])).catch(() => setSeries([]));
  }, []);
  const m = METRICS.find((x) => x.key === metric)!;
  const chart = useMemo(() => {
    const s = series ?? [];
    return { xLabels: s.map((r) => String(r.d)), values: s.map((r) => Number(r[metric] ?? 0)) };
  }, [series, metric]);

  // ── Account health over time (new) ──
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [lookback, setLookback] = useState(4);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (view !== "health") return;
    setHealth(null);
    fetch(`/api/health-history?lookback=${lookback}`, { cache: "no-store" }).then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, [view, lookback]);
  const filtered = useMemo(() => {
    const list = health?.accounts ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((a) => a.name.toLowerCase().includes(t) || a.am.toLowerCase().includes(t));
  }, [health, q]);
  const traj = useMemo(() => {
    const t = health?.trajectory ?? [];
    return { xLabels: t.map((p) => ddmm(p.d)), avg: t.map((p) => p.avg), red: t.map((p) => p.red) };
  }, [health]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Explore</div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Trends</h1>

      {/* view tabs */}
      <div className="mb-4 inline-flex overflow-hidden rounded-md border border-slate-300">
        {(["book", "health"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 text-sm font-medium ${view === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
            {v === "book" ? "Book metrics" : "Account health over time"}
          </button>
        ))}
      </div>

      {view === "book" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
              {METRICS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
            {series == null ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
            ) : series.length < 2 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                {series.length === 0 ? "No snapshots yet." : `1 snapshot captured (${series[0].d}).`} A book snapshot is taken automatically each day — this chart fills in as history accrues.
              </div>
            ) : (
              <>
                <div className="mb-2 text-sm font-semibold text-slate-700">{m.label} · {series.length} days</div>
                <MultiLineChart xLabels={chart.xLabels} series={[{ name: m.label, color: m.color, values: chart.values }]} />
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {health == null ? (
            <div className="rounded-xl border p-4 py-16 text-center text-sm text-slate-400" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>Loading health history…</div>
          ) : !health.configured || !health.days.length ? (
            <div className="rounded-xl border p-4 py-16 text-center text-sm text-slate-400" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>Health history source unavailable right now.</div>
          ) : (
            <>
              {/* book health trajectory */}
              <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
                <div className="mb-2 text-sm font-semibold text-slate-700">
                  Book health trajectory <span className="font-normal text-slate-400">· avg composite &amp; at-risk count over {health.days.length} weeks · {health.scopedAccounts} accounts</span>
                </div>
                <MultiLineChart
                  xLabels={traj.xLabels}
                  series={[
                    { name: "Avg composite", color: VIZ.series[0], values: traj.avg },
                    { name: "At-risk accounts", color: "#dc2626", values: traj.red },
                  ]}
                />
              </div>

              {/* all accounts — searchable, sorted biggest-drop first */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">Account health</span>
                  <span className="text-xs text-slate-400">— all accounts, biggest drop over the last</span>
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                    {LOOKBACKS.map((w) => (
                      <button key={w} onClick={() => setLookback(w)} className={`px-2 py-0.5 text-xs font-medium ${lookback === w ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{w}w</button>
                    ))}
                  </div>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search account or AM…"
                    className="w-56 rounded border border-slate-300 bg-white px-2 py-1 text-[12px] outline-none focus:border-slate-400"
                  />
                  {q && <button onClick={() => setQ("")} className="text-[11px] text-slate-400 hover:text-slate-600">clear</button>}
                  <span className="ml-auto text-xs text-slate-400">{filtered.length} of {health.accounts.length} · {health.decliners} sliding</span>
                </div>
                {filtered.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No account matches “{q}”.</div>
                ) : (
                  <div className="table-scroll -mx-1 max-h-[620px] overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-2 py-1.5 font-semibold">Account</th>
                          <th className="px-2 py-1.5 font-semibold">AM</th>
                          <th className="px-2 py-1.5 font-semibold">Trend</th>
                          <th className="px-2 py-1.5 text-right font-semibold">{lookback}w ago</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Now</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Δ</th>
                          <th className="px-2 py-1.5 font-semibold">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((d) => {
                          const dc = d.delta < 0 ? "#dc2626" : d.delta > 0 ? "#16a34a" : "#94a3b8";
                          return (
                            <tr key={d.entityId} className="border-t border-slate-100">
                              <td className="px-2 py-1.5">
                                <Link href={`/account/${d.entityId}`} className="font-medium text-slate-800 no-underline hover:text-indigo-600">{d.name}</Link>
                              </td>
                              <td className="px-2 py-1.5 text-slate-500">{d.am || "—"}</td>
                              <td className="px-2 py-1.5"><Sparkline data={d.spark} color={dc} width={90} height={22} /></td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{d.prev.toFixed(1)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{d.latest.toFixed(1)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: dc }}>{d.delta < 0 ? "▼" : d.delta > 0 ? "▲" : ""} {Math.abs(d.delta).toFixed(1)}</td>
                              <td className="px-2 py-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: tierHex(d.tier), background: `${tierHex(d.tier)}1a` }}>{d.tier}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-2 text-[11px] text-slate-400">Weekly warehouse health snapshots · sorted by biggest recent drop. A falling line is an account sliding <em>before</em> it churns — the signal a static red list can&apos;t give you. Search finds any account.</div>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
