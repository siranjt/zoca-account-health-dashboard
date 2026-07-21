"use client";

import { useEffect, useState } from "react";
import type { ChartData } from "@/app/page";

// Tactical readout for the landing deck — four live, animated bat-tech
// instruments built as custom SVG: a composite-score spectrum analyzer, a
// threat ring, a targeting radar of the book's health dimensions, and handler
// load bars. Everything is token-coloured (cyan in Batman, gold in Wayne) with
// fixed traffic-light semantics. Draw-in animates once on mount.
export default function LandingCharts({ charts }: { charts: ChartData }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);

  return (
    <section className="mt-16">
      <SectionLabel>Tactical Readout</SectionLabel>
      <div className="grid gap-3">
        <Spectrum hist={charts.hist} on={on} vitals={charts.vitals} />
        <div className="grid gap-3 lg:grid-cols-3">
          <ThreatRing mix={charts.mix} on={on} />
          <DimRadar dims={charts.dims} on={on} />
          <HandlerLoad amLoad={charts.amLoad} on={on} />
        </div>
      </div>
    </section>
  );
}

/* ── A · composite-score spectrum analyzer ──────────────────────────────── */
function Spectrum({ hist, on, vitals }: { hist: number[]; on: boolean; vitals: { leads: number; reviews: number } }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...hist);
  const W = 660, H = 200, padL = 30, padB = 26, padT = 14;
  const bw = (W - padL - 10) / hist.length;
  const barColor = (i: number) => (i < 4 ? "#dc2626" : i < 7 ? "#d97706" : "#16a34a");
  return (
    <Card title="Composite Spectrum" note={`${sum(hist)} scored · leads ${fmt(vitals.leads)} · reviews ${fmt(vitals.reviews)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ maxHeight: 210 }} role="img" aria-label="Composite score distribution">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const y = padT + (H - padT - padB) * g;
          return <line key={g} x1={padL} y1={y} x2={W - 6} y2={y} stroke="var(--cave-line)" strokeWidth={1} opacity={0.5} />;
        })}
        {hist.map((c, i) => {
          const full = H - padT - padB;
          const h = (c / max) * full;
          const x = padL + i * bw;
          const y = padT + (full - h);
          const col = barColor(i);
          const hot = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <rect x={x + 2} y={padT} width={bw - 5} height={full} fill="transparent" />
              <rect
                x={x + 2} y={y} width={bw - 5} height={Math.max(h, c > 0 ? 2 : 0)} rx={1.5}
                fill={col}
                style={{ transformBox: "fill-box", transformOrigin: "bottom", transform: on ? "scaleY(1)" : "scaleY(0)", transition: `transform .7s cubic-bezier(.2,.7,.2,1) ${i * 0.035}s`, filter: hot ? `drop-shadow(0 0 7px ${col})` : `drop-shadow(0 0 3px ${col})`, opacity: hover == null || hot ? 1 : 0.55 }}
              />
              {hot && c > 0 && (
                <text x={x + (bw - 3) / 2} y={y - 5} textAnchor="middle" fontSize={12} fill="var(--cave-txt)" style={{ fontFamily: "var(--cave-mono, ui-monospace)" }}>{c}</text>
              )}
              <text x={x + (bw - 3) / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--cave-dim)">{i * 10}</text>
            </g>
          );
        })}
        <text x={W - 6} y={H - 8} textAnchor="end" fontSize={9} fill="var(--cave-dim)">100</text>
      </svg>
    </Card>
  );
}

/* ── B · threat ring (health mix donut) ─────────────────────────────────── */
function ThreatRing({ mix, on }: { mix: { green: number; yellow: number; red: number }; on: boolean }) {
  const [hover, setHover] = useState<null | "green" | "yellow" | "red">(null);
  const total = Math.max(1, mix.green + mix.yellow + mix.red);
  const segs: { k: "green" | "yellow" | "red"; v: number; c: string }[] = [
    { k: "green", v: mix.green, c: "#16a34a" },
    { k: "yellow", v: mix.yellow, c: "#d97706" },
    { k: "red", v: mix.red, c: "#dc2626" },
  ];
  let acc = 0;
  const R = 54, cx = 70, cy = 70;
  const center = hover ? segs.find((s) => s.k === hover)! : null;
  return (
    <Card title="Threat Ring" note="health mix">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Health mix" style={{ transform: on ? "scale(1)" : "scale(.6)", opacity: on ? 1 : 0, transition: "transform .6s cubic-bezier(.2,.7,.2,1), opacity .6s" }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--cave-line)" strokeWidth={12} opacity={0.5} />
          {segs.map((s) => {
            const pct = (s.v / total) * 100;
            const el = (
              <circle
                key={s.k} cx={cx} cy={cy} r={R} fill="none" stroke={s.c} strokeWidth={hover === s.k ? 15 : 12}
                pathLength={100} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc}
                transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"
                onMouseEnter={() => setHover(s.k)} onMouseLeave={() => setHover(null)}
                style={{ filter: `drop-shadow(0 0 5px ${s.c})`, transition: "stroke-width .15s", cursor: "default" }}
              />
            );
            acc += pct;
            return el;
          })}
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize={26} fontWeight={700} fill={center ? center.c : "#dc2626"}>{center ? center.v : mix.red}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} letterSpacing="1.5" fill="var(--cave-dim)">{center ? center.k.toUpperCase() : "AT RISK"}</text>
        </svg>
        <div className="flex flex-col gap-2 text-xs">
          {segs.map((s) => (
            <div key={s.k} className="flex items-center gap-2" onMouseEnter={() => setHover(s.k)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.c, boxShadow: `0 0 6px ${s.c}` }} />
              <span className="tabular-nums font-semibold" style={{ color: "var(--cave-txt)" }}>{s.v}</span>
              <span style={{ color: "var(--cave-dim)" }}>{s.k === "green" ? "healthy" : s.k === "yellow" ? "monitor" : "critical"}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── C · targeting radar (book health dimensions) ───────────────────────── */
function DimRadar({ dims, on }: { dims: { engagement: number; value: number; product: number }; on: boolean }) {
  const cx = 70, cy = 72, R = 52;
  const axes = [
    { k: "ENG", v: dims.engagement, a: -90 },
    { k: "VAL", v: dims.value, a: 30 },
    { k: "PRD", v: dims.product, a: 150 },
  ];
  const pt = (ang: number, rad: number) => [cx + rad * Math.cos((ang * Math.PI) / 180), cy + rad * Math.sin((ang * Math.PI) / 180)];
  const poly = axes.map((ax) => pt(ax.a, R * (Math.max(0, Math.min(100, ax.v)) / 100))).map((p) => p.join(",")).join(" ");
  return (
    <Card title="Health Radar" note="book averages">
      <svg viewBox="0 0 140 150" width="100%" height="150" role="img" aria-label="Health dimension radar">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <polygon key={g} points={axes.map((ax) => pt(ax.a, R * g).join(",")).join(" ")} fill="none" stroke="var(--cave-line)" strokeWidth={1} opacity={0.6} />
        ))}
        {axes.map((ax) => { const [x, y] = pt(ax.a, R); return <line key={ax.k} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--cave-line)" strokeWidth={1} opacity={0.6} />; })}
        <polygon points={poly} fill="var(--cave-cy)" fillOpacity={0.16} stroke="var(--cave-cy)" strokeWidth={1.5}
          style={{ transformBox: "fill-box", transformOrigin: "center", transform: on ? "scale(1)" : "scale(0)", transition: "transform .7s cubic-bezier(.2,.7,.2,1) .1s", filter: "drop-shadow(0 0 5px var(--cave-cy))" }} />
        {axes.map((ax) => {
          const [lx, ly] = pt(ax.a, R + 12);
          const [dx, dy] = pt(ax.a, R * (Math.max(0, Math.min(100, ax.v)) / 100));
          return (
            <g key={ax.k}>
              <circle cx={dx} cy={dy} r={2.4} fill="var(--cave-cy)" style={{ opacity: on ? 1 : 0, transition: "opacity .5s .5s" }} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="var(--cave-dim)">{ax.k}</text>
              <text x={lx} y={ly + 10} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--cave-cy)">{ax.v}</text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

/* ── D · handler load (top AMs, total + at-risk overlay) ─────────────────── */
function HandlerLoad({ amLoad, on }: { amLoad: { name: string; total: number; red: number }[]; on: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...amLoad.map((a) => a.total));
  return (
    <Card title="Handler Load" note="top managers · book / at-risk">
      <div className="flex flex-col gap-2.5 pt-1">
        {amLoad.length === 0 && <div className="text-xs" style={{ color: "var(--cave-dim)" }}>No handler data.</div>}
        {amLoad.map((a, i) => (
          <div key={a.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <div className="mb-0.5 flex items-center justify-between text-[11px]">
              <span className="truncate" style={{ color: "var(--cave-txt)", maxWidth: 130 }}>{a.name}</span>
              <span className="tabular-nums" style={{ color: "var(--cave-dim)" }}>
                {a.total}{a.red > 0 && <span style={{ color: "#dc2626" }}> · {a.red}▲</span>}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-sm" style={{ background: "var(--cave-line)" }}>
              <div className="absolute left-0 top-0 h-full rounded-sm" style={{ width: on ? `${(a.total / max) * 100}%` : "0%", background: "var(--cave-cy)", boxShadow: hover === i ? "0 0 8px var(--cave-cy)" : "none", transition: `width .7s cubic-bezier(.2,.7,.2,1) ${i * 0.05}s` }} />
              <div className="absolute left-0 top-0 h-full rounded-sm" style={{ width: on ? `${(a.red / max) * 100}%` : "0%", background: "#dc2626", boxShadow: "0 0 6px #dc2626", transition: `width .7s cubic-bezier(.2,.7,.2,1) ${i * 0.05 + 0.1}s` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── shared chrome ──────────────────────────────────────────────────────── */
function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="cave-brk rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cave-cy)" }}>{title}</span>
        {note && <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cave-dim)" }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: "var(--cave-cy)" }}>◤◢ {children}</span>
      <span className="h-px flex-1" style={{ background: "var(--cave-line)" }} />
    </div>
  );
}
function sum(a: number[]) { return a.reduce((s, n) => s + n, 0); }
function fmt(n: number) { return n.toLocaleString("en-US"); }
