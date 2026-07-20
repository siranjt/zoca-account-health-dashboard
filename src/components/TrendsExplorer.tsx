"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiLineChart } from "@/components/Charts";
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

export default function TrendsExplorer() {
  const [series, setSeries] = useState<Record<string, unknown>[] | null>(null);
  const [metric, setMetric] = useState("total_mrr");

  useEffect(() => {
    fetch("/api/trends", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSeries(j.series || []))
      .catch(() => setSeries([]));
  }, []);

  const m = METRICS.find((x) => x.key === metric)!;
  const chart = useMemo(() => {
    const s = series ?? [];
    return { xLabels: s.map((r) => String(r.d)), values: s.map((r) => Number(r[metric] ?? 0)) };
  }, [series, metric]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Explore</div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Trends</h1>

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
      <div className="mt-3 text-xs text-slate-400">
        Snapshots are stored daily in the isolated <code>alfred.book_daily</code> table. Pair this with the Overview → Activity feed to see per-account changes.
      </div>
    </main>
  );
}
