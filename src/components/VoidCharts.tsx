"use client";

import { useMemo } from "react";

// Hand-built SVG charts for Void (no chart library — CAVE//OS convention).
// All computed from the passed rows (the current filtered slice), so they move
// with the filters. Four panels: outstanding by AM, by month, an aging funnel,
// and a subscription-status donut.

type Row = {
  amName: string | null; amountDue: number | null; invoiceMonth: string | null;
  daysOverdue: number | null; subStatus: string | null;
};

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const usdK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="text-[11px] font-semibold text-slate-600">{title}</div>
      {sub && <div className="mb-1 text-[10px] text-slate-400">{sub}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function VoidCharts({ rows }: { rows: Row[] }) {
  const byAm = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = r.amName || "(no AM)"; m.set(k, (m.get(k) || 0) + (r.amountDue || 0)); }
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.invoiceMonth) m.set(r.invoiceMonth, (m.get(r.invoiceMonth) || 0) + (r.amountDue || 0));
    return [...m.entries()].sort((a, b) => new Date("01 " + a[0]).getTime() - new Date("01 " + b[0]).getTime());
  }, [rows]);

  const aging = useMemo(() => {
    const defs = [{ k: "0–30d", lo: 0, hi: 30 }, { k: "31–60d", lo: 31, hi: 60 }, { k: "61–90d", lo: 61, hi: 90 }, { k: "90d+", lo: 91, hi: Infinity }];
    return defs.map((b) => {
      const inB = rows.filter((r) => r.daysOverdue != null && r.daysOverdue >= b.lo && r.daysOverdue <= b.hi);
      return { k: b.k, n: inB.length, sum: inB.reduce((s, r) => s + (r.amountDue || 0), 0) };
    });
  }, [rows]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = r.subStatus || "unknown"; m.set(k, (m.get(k) || 0) + (r.amountDue || 0)); }
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const maxAm = Math.max(1, ...byAm.map(([, v]) => v));
  const maxMonth = Math.max(1, ...byMonth.map(([, v]) => v));
  const maxAge = Math.max(1, ...aging.map((a) => a.sum));
  const statusTotal = byStatus.reduce((s, [, v]) => s + v, 0) || 1;
  const STATUS_COLOR: Record<string, string> = { active: "#16a34a", non_renewing: "#d97706", cancelled: "#dc2626", paused: "#0369a1", unknown: "#94a3b8" };

  // donut arcs
  let acc = -Math.PI / 2;
  const arcs = byStatus.map(([k, v]) => {
    const a0 = acc, a1 = acc + (v / statusTotal) * Math.PI * 2; acc = a1;
    const R = 46, r = 27, cx = 55, cy = 55;
    const p = (rad: number, a: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return { k, v, d: `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`, color: STATUS_COLOR[k] || "#94a3b8" };
  });

  return (
    <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-4">
      {/* Outstanding by AM — horizontal bars */}
      <Card title="Outstanding by AM" sub="top 8 by balance">
        {byAm.length === 0 ? <Empty /> : (
          <div className="space-y-1">
            {byAm.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[10px] text-slate-500" title={k}>{k}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-sm" style={{ background: "var(--cave-line)" }}>
                  <div className="h-full rounded-sm" style={{ width: `${(v / maxAm) * 100}%`, background: "#dc2626" }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-600">{usdK(v)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Outstanding by month — vertical bars */}
      <Card title="Outstanding by month" sub="invoice month">
        {byMonth.length === 0 ? <Empty /> : (
          <svg viewBox="0 0 240 110" className="w-full" style={{ maxHeight: 120 }} role="img">
            {byMonth.map(([k, v], i) => {
              const bw = (240 - 20) / byMonth.length, x = 10 + i * bw, h = (v / maxMonth) * 76;
              return (
                <g key={k}>
                  <rect x={x + bw * 0.15} y={92 - h} width={bw * 0.7} height={Math.max(1, h)} rx={2} fill="#b45309" />
                  <text x={x + bw / 2} y={104} textAnchor="middle" fontSize={7} fill="#94a3b8">{k.split(" ")[0]}</text>
                  <text x={x + bw / 2} y={90 - h} textAnchor="middle" fontSize={7} fill="#64748b">{usdK(v)}</text>
                </g>
              );
            })}
          </svg>
        )}
      </Card>

      {/* Aging funnel — centered narrowing bars */}
      <Card title="Aging funnel" sub="overdue balance by age">
        {aging.every((a) => a.n === 0) ? <Empty /> : (
          <div className="space-y-1.5 py-1">
            {aging.map((a) => {
              const w = Math.max(6, (a.sum / maxAge) * 100);
              const shade = a.k === "90d+" ? "#dc2626" : a.k === "61–90d" ? "#ea580c" : a.k === "31–60d" ? "#d97706" : "#eab308";
              return (
                <div key={a.k} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[10px] text-slate-500">{a.k}</span>
                  <div className="flex flex-1 justify-center">
                    <div className="flex h-4 items-center justify-center rounded-sm text-[9px] font-medium text-white" style={{ width: `${w}%`, background: shade, minWidth: 36 }}>
                      {usdK(a.sum)}
                    </div>
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-400">{a.n}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Sub-status donut */}
      <Card title="By subscription status" sub="balance share">
        {byStatus.length === 0 ? <Empty /> : (
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 110 110" width={96} height={96} role="img">
              {arcs.map((a) => <path key={a.k} d={a.d} fill={a.color} />)}
              <text x={55} y={52} textAnchor="middle" fontSize={9} fontWeight={700} fill="#334155">{usdK(statusTotal)}</text>
              <text x={55} y={63} textAnchor="middle" fontSize={6} fill="#94a3b8">total</text>
            </svg>
            <div className="space-y-0.5">
              {byStatus.map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 text-[10px]">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: STATUS_COLOR[k] || "#94a3b8" }} />
                  <span className="text-slate-500">{k}</span>
                  <span className="tabular-nums text-slate-600">{usdK(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-[11px] text-slate-400">No data</div>;
}
