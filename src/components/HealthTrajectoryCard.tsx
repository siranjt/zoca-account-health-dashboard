"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCard, MultiLineChart } from "./Charts";
import { VIZ } from "@/lib/theme";

// This account's weekly composite-health history — so an AM sees the trajectory
// (is it sliding or recovering?) on the same page they act from, not just the
// current snapshot. Data: the warehouse health-history feed (/api/health-history),
// scoped to the viewer.
type Point = { d: string; c: number; tier: string };

const ddmm = (iso: string) => { const p = iso.slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : iso; };
const tierHex = (t: string) => { const T = t.toUpperCase(); if (T.startsWith("HEALTHY") || T.startsWith("THRIVING")) return "#16a34a"; if (T.startsWith("MONITOR")) return "#d97706"; return "#dc2626"; };

export default function HealthTrajectoryCard({ entityId }: { entityId: string }) {
  const [pts, setPts] = useState<Point[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading"); setPts(null);
    fetch(`/api/health-history?entity=${entityId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (!alive) return; const p = (d.points || []) as Point[]; setPts(p); setState(p.length >= 2 ? "ok" : "empty"); })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [entityId]);

  const view = useMemo(() => { const p = pts ?? []; return { x: p.map((q) => ddmm(q.d)), c: p.map((q) => q.c) }; }, [pts]);
  const latest = pts?.length ? pts[pts.length - 1] : null;
  const first = pts?.length ? pts[0] : null;
  const delta = latest && first ? Math.round((latest.c - first.c) * 10) / 10 : null;

  const sub = latest
    ? `weekly composite · now ${latest.c.toFixed(1)}${delta != null ? ` · ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} over ${pts!.length} weeks` : ""}`
    : "weekly composite health score";

  return (
    <ChartCard title="Health trajectory" subtitle={sub}>
      {state === "loading" ? (
        <div className="py-10 text-center text-xs text-slate-400">Loading…</div>
      ) : state === "error" ? (
        <div className="py-10 text-center text-xs text-slate-400">Health history unavailable.</div>
      ) : state === "empty" ? (
        <div className="py-10 text-center text-xs text-slate-400">Not enough history yet for a trend.</div>
      ) : (
        <MultiLineChart xLabels={view.x} series={[{ name: "Composite", color: VIZ.series[0], values: view.c }]} />
      )}
    </ChartCard>
  );
}
