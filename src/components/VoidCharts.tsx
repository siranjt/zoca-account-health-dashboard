"use client";

import { useMemo } from "react";

// Hand-built SVG charts for Void (no chart library — CAVE//OS convention),
// matching the Miss Payment Beacon: Outstanding by AM (top-10 horizontal bars),
// Outstanding by month (vertical bars), Aging buckets (vertical bars by COUNT),
// Subscription status (horizontal bars by COUNT). All computed from the passed
// rows (the current filtered slice), so they move with the filters.

type Row = {
  amName: string | null; amountDue: number | null; invoiceMonth: string | null;
  daysOverdue: number | null; subStatus: string | null;
};

const usdK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);

function Card({ title, pill, pillColor, children }: { title: string; pill: string; pillColor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: pillColor, background: `${pillColor}1a` }}>{pill}</span>
      </div>
      {children}
    </div>
  );
}
function Empty() { return <div className="py-10 text-center text-[11px] text-slate-400">No data</div>; }

export default function VoidCharts({ rows }: { rows: Row[] }) {
  const byAm = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = r.amName || "(unassigned)"; m.set(k, (m.get(k) || 0) + (r.amountDue || 0)); }
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.invoiceMonth) m.set(r.invoiceMonth, (m.get(r.invoiceMonth) || 0) + (r.amountDue || 0));
    return [...m.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  }, [rows]);
  const aging = useMemo(() => {
    const defs = [{ k: "0-30d", lo: 0, hi: 30, c: "#4a7c59" }, { k: "31-60d", lo: 31, hi: 60, c: "#d9a441" }, { k: "61-90d", lo: 61, hi: 90, c: "#ea580c" }, { k: "90d+", lo: 91, hi: Infinity, c: "#c0392b" }];
    return defs.map((b) => ({ k: b.k, c: b.c, n: rows.filter((r) => r.daysOverdue != null && r.daysOverdue >= b.lo && r.daysOverdue <= b.hi).length }));
  }, [rows]);
  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = r.subStatus || "unknown"; m.set(k, (m.get(k) || 0) + 1); }
    const COLOR: Record<string, string> = { active: "#4a7c59", non_renewing: "#c0392b", cancelled: "#7a1f1f", paused: "#0369a1", unknown: "#94a3b8" };
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v, c: COLOR[k] || "#94a3b8" }));
  }, [rows]);

  // ---- geometry ----
  const W = 480, H = 210;
  const amMax = niceMax(Math.max(1, ...byAm.map(([, v]) => v)));
  const monMax = niceMax(Math.max(1, ...byMonth.map(([, v]) => v)));
  const ageMax = niceMax(Math.max(1, ...aging.map((a) => a.n)));
  const statMax = niceMax(Math.max(1, ...byStatus.map((s) => s.v)));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* Outstanding by AM — horizontal bars */}
      <Card title="Outstanding by AM" pill="Top 10" pillColor="#b45309">
        {byAm.length === 0 ? <Empty /> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
            <defs><linearGradient id="amGrad" x1="0" x2="1"><stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#dc2626" /></linearGradient></defs>
            {ticks(amMax).map((t, i) => { const x = 96 + (t / amMax) * (W - 106); return (<g key={i}><line x1={x} x2={x} y1={6} y2={H - 18} stroke="var(--cave-line)" strokeDasharray="2 3" /><text x={x} y={H - 6} textAnchor="middle" fontSize={8} fill="#94a3b8">{usdK(t)}</text></g>); })}
            {byAm.map(([k, v], i) => { const bh = (H - 30) / byAm.length, y = 6 + i * bh; return (<g key={k}><text x={92} y={y + bh / 2 + 3} textAnchor="end" fontSize={8} fill="#64748b">{k.length > 14 ? k.slice(0, 13) + "…" : k}</text><rect x={96} y={y + bh * 0.15} width={Math.max(1, (v / amMax) * (W - 106))} height={bh * 0.7} rx={2} fill="url(#amGrad)" /></g>); })}
          </svg>
        )}
      </Card>

      {/* Outstanding by month — vertical bars */}
      <Card title="Outstanding by month" pill="Visible" pillColor="#0369a1">
        {byMonth.length === 0 ? <Empty /> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
            {ticks(monMax).map((t, i) => { const y = (H - 26) - (t / monMax) * (H - 40); return (<g key={i}><line x1={38} x2={W - 8} y1={y} y2={y} stroke="var(--cave-line)" strokeDasharray="2 3" /><text x={34} y={y + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{usdK(t)}</text></g>); })}
            {byMonth.map(([k, v], i) => { const bw = (W - 46) / byMonth.length, x = 38 + i * bw, h = (v / monMax) * (H - 40); return (<g key={k}><rect x={x + bw * 0.2} y={(H - 26) - h} width={bw * 0.6} height={Math.max(1, h)} rx={2} fill="#c0392b" /><text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize={8} fill="#64748b">{k.split(" ")[0]}</text></g>); })}
          </svg>
        )}
      </Card>

      {/* Aging buckets — vertical bars by COUNT */}
      <Card title="Aging buckets" pill="Days overdue" pillColor="#c0392b">
        {aging.every((a) => a.n === 0) ? <Empty /> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
            {ticks(ageMax).map((t, i) => { const y = (H - 26) - (t / ageMax) * (H - 40); return (<g key={i}><line x1={30} x2={W - 8} y1={y} y2={y} stroke="var(--cave-line)" strokeDasharray="2 3" /><text x={26} y={y + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{Math.round(t)}</text></g>); })}
            {aging.map((a, i) => { const bw = (W - 38) / aging.length, x = 30 + i * bw, h = (a.n / ageMax) * (H - 40); return (<g key={a.k}><rect x={x + bw * 0.22} y={(H - 26) - h} width={bw * 0.56} height={Math.max(a.n > 0 ? 2 : 0, h)} rx={2} fill={a.c} /><text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize={8} fill="#64748b">{a.k}</text></g>); })}
          </svg>
        )}
      </Card>

      {/* Subscription status — horizontal bars by COUNT */}
      <Card title="Subscription status" pill="Visible" pillColor="#0369a1">
        {byStatus.length === 0 ? <Empty /> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
            {ticks(statMax).map((t, i) => { const x = 96 + (t / statMax) * (W - 106); return (<g key={i}><line x1={x} x2={x} y1={6} y2={H - 18} stroke="var(--cave-line)" strokeDasharray="2 3" /><text x={x} y={H - 6} textAnchor="middle" fontSize={8} fill="#94a3b8">{Math.round(t)}</text></g>); })}
            {byStatus.map((s, i) => { const bh = (H - 30) / byStatus.length, y = 6 + i * bh; return (<g key={s.k}><text x={92} y={y + bh / 2 + 3} textAnchor="end" fontSize={8} fill="#64748b">{s.k}</text><rect x={96} y={y + bh * 0.2} width={Math.max(1, (s.v / statMax) * (W - 106))} height={bh * 0.6} rx={2} fill={s.c} /></g>); })}
          </svg>
        )}
      </Card>
    </div>
  );
}
