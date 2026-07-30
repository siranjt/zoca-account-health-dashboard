"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  entityId: string;
  name: string | null;
  amName: string | null;
  state: string | null;
  mrr: number | null;
  healthTier: string | null;
  lastLead: string | null;
  neverHadLead: boolean;
  leadsMasked: boolean;
  droughtDays: number;
};

const THRESHOLDS = [3, 7, 14, 30];

function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function tierBadge(tier: string | null) {
  const t = (tier || "").toUpperCase();
  const color = t.includes("CRITICAL") ? "#dc2626" : t.includes("RISK") ? "#d97706" : t.includes("MONITOR") ? "#ca8a04" : t.includes("HEALTHY") ? "#16a34a" : "#94a3b8";
  const label = t.split(" ")[0] || "—";
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color, background: `${color}1a` }}>{label || "—"}</span>;
}

export default function LeadDroughtViewer() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(3);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/lead-droughts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setRows(d?.rows ?? []); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of THRESHOLDS) m[t] = (rows ?? []).filter((r) => r.droughtDays >= t).length;
    return m;
  }, [rows]);

  const view = useMemo(() => (rows ?? []).filter((r) => r.droughtDays >= days), [rows, days]);
  const maskedInView = view.filter((r) => r.leadsMasked).length;

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading lead droughts…</div>;

  return (
    <div>
      {/* threshold toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">No leads for</span>
        {THRESHOLDS.map((t) => {
          const active = days === t;
          return (
            <button
              key={t}
              onClick={() => setDays(t)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors"
              style={active
                ? { borderColor: "#22d3ee", color: "#22d3ee", background: "rgba(34,211,238,.10)" }
                : { borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
            >
              ≥ {t} days <span className="ml-1 opacity-70">({counts[t] ?? 0})</span>
            </button>
          );
        })}
        <a
          href={`/api/admin/lead-droughts?format=csv&days=${days}`}
          className="ml-auto rounded border px-2 py-1.5 text-[11px] font-medium no-underline"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >⭳ CSV</a>
      </div>

      <div className="mb-2 text-sm text-slate-400">
        <b className="text-slate-700">{view.length}</b> account{view.length === 1 ? "" : "s"} with no incoming leads for {days}+ days
        {maskedInView > 0 && <span className="ml-2 text-amber-600">· {maskedInView} have leads masked (dry by design)</span>}
      </div>

      {view.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No accounts dry for {days}+ days.</div>
      ) : (
        <div className="table-scroll -mx-1 max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Account</th>
                <th className="px-2 py-2 font-semibold">Account manager</th>
                <th className="px-2 py-2 font-semibold">State</th>
                <th className="px-2 py-2 text-right font-semibold">Days dry</th>
                <th className="px-2 py-2 font-semibold">Last lead</th>
                <th className="px-2 py-2 text-right font-semibold">MRR</th>
                <th className="px-2 py-2 font-semibold">Health</th>
                <th className="px-2 py-2 font-semibold">Leads</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.entityId} className="border-t border-slate-100">
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-slate-700">{r.name || "(unnamed)"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{r.amName || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500">{r.state || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700">
                    {r.droughtDays}{r.neverHadLead && <span className="ml-1 text-[10px] font-normal text-slate-400">(never)</span>}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.neverHadLead ? "never" : ddmmyy(r.lastLead)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.mrr != null ? `$${Math.round(r.mrr).toLocaleString()}` : "—"}</td>
                  <td className="px-2 py-1.5">{tierBadge(r.healthTier)}</td>
                  <td className="px-2 py-1.5">
                    {r.leadsMasked
                      ? <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700" style={{ background: "rgba(217,119,6,.12)" }}>🔒 masked</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
