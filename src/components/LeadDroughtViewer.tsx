"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  entityId: string;
  name: string | null;
  amName: string | null;
  location: string | null;
  mrr: number | null;
  healthTier: string | null;
  lastLead: string | null;
  neverHadLead: boolean;
  leadsMasked: boolean;
  droughtDays: number;
};

const THRESHOLDS = [3, 7, 14, 30];
// Exclusive bands: each threshold covers [t, nextThreshold) — the last is open-ended.
const upperOf = (t: number) => {
  const i = THRESHOLDS.indexOf(t);
  return i >= 0 && i < THRESHOLDS.length - 1 ? THRESHOLDS[i + 1] : Infinity;
};
const bandLabel = (t: number) => {
  const u = upperOf(t);
  return u === Infinity ? `${t}+ days` : `${t}–${u - 1} days`;
};

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

const TIER_ORDER = ["Critical", "At-risk", "Monitor", "Healthy", "Other"];
function tierGroup(tier: string | null): string {
  const t = (tier || "").toUpperCase();
  if (t.includes("CRITICAL")) return "Critical";
  if (t.includes("RISK")) return "At-risk";
  if (t.includes("MONITOR")) return "Monitor";
  if (t.includes("HEALTHY")) return "Healthy";
  return "Other";
}

export default function LeadDroughtViewer() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(3);
  const [am, setAm] = useState("");
  const [health, setHealth] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/lead-droughts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setRows(d?.rows ?? []); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const amOptions = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.amName).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const healthOptions = useMemo(() => {
    const present = new Set((rows ?? []).map((r) => tierGroup(r.healthTier)));
    return TIER_ORDER.filter((g) => present.has(g));
  }, [rows]);

  // AM + health filters apply before the day-band split, so the band counts and
  // the table both reflect the current AM/health selection.
  const base = useMemo(
    () => (rows ?? []).filter((r) => (am === "" || r.amName === am) && (health === "" || tierGroup(r.healthTier) === health)),
    [rows, am, health],
  );

  const counts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of THRESHOLDS) { const u = upperOf(t); m[t] = base.filter((r) => r.droughtDays >= t && r.droughtDays < u).length; }
    return m;
  }, [base]);

  const view = useMemo(() => {
    const u = upperOf(days);
    return base.filter((r) => r.droughtDays >= days && r.droughtDays < u);
  }, [base, days]);
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
              {bandLabel(t)} <span className="ml-1 opacity-70">({counts[t] ?? 0})</span>
            </button>
          );
        })}
        <select
          value={am}
          onChange={(e) => setAm(e.target.value)}
          title="Filter by account manager"
          className="ml-1 max-w-[180px] rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >
          <option value="">All AMs ({amOptions.length})</option>
          {amOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={health}
          onChange={(e) => setHealth(e.target.value)}
          title="Filter by health"
          className="rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >
          <option value="">All health</option>
          {healthOptions.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        {(am || health) && (
          <button onClick={() => { setAm(""); setHealth(""); }} className="text-[11px] text-slate-400 hover:text-slate-600" title="Clear filters">clear</button>
        )}
        <a
          href={`/api/admin/lead-droughts?format=csv&days=${days}${am ? `&am=${encodeURIComponent(am)}` : ""}${health ? `&health=${encodeURIComponent(health)}` : ""}`}
          className="ml-auto rounded border px-2 py-1.5 text-[11px] font-medium no-underline"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >⭳ CSV</a>
      </div>

      <div className="mb-2 text-sm text-slate-400">
        <b className="text-slate-700">{view.length}</b> account{view.length === 1 ? "" : "s"} with no incoming leads for {bandLabel(days)}
        {maskedInView > 0 && <span className="ml-2 text-amber-600">· {maskedInView} have leads masked (dry by design)</span>}
      </div>

      {view.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No accounts dry {bandLabel(days)}.</div>
      ) : (
        <div className="table-scroll -mx-1 max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Account</th>
                <th className="px-2 py-2 font-semibold">Account manager</th>
                <th className="px-2 py-2 font-semibold">Location</th>
                <th className="px-2 py-2 text-right font-semibold">Days dry</th>
                <th className="px-2 py-2 font-semibold">Last lead</th>
                <th className="px-2 py-2 text-right font-semibold">MRR</th>
                <th className="px-2 py-2 font-semibold">Health</th>
                <th className="px-2 py-2 font-semibold">Lead masking</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.entityId} className="border-t border-slate-100">
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-slate-700">{r.name || "(unnamed)"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{r.amName || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500">{r.location || "—"}</td>
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
