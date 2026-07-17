"use client";

import { useRef, useState } from "react";
import { VIZ, scoreColor } from "@/lib/theme";
import { formatNumber } from "@/lib/format";
import type { PaymentDetail } from "@/lib/types";

// semantic payment colors (readable on the dark Command-Deck theme)
const PAY_GREEN = "#16a34a", PAY_AMBER = "#d97706", PAY_RED = "#dc2626", PAY_PAID = "#4A7C59", PAY_PART = "#c2410c";

// ---- shared helpers --------------------------------------------------------
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ leftPct, title, rows, pinned, onClose }: { leftPct: number; title: string; rows: { name: string; color?: string; value: string }[]; pinned?: boolean; onClose?: () => void }) {
  const flip = leftPct > 60;
  return (
    <div
      className={`absolute z-20 -translate-y-1 rounded-md border bg-white px-2 py-1 text-xs shadow-md ${pinned ? "border-indigo-300 shadow-lg" : "pointer-events-none border-slate-200"}`}
      style={{ left: `${leftPct}%`, top: 0, transform: `translateX(${flip ? "-105%" : "8px"})` }}
    >
      {pinned && (
        <button onClick={onClose} className="absolute right-1 top-0.5 leading-none text-slate-400 hover:text-slate-700" title="Close">×</button>
      )}
      <div className={`mb-0.5 font-medium text-slate-500 ${pinned ? "pr-3" : ""}`}>{title}{pinned ? " · pinned" : ""}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-1.5 whitespace-nowrap">
          {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />}
          <span className="text-slate-500">{r.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-800">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1.5">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// hook: map mouse over an SVG (viewBox 0..W) to a data index; supports click-to-pin
function useIndexHover(n: number, W: number, PL: number, PR: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  function idxFrom(e: React.MouseEvent): number | null {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const vbx = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (vbx - PL) / (W - PL - PR);
    return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
  }
  return {
    ref,
    hi,
    pinned,
    active: pinned ?? hi,
    onMove: (e: React.MouseEvent) => setHi(idxFrom(e)),
    onLeave: () => setHi(null),
    onClick: (e: React.MouseEvent) => setPinned((p) => (p === idxFrom(e) ? null : idxFrom(e))),
    clear: () => setPinned(null),
  };
}

// ---- multi-line (profile metrics) -----------------------------------------
export function MultiLineChart({ xLabels, series }: { xLabels: string[]; series: { name: string; color: string; values: number[] }[] }) {
  const W = 520, H = 170, PL = 34, PR = 8, PT = 8, PB = 20;
  const n = xLabels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const ticks = [0, max / 2, max];
  const hv = useIndexHover(n, W, PL, PR);
  return (
    <div className="relative">
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-pointer" style={{ maxHeight: 200 }} role="img" onMouseMove={hv.onMove} onMouseLeave={hv.onLeave} onClick={hv.onClick}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth={1} />
            <text x={PL - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>{formatNumber(Math.round(t))}</text>
          </g>
        ))}
        {series.map((s) => (
          <polyline key={s.name} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={VIZ.muted}>{xLabels[i]?.slice(5)}</text>
        ))}
        {hv.active != null && (
          <g>
            <line x1={x(hv.active)} x2={x(hv.active)} y1={PT} y2={H - PB} stroke={VIZ.baseline} strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.name} cx={x(hv.active!)} cy={y(s.values[hv.active!])} r={3} fill={s.color} stroke="#fff" strokeWidth={1} />)}
          </g>
        )}
      </svg>
      {hv.active != null && (
        <Tooltip leftPct={(x(hv.active) / W) * 100} title={xLabels[hv.active]} rows={series.map((s) => ({ name: s.name, color: s.color, value: formatNumber(s.values[hv.active!]) }))} pinned={hv.pinned != null} onClose={hv.clear} />
      )}
    </div>
  );
}

// ---- leads (line) + reviews (bars), two aligned panels --------------------
export function LeadsReviewsChart({ data }: { data: { mon: string; leads: number; reviews: number }[] }) {
  const W = 520, PL = 26, PR = 8;
  const n = data.length || 1;
  const lmax = niceMax(Math.max(1, ...data.map((d) => d.leads)));
  const rmax = niceMax(Math.max(1, ...data.map((d) => d.reviews)));
  const bw = (W - PL - PR) / n;
  const xc = (i: number) => PL + bw * (i + 0.5);
  const hv = useIndexHover(n, W, PL, PR);
  const panel = (h: number, maxV: number, kind: "line" | "bar", color: string, key: (d: (typeof data)[number]) => number) => {
    const PT = 6, PB = 4;
    const y = (v: number) => PT + (1 - v / maxV) * (h - PT - PB);
    return (
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full cursor-pointer" style={{ maxHeight: h }} role="img" onMouseMove={hv.onMove} onMouseLeave={hv.onLeave} onClick={hv.onClick} ref={kind === "line" ? hv.ref : undefined}>
        <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke={VIZ.baseline} strokeWidth={1} />
        <text x={PL - 3} y={y(maxV) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>{maxV}</text>
        {kind === "line" ? (
          <polyline points={data.map((d, i) => `${xc(i)},${y(key(d))}`).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        ) : (
          data.map((d, i) => { const v = key(d); return <rect key={i} x={xc(i) - bw * 0.3} y={y(v)} width={bw * 0.6} height={Math.max(0, y(0) - y(v))} rx={1.5} fill={color} opacity={hv.active === i ? 1 : 0.85} />; })
        )}
        {hv.active != null && <circle cx={xc(hv.active)} cy={y(key(data[hv.active]))} r={kind === "line" ? 3 : 0} fill={color} stroke="#fff" strokeWidth={1} />}
      </svg>
    );
  };
  return (
    <div className="relative">
      <Legend items={[{ name: "Leads", color: VIZ.series[0] }, { name: "Reviews", color: VIZ.series[1] }]} />
      {panel(80, lmax, "line", VIZ.series[0], (d) => d.leads)}
      {panel(56, rmax, "bar", VIZ.series[1], (d) => d.reviews)}
      <div className="flex justify-between px-5 text-[9px] text-slate-400">
        <span>{data[0]?.mon}</span>
        <span>{data[data.length - 1]?.mon}</span>
      </div>
      {hv.active != null && (
        <Tooltip leftPct={(xc(hv.active) / W) * 100} title={data[hv.active].mon} rows={[
          { name: "Leads", color: VIZ.series[0], value: String(data[hv.active].leads) },
          { name: "Reviews", color: VIZ.series[1], value: String(data[hv.active].reviews) },
        ]} pinned={hv.pinned != null} onClose={hv.clear} />
      )}
    </div>
  );
}

// ---- rank trend (single line, inverted) -----------------------------------
export function RankTrendChart({ data }: { data: { d: string; avgRank: number | null; top3: number | null }[] }) {
  const pts = data.filter((d) => d.avgRank != null) as { d: string; avgRank: number; top3: number | null }[];
  const W = 520, H = 150, PL = 26, PR = 8, PT = 8, PB = 18;
  const n = pts.length;
  const hv = useIndexHover(n, W, PL, PR);
  if (n < 2) return <div className="py-8 text-center text-sm text-slate-400">Not enough rank history.</div>;
  const maxR = Math.max(...pts.map((p) => p.avgRank), 5);
  const x = (i: number) => PL + (i / (n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + ((v - 1) / (maxR - 1)) * (H - PT - PB);
  const ticks = [1, Math.round(maxR / 2), Math.round(maxR)];
  return (
    <div className="relative">
      <Legend items={[{ name: "Avg rank (lower = better)", color: VIZ.series[0] }]} />
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-pointer" style={{ maxHeight: 170 }} role="img" onMouseMove={hv.onMove} onMouseLeave={hv.onLeave} onClick={hv.onClick}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth={1} />
            <text x={PL - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>#{t}</text>
          </g>
        ))}
        <polyline points={pts.map((p, i) => `${x(i)},${y(p.avgRank)}`).join(" ")} fill="none" stroke={VIZ.series[0]} strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.avgRank)} r={hv.active === i ? 3.5 : 2} fill={VIZ.series[0]} stroke="#fff" strokeWidth={hv.active === i ? 1 : 0} />)}
        {[0, n - 1].map((i) => <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : "end"} fontSize={9} fill={VIZ.muted}>{pts[i].d.slice(5)}</text>)}
        {hv.active != null && <line x1={x(hv.active)} x2={x(hv.active)} y1={PT} y2={H - PB} stroke={VIZ.baseline} strokeWidth={1} strokeDasharray="3 3" />}
      </svg>
      {hv.active != null && (
        <Tooltip leftPct={(x(hv.active) / W) * 100} title={pts[hv.active].d} rows={[
          { name: "Avg rank", color: VIZ.series[0], value: `#${pts[hv.active].avgRank}` },
          ...(pts[hv.active].top3 != null ? [{ name: "Top-3 %", value: `${pts[hv.active].top3}%` }] : []),
        ]} pinned={hv.pinned != null} onClose={hv.clear} />
      )}
    </div>
  );
}

// ---- lead → booking funnel ------------------------------------------------
const RAMP = ["#2a78d6", "#3987e5", "#5598e7", "#86b6ef"];
export function FunnelChart({ f }: { f: { enquiries: number; opened: number; contacted: number; booked: number } }) {
  const rows = [
    { label: "Enquiries", v: f.enquiries },
    { label: "Opened", v: f.opened },
    { label: "Contacted", v: f.contacted },
    { label: "Booked", v: f.booked },
  ];
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, f.enquiries);
  const conv = f.enquiries ? Math.round((f.booked / f.enquiries) * 100) : 0;
  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">Booking conversion: <span className="font-semibold text-slate-700">{conv}%</span></div>
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const pct = f.enquiries ? Math.round((r.v / f.enquiries) * 100) : 0;
          return (
            <button key={r.label} onClick={() => setSel((s) => (s === i ? null : i))} className={`flex w-full items-center gap-2 rounded text-xs ${sel === i ? "bg-indigo-50" : ""}`}>
              <span className="w-16 shrink-0 text-left text-slate-500">{r.label}</span>
              <div className="h-4 flex-1 rounded bg-slate-100">
                <div className="h-4 rounded transition-all hover:brightness-95" style={{ width: `${(r.v / max) * 100}%`, background: RAMP[i], minWidth: r.v > 0 ? 2 : 0 }} />
              </div>
              <span className="w-8 shrink-0 text-right font-medium tabular-nums text-slate-700">{r.v}</span>
            </button>
          );
        })}
      </div>
      {sel != null && (
        <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
          <b>{rows[sel].label}:</b> {rows[sel].v}
          {f.enquiries > 0 && <> · {Math.round((rows[sel].v / f.enquiries) * 100)}% of enquiries</>}
          {sel > 0 && rows[sel - 1].v > 0 && <> · {Math.round((rows[sel].v / rows[sel - 1].v) * 100)}% of {rows[sel - 1].label.toLowerCase()}</>}
        </div>
      )}
    </div>
  );
}

// ---- health sub-score bars -------------------------------------------------
export function HealthBars({ engagement, value, product, composite, tier, reason }: {
  engagement: number | null; value: number | null; product: number | null; composite: number | null; tier: string; reason: string | null;
}) {
  const bars = [
    { label: "Engagement", v: engagement },
    { label: "Value", v: value },
    { label: "Product", v: product },
  ];
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{composite != null ? composite.toFixed(0) : "—"}</span>
        <span className="text-xs text-slate-500">composite · {tier}{reason ? ` · watch: ${reason}` : ""}</span>
      </div>
      <div className="space-y-1.5">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-xs" title={`${b.label}: ${b.v != null ? b.v.toFixed(1) : "—"} / 100`}>
            <span className="w-20 shrink-0 text-slate-500">{b.label}</span>
            <div className="h-3 flex-1 rounded bg-slate-100">
              <div className="h-3 rounded" style={{ width: `${b.v ?? 0}%`, background: scoreColor(b.v) }} />
            </div>
            <span className="w-8 shrink-0 text-right font-medium tabular-nums text-slate-700">{b.v != null ? b.v.toFixed(0) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Payment trends: are invoices paid on time, and by how many days late ----
export function PaymentTrendsChart({ payments }: { payments?: PaymentDetail | null }) {
  const inv = payments?.invoices ?? [];
  const hv = useIndexHover(inv.length || 1, 520, 30, 8);
  if (!payments?.found || !inv.length)
    return <div className="py-8 text-center text-sm text-slate-400">No billing history on file.</div>;
  const W = 520, H = 168, PL = 30, PR = 8, PT = 18, PB = 24;
  const n = inv.length;
  const maxLate = niceMax(Math.max(3, ...inv.map((i) => Math.max(0, i.days_late ?? 0))));
  const bw = (W - PL - PR) / n;
  const xc = (i: number) => PL + bw * (i + 0.5);
  const yBase = H - PB;
  const yFor = (v: number) => yBase - (Math.max(0, v) / maxLate) * (H - PT - PB);
  const colOf = (iv: (typeof inv)[number]) => (!iv.paid ? PAY_RED : (iv.days_late ?? 0) <= 0 ? PAY_GREEN : (iv.days_late as number) <= 7 ? PAY_AMBER : PAY_RED);
  const ticks = [0, Math.round(maxLate / 2), maxLate];
  return (
    <div className="relative">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>On-time: <b className="text-slate-700">{payments.on_time_rate != null ? `${payments.on_time_rate}%` : "—"}</b></span>
        <span>Avg delay: <b className="text-slate-700">{payments.avg_days_late != null ? `${payments.avg_days_late}d` : "—"}</b></span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: PAY_GREEN }} />on&nbsp;time</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: PAY_AMBER }} />≤7d late</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: PAY_RED }} />late&nbsp;/&nbsp;unpaid</span>
      </div>
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-pointer" style={{ maxHeight: 200 }} role="img" onMouseMove={hv.onMove} onMouseLeave={hv.onLeave} onClick={hv.onClick}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={yFor(t)} y2={yFor(t)} stroke={VIZ.grid} strokeWidth={1} />
            <text x={PL - 4} y={yFor(t) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>{t}d</text>
          </g>
        ))}
        {inv.map((iv, i) => {
          const v = Math.max(0, iv.days_late ?? 0);
          const top = yFor(v);
          return v > 0
            ? <rect key={i} x={xc(i) - bw * 0.3} y={top} width={bw * 0.6} height={Math.max(1, yBase - top)} rx={1.5} fill={colOf(iv)} opacity={hv.active === i ? 1 : 0.85} />
            : <circle key={i} cx={xc(i)} cy={yBase} r={hv.active === i ? 4.5 : 3.5} fill={colOf(iv)} />;
        })}
        {[0, n - 1].map((i) => <text key={i} x={xc(i)} y={H - 6} textAnchor={i === 0 ? "start" : "end"} fontSize={9} fill={VIZ.muted}>{inv[i].date?.slice(5)}</text>)}
        {hv.active != null && <line x1={xc(hv.active)} x2={xc(hv.active)} y1={PT} y2={yBase} stroke={VIZ.baseline} strokeWidth={1} strokeDasharray="3 3" />}
      </svg>
      {hv.active != null && inv[hv.active] && (
        <Tooltip
          leftPct={(xc(hv.active) / W) * 100}
          title={inv[hv.active].date || "invoice"}
          rows={[
            { name: "Status", value: inv[hv.active].paid ? "Paid" : inv[hv.active].status },
            { name: "Due", value: inv[hv.active].due_date || "—" },
            ...(inv[hv.active].paid ? [{ name: "Paid on", value: inv[hv.active].paid_at || "—" }] : []),
            { name: inv[hv.active].paid ? "Days late" : "Overdue", value: inv[hv.active].days_late != null ? `${inv[hv.active].days_late}d` : "—" },
            { name: "Amount", value: `$${inv[hv.active].paid ? inv[hv.active].amount_paid_usd : inv[hv.active].amount_due_usd}` },
          ]}
          pinned={hv.pinned != null}
          onClose={hv.clear}
        />
      )}
    </div>
  );
}

// ---- Payment details: auto-collection, MRR, and what they actually paid ------
function PayStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-white px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-semibold tabular-nums text-slate-700">{value}</div>
    </div>
  );
}
export function PaymentDetailsChart({ payments }: { payments?: PaymentDetail | null }) {
  const inv = payments?.invoices ?? [];
  const hv = useIndexHover(inv.length || 1, 520, 30, 8);
  if (!payments?.found)
    return <div className="py-8 text-center text-sm text-slate-400">No Chargebee billing on file.</div>;
  const auto = (payments.auto_collection || "").toLowerCase();
  const pill = auto === "on"
    ? { bg: "rgba(74,124,89,.16)", fg: "#4ade80", bd: "rgba(74,124,89,.45)", t: "ON" }
    : auto === "off"
    ? { bg: "rgba(220,38,38,.14)", fg: "#f87171", bd: "rgba(220,38,38,.45)", t: "OFF" }
    : { bg: "rgba(148,163,184,.12)", fg: "#94a3b8", bd: "rgba(148,163,184,.3)", t: "—" };
  const W = 520, H = 108, PL = 32, PR = 8, PT = 10, PB = 18;
  const n = inv.length || 1;
  const max = niceMax(Math.max(1, ...inv.map((i) => Math.max(i.amount_paid_usd, i.total_usd))));
  const bw = (W - PL - PR) / n;
  const xc = (i: number) => PL + bw * (i + 0.5);
  const yBase = H - PB;
  const yFor = (v: number) => yBase - (v / max) * (H - PT - PB);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded px-2 py-1 font-medium" style={{ background: pill.bg, color: pill.fg, border: `1px solid ${pill.bd}` }}>Auto-collect: {pill.t}</span>
        <PayStat label="MRR" value={`$${payments.total_mrr_usd}`} />
        <PayStat label="Active subs" value={payments.active_subscription_count} />
        <PayStat label="Net terms" value={payments.net_term_days != null ? `${payments.net_term_days}d` : "—"} />
      </div>
      <div className="mb-1 text-xs text-slate-400">Collected per invoice</div>
      <div className="relative">
        <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-pointer" style={{ maxHeight: 128 }} role="img" onMouseMove={hv.onMove} onMouseLeave={hv.onLeave} onClick={hv.onClick}>
          <line x1={PL} x2={W - PR} y1={yBase} y2={yBase} stroke={VIZ.baseline} strokeWidth={1} />
          <text x={PL - 4} y={yFor(max) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>${max}</text>
          {inv.map((iv, i) => {
            const top = yFor(iv.amount_paid_usd);
            return <rect key={i} x={xc(i) - bw * 0.3} y={top} width={bw * 0.6} height={Math.max(1, yBase - top)} rx={1.5} fill={iv.paid ? PAY_PAID : PAY_PART} opacity={hv.active === i ? 1 : 0.85} />;
          })}
          {inv.length ? [0, n - 1].map((i) => <text key={i} x={xc(i)} y={H - 5} textAnchor={i === 0 ? "start" : "end"} fontSize={9} fill={VIZ.muted}>{inv[i]?.date?.slice(5)}</text>) : null}
        </svg>
        {hv.active != null && inv[hv.active] && (
          <Tooltip
            leftPct={(xc(hv.active) / W) * 100}
            title={inv[hv.active].date || "invoice"}
            rows={[
              { name: "Paid", value: `$${inv[hv.active].amount_paid_usd}` },
              { name: "Total", value: `$${inv[hv.active].total_usd}` },
              { name: "Status", value: inv[hv.active].paid ? "Paid" : inv[hv.active].status },
            ]}
            pinned={hv.pinned != null}
            onClose={hv.clear}
          />
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <PayStat label="Total paid" value={`$${payments.total_paid_usd}`} />
        <PayStat label="Outstanding" value={`$${payments.unpaid_total_usd}`} />
        <PayStat label="Failed txns" value={payments.failed_txn_count} />
      </div>
    </div>
  );
}
