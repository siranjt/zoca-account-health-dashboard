"use client";

import { useMemo } from "react";

// Sleek hand-built SVG charts for Void (no chart library — CAVE//OS convention):
// a collection funnel, gradient AM bars, a smooth by-month area trend, and a
// rounded subscription-status donut. All computed from the passed rows (the
// current filtered slice), so they move with the filters.

type Row = {
  amName: string | null; amountDue: number | null; invoiceMonth: string | null;
  daysOverdue: number | null; subStatus: string | null; achInFlight: boolean; autoCollection: string | null;
};

const usdK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 1 : 1)}k` : `$${Math.round(n)}`);

function Card({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="mb-2">
        <div className="text-[13px] font-semibold" style={{ color: "var(--cave-txt, #334155)" }}>{title}</div>
        {caption && <div className="text-[9px] uppercase tracking-[0.14em] text-slate-400">{caption}</div>}
      </div>
      {children}
    </div>
  );
}
function Empty() { return <div className="py-10 text-center text-[11px] text-slate-400">No data</div>; }

export default function VoidCharts({ rows, onDrill }: { rows: Row[]; onDrill?: (kind: string, value: string) => void }) {
  const drill = (kind: string, value = "") => (onDrill ? () => onDrill(kind, value) : undefined);
  const clk = onDrill ? { cursor: "pointer" as const } : undefined;
  const total = rows.length;
  const totalDue = rows.reduce((s, r) => s + (r.amountDue || 0), 0);

  // ---- collection funnel: all → overdue → manual-chase → nothing in motion ----
  const funnel = useMemo(() => {
    const overdue = rows.filter((r) => (r.daysOverdue ?? 0) > 0);
    const manual = overdue.filter((r) => (r.autoCollection || "").toLowerCase() === "off");
    const stuck = manual.filter((r) => !r.achInFlight);
    const mk = (label: string, list: Row[], color: string) => ({ label, n: list.length, sum: list.reduce((s, r) => s + (r.amountDue || 0), 0), color });
    return [
      mk("Outstanding", rows, "#f59e0b"),
      mk("Overdue", overdue, "#f97316"),
      mk("Manual chase (auto-debit off)", manual, "#ef4444"),
      mk("Nothing in motion", stuck, "#b91c1c"),
    ];
  }, [rows]);

  const byAm = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = r.amName || "(unassigned)"; m.set(k, (m.get(k) || 0) + (r.amountDue || 0)); }
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.invoiceMonth) m.set(r.invoiceMonth, (m.get(r.invoiceMonth) || 0) + (r.amountDue || 0));
    return [...m.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  }, [rows]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = r.subStatus || "unknown"; m.set(k, (m.get(k) || 0) + 1); }
    const COLOR: Record<string, string> = { active: "#10b981", non_renewing: "#f59e0b", cancelled: "#ef4444", paused: "#38bdf8", unknown: "#94a3b8" };
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v, c: COLOR[k] || "#94a3b8" }));
  }, [rows]);

  // funnel geometry
  const fMax = Math.max(1, ...funnel.map((f) => f.sum));
  const FW = 470, FH = 150;
  const FSHORT = ["Outstanding", "Overdue", "Manual chase", "Nothing in motion"];

  // area geometry
  const AW = 460, AH = 118, aPad = { l: 40, r: 12, t: 10, b: 20 };
  const aMax = Math.max(1, ...byMonth.map(([, v]) => v));
  const ax = (i: number) => aPad.l + (byMonth.length <= 1 ? (AW - aPad.l - aPad.r) / 2 : (i / (byMonth.length - 1)) * (AW - aPad.l - aPad.r));
  const ay = (v: number) => AH - aPad.b - (v / aMax) * (AH - aPad.t - aPad.b);

  // donut geometry (stroke-based, rounded caps)
  const statTotal = byStatus.reduce((s, x) => s + x.v, 0) || 1;
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  const donut = byStatus.map((s) => {
    const len = (s.v / statTotal) * C, off = acc; acc += len;
    return { ...s, len, off };
  });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* Collection funnel */}
      <Card title="Collection funnel" caption="unpaid → what still needs a call">
        {total === 0 ? <Empty /> : (
          <svg viewBox={`0 0 ${FW} ${FH}`} className="w-full" role="img">
            <defs>
              {funnel.map((f, i) => (
                <linearGradient key={i} id={`fg${i}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={f.color} stopOpacity="0.95" />
                  <stop offset="1" stopColor={f.color} stopOpacity="0.65" />
                </linearGradient>
              ))}
            </defs>
            {funnel.map((f, i) => {
              const segW = (FW - 6) / funnel.length;
              const x = 3 + i * segW;
              const cy = (FH - 34) / 2 + 4;
              const maxH = FH - 48;
              const lH = (f.sum / fMax) * maxH;
              const rH = ((funnel[i + 1]?.sum ?? f.sum) / fMax) * maxH;
              const kind = ["", "overdue", "manual", "stuck"][i];
              return (
                <g key={i} onClick={kind ? drill(kind) : undefined} style={kind ? clk : undefined}>
                  <title>{kind ? `Filter: ${FSHORT[i]}` : FSHORT[i]}</title>
                  <polygon points={`${x},${cy - lH / 2} ${x + segW - 2},${cy - rH / 2} ${x + segW - 2},${cy + rH / 2} ${x},${cy + lH / 2}`} fill={`url(#fg${i})`} />
                  <text x={x + segW / 2} y={cy + 3} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{usdK(f.sum)}</text>
                  <text x={x + segW / 2} y={FH - 13} textAnchor="middle" fontSize={8} fill="#94a3b8">{FSHORT[i]}</text>
                  <text x={x + segW / 2} y={FH - 3} textAnchor="middle" fontSize={8} fontWeight={600} fill="#64748b">{f.n} inv</text>
                </g>
              );
            })}
          </svg>
        )}
      </Card>

      {/* Subscription status donut */}
      <Card title="Subscription status" caption={`${total} invoices · ${usdK(totalDue)} due`}>
        {byStatus.length === 0 ? <Empty /> : (
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 120 120" width={128} height={128} role="img" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--cave-line)" strokeWidth="12" />
              {donut.map((s) => (
                <circle key={s.k} cx="60" cy="60" r={R} fill="none" stroke={s.c} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${Math.max(0, s.len - 2)} ${C}`} strokeDashoffset={-s.off}
                  onClick={drill("subStatus", s.k)} style={clk}><title>{`Filter: ${s.k}`}</title></circle>
              ))}
            </svg>
            <div className="space-y-1.5">
              {byStatus.map((s) => (
                <div key={s.k} className="flex items-center gap-2 text-xs hover:opacity-80" onClick={drill("subStatus", s.k)} style={clk} title="Filter by this status">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.c }} />
                  <span className="text-slate-500">{s.k}</span>
                  <span className="font-semibold tabular-nums text-slate-700">{s.v}</span>
                  <span className="text-[10px] text-slate-400">{Math.round((s.v / statTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Outstanding by AM — gradient bars */}
      <Card title="Outstanding by AM" caption="top 8 by balance">
        {byAm.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            <svg width="0" height="0"><defs><linearGradient id="amBar" x1="0" x2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#ef4444" /></linearGradient></defs></svg>
            {byAm.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 hover:opacity-80" onClick={drill("am", k)} style={clk} title="Filter by this AM">
                <span className="w-24 shrink-0 truncate text-[10px] text-slate-500" title={k}>{k}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--cave-line)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(v / byAm[0][1]) * 100}%`, background: "linear-gradient(90deg,#6366f1,#ef4444)" }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-600">{usdK(v)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Outstanding by month — smooth area */}
      <Card title="Outstanding by month" caption="balance trend">
        {byMonth.length === 0 ? <Empty /> : (
          <svg viewBox={`0 0 ${AW} ${AH}`} className="w-full" role="img">
            <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ef4444" stopOpacity="0.35" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></linearGradient></defs>
            {[0, 0.5, 1].map((f, i) => { const y = ay(aMax * f); return (<g key={i}><line x1={aPad.l} x2={AW - aPad.r} y1={y} y2={y} stroke="var(--cave-line)" strokeDasharray="2 4" /><text x={aPad.l - 5} y={y + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{usdK(aMax * f)}</text></g>); })}
            <path d={`M${ax(0)},${AH - aPad.b} ${byMonth.map(([, v], i) => `L${ax(i)},${ay(v)}`).join(" ")} L${ax(byMonth.length - 1)},${AH - aPad.b} Z`} fill="url(#areaFill)" />
            <path d={`M${byMonth.map(([, v], i) => `${ax(i)},${ay(v)}`).join(" L")}`} fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {byMonth.map(([k, v], i) => (
              <g key={k} onClick={drill("month", k)} style={clk}>
                <circle cx={ax(i)} cy={ay(v)} r={6} fill="transparent" />
                <circle cx={ax(i)} cy={ay(v)} r={3.5} fill="#fff" stroke="#ef4444" strokeWidth={2} />
                <text x={ax(i)} y={AH - 6} textAnchor="middle" fontSize={8} fill="#64748b">{k.split(" ")[0]}</text>
              </g>
            ))}
          </svg>
        )}
      </Card>
    </div>
  );
}
