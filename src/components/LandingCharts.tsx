"use client";

import { useEffect, useState } from "react";
import type { ChartData } from "@/app/page";

// Tactical readout for the landing deck — four live, animated bat-tech
// instruments built as custom SVG: a composite-score spectrum analyzer, a
// threat ring, a targeting radar of the book's health dimensions, and handler
// load bars. Everything is token-coloured (cyan in Batman, gold in Wayne) with
// fixed traffic-light semantics. Draw-in animates once on mount.
// Tier colours are persona-aware: Batman runs hot (electric red/amber/green);
// Bruce Wayne runs quiet-luxury (oxblood / brass / forest).
export type Tier = { red: string; yellow: string; green: string };
const BAT_TIER: Tier = { red: "#dc2626", yellow: "#d97706", green: "#16a34a" };
const WAYNE_TIER: Tier = { red: "#9e2b25", yellow: "#b7791f", green: "#2f6b4f" };

export default function LandingCharts({ charts, avg }: { charts: ChartData; avg: number }) {
  const [on, setOn] = useState(false);
  const [light, setLight] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const upd = () => setLight(document.documentElement.classList.contains("light"));
    upd();
    const obs = new MutationObserver(upd);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const tc = light ? WAYNE_TIER : BAT_TIER;

  return (
    <section className="mt-16">
      <SectionLabel>Tactical Readout</SectionLabel>
      <div className="grid gap-3">
        <Spectrum hist={charts.hist} on={on} vitals={charts.vitals} tc={tc} avg={avg} />
        <div className="grid gap-3 lg:grid-cols-3">
          <ThreatRing mix={charts.mix} on={on} tc={tc} />
          <DimRadar dims={charts.dims} on={on} />
          <HandlerLoad amLoad={charts.amLoad} on={on} tc={tc} />
        </div>
        <Funnel funnel={charts.funnel} on={on} />
        <div className="grid gap-3 lg:grid-cols-3">
          <RankBands bands={charts.rankBands} on={on} tc={tc} />
          <VisibilityGauge v={charts.visibility} on={on} />
          <MrrBands bands={charts.mrrBands} on={on} />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <MrrByTier mrr={charts.mrrTier} on={on} tc={tc} />
          <Signals lead={charts.leadSpark} review={charts.reviewSpark} on={on} />
          <Adoption a={charts.adoption} on={on} />
        </div>
      </div>
    </section>
  );
}

/* ── E · MRR by tier ────────────────────────────────────────────────────── */
function MrrByTier({ mrr, on, tc }: { mrr: { green: number; yellow: number; red: number }; on: boolean; tc: Tier }) {
  const tiers: { k: "red" | "yellow" | "green"; c: string; l: string }[] = [
    { k: "red", c: tc.red, l: "critical" },
    { k: "yellow", c: tc.yellow, l: "monitor" },
    { k: "green", c: tc.green, l: "healthy" },
  ];
  const max = Math.max(1, mrr.green, mrr.yellow, mrr.red);
  return (
    <Card title="MRR by Tier" note="revenue at risk">
      <div className="flex flex-col gap-3 pt-1">
        {tiers.map((t, i) => (
          <div key={t.k}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span style={{ color: "var(--cave-dim)" }}>{t.l}</span>
              <span className="tabular-nums font-semibold" style={{ color: "var(--cave-txt)" }}>${fmt(mrr[t.k])}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-sm" style={{ background: "var(--cave-line)" }}>
              <div className="h-full rounded-sm" style={{ width: on ? `${(mrr[t.k] / max) * 100}%` : "0%", background: t.c, boxShadow: `0 0 7px ${t.c}`, transition: `width .8s cubic-bezier(.2,.7,.2,1) ${i * 0.08}s` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── G · signal traces (lead / review distribution sparklines) ──────────── */
function Signals({ lead, review, on }: { lead: number[]; review: number[]; on: boolean }) {
  return (
    <Card title="Signal Traces" note="per-account · sorted">
      <Spark label="LEADS" data={lead} on={on} delay={0} />
      <Spark label="REVIEWS" data={review} on={on} delay={0.15} />
    </Card>
  );
}
function Spark({ label, data, on, delay }: { label: string; data: number[]; on: boolean; delay: number }) {
  const W = 300, H = 46;
  if (data.length < 2) return <div className="mt-1 text-[10px]" style={{ color: "var(--cave-dim)" }}>{label}: no signal</div>;
  const max = Math.max(1, ...data);
  const n = data.length;
  const pts = data.map((v, i) => [(i / (n - 1)) * W, H - 2 - (v / max) * (H - 6)] as [number, number]);
  const line = "M" + pts.map((p) => p.join(",")).join(" L");
  const area = `M0,${H} L` + pts.map((p) => p.join(",")).join(" L") + ` L${W},${H} Z`;
  const peak = Math.max(...data);
  const gid = `sg-${label}`;
  return (
    <div className="mt-1">
      <div className="mb-0.5 flex justify-between text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cave-dim)" }}>
        <span>{label}</span><span>peak {fmt(peak)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--cave-cy)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--cave-cy)" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill={`url(#${gid})`} style={{ opacity: on ? 1 : 0, transition: `opacity .6s ${delay}s` }} />
        <path d={line} fill="none" stroke="var(--cave-cy)" strokeWidth={1.5} pathLength={100} style={{ strokeDasharray: 100, strokeDashoffset: on ? 0 : 100, transition: `stroke-dashoffset 1s ease ${delay}s`, filter: "drop-shadow(0 0 4px var(--cave-cy))" }} />
        <circle cx={W} cy={pts[pts.length - 1][1]} r={2.5} fill="var(--cave-cy)" style={{ opacity: on ? 1 : 0, transition: `opacity .4s ${delay + 0.8}s` }} />
      </svg>
    </div>
  );
}

/* ── A · composite-score spectrum analyzer ──────────────────────────────── */
function Spectrum({ hist, on, vitals, tc, avg }: { hist: number[]; on: boolean; vitals: { leads: number; reviews: number }; tc: Tier; avg: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...hist);
  const W = 660, H = 200, padL = 30, padB = 26, padT = 14;
  const bw = (W - padL - 10) / hist.length;
  const barColor = (i: number) => (i < 4 ? tc.red : i < 7 ? tc.yellow : tc.green);
  const plotW = W - padL - 10;
  const avgX = padL + Math.max(0, Math.min(100, avg)) / 100 * plotW;
  return (
    <Card title="Composite Spectrum" note={`${sum(hist)} scored · leads ${fmt(vitals.leads)} · reviews ${fmt(vitals.reviews)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ maxHeight: 210 }} role="img" aria-label="Composite score distribution">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const y = padT + (H - padT - padB) * g;
          return <line key={g} x1={padL} y1={y} x2={W - 6} y2={y} stroke="var(--cave-line)" strokeWidth={1} opacity={0.5} />;
        })}
        {avg > 0 && (
          <g style={{ opacity: on ? 1 : 0, transition: "opacity .5s .5s" }}>
            <line x1={avgX} y1={padT} x2={avgX} y2={H - padB} stroke="var(--cave-cy)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.9} />
            <text x={avgX} y={padT - 3} textAnchor="middle" fontSize={9} fill="var(--cave-cy)">AVG {avg.toFixed(0)}</text>
          </g>
        )}
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
function ThreatRing({ mix, on, tc }: { mix: { green: number; yellow: number; red: number }; on: boolean; tc: Tier }) {
  const [hover, setHover] = useState<null | "green" | "yellow" | "red">(null);
  const total = Math.max(1, mix.green + mix.yellow + mix.red);
  const segs: { k: "green" | "yellow" | "red"; v: number; c: string }[] = [
    { k: "green", v: mix.green, c: tc.green },
    { k: "yellow", v: mix.yellow, c: tc.yellow },
    { k: "red", v: mix.red, c: tc.red },
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
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize={26} fontWeight={700} fill={center ? center.c : tc.red}>{center ? center.v : mix.red}</text>
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
        {/* rotating targeting sweep — batcomputer scope */}
        <g className="radar-sweep" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke="var(--cave-cy)" strokeWidth={1.4} opacity={0.55} />
          <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke="var(--cave-cy)" strokeWidth={6} opacity={0.1} />
        </g>
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
function HandlerLoad({ amLoad, on, tc }: { amLoad: { name: string; total: number; red: number }[]; on: boolean; tc: Tier }) {
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
                {a.total}{a.red > 0 && <span style={{ color: tc.red }}> · {a.red}▲</span>}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-sm" style={{ background: "var(--cave-line)" }}>
              <div className="absolute left-0 top-0 h-full rounded-sm" style={{ width: on ? `${(a.total / max) * 100}%` : "0%", background: "var(--cave-cy)", boxShadow: hover === i ? "0 0 8px var(--cave-cy)" : "none", transition: `width .7s cubic-bezier(.2,.7,.2,1) ${i * 0.05}s` }} />
              <div className="absolute left-0 top-0 h-full rounded-sm" style={{ width: on ? `${(a.red / max) * 100}%` : "0%", background: tc.red, boxShadow: `0 0 6px ${tc.red}`, transition: `width .7s cubic-bezier(.2,.7,.2,1) ${i * 0.05 + 0.1}s` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── H · acquisition funnel (book-wide click cascade → leads) ───────────── */
function Funnel({ funnel, on }: { funnel: { profile: number; website: number; book: number; leads: number }; on: boolean }) {
  const stages = [
    { k: "Profile views", v: funnel.profile },
    { k: "Website clicks", v: funnel.website },
    { k: "Book-online clicks", v: funnel.book },
    { k: "Leads", v: funnel.leads },
  ];
  const max = Math.max(1, funnel.profile);
  return (
    <Card title="Acquisition Funnel" note="book-wide totals">
      <div className="flex flex-col gap-2.5 pt-1">
        {stages.map((s, i) => {
          const pct = (s.v / max) * 100;
          const conv = i > 0 && stages[i - 1].v > 0 ? (s.v / stages[i - 1].v) * 100 : null;
          return (
            <div key={s.k}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--cave-dim)" }}>{s.k}</span>
                <span className="tabular-nums font-semibold" style={{ color: "var(--cave-txt)" }}>
                  {fmt(s.v)}{conv != null && <span style={{ color: "var(--cave-cy)" }}> · {conv.toFixed(1)}%</span>}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-sm" style={{ background: "var(--cave-line)" }}>
                <div className="h-full rounded-sm" style={{ width: on ? `${Math.max(pct, 0.7)}%` : "0%", background: "var(--cave-cy)", boxShadow: "0 0 8px var(--cave-cy)", transition: `width .85s cubic-bezier(.2,.7,.2,1) ${i * 0.09}s` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── I · keyword-rank bands (donut) ─────────────────────────────────────── */
function RankBands({ bands, on, tc }: { bands: { top3: number; r410: number; r1120: number; r20p: number }; on: boolean; tc: Tier }) {
  const [hover, setHover] = useState<number | null>(null);
  const segs = [
    { l: "Top 3", v: bands.top3, c: tc.green },
    { l: "4–10", v: bands.r410, c: "var(--cave-cy)" },
    { l: "11–20", v: bands.r1120, c: tc.yellow },
    { l: "20+", v: bands.r20p, c: tc.red },
  ];
  const total = Math.max(1, segs.reduce((s, x) => s + x.v, 0));
  let acc = 0;
  const R = 54, cx = 70, cy = 70;
  const center = hover != null ? segs[hover] : null;
  return (
    <Card title="Keyword Rank" note="avg current rank">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" width="132" height="132" style={{ transform: on ? "scale(1)" : "scale(.6)", opacity: on ? 1 : 0, transition: "transform .6s cubic-bezier(.2,.7,.2,1), opacity .6s" }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--cave-line)" strokeWidth={12} opacity={0.5} />
          {segs.map((s, i) => {
            const pct = (s.v / total) * 100;
            const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.c} strokeWidth={hover === i ? 15 : 12} pathLength={100} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc} transform={`rotate(-90 ${cx} ${cy})`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ filter: `drop-shadow(0 0 4px ${s.c})`, transition: "stroke-width .15s", cursor: "default" }} />;
            acc += pct;
            return el;
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={22} fontWeight={700} fill={center ? center.c : "var(--cave-cy)"}>{center ? center.v : bands.r20p}</text>
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize={8} letterSpacing="1" fill="var(--cave-dim)">{center ? center.l.toUpperCase() : "RANK 20+"}</text>
        </svg>
        <div className="flex flex-col gap-1.5 text-xs">
          {segs.map((s, i) => (
            <div key={i} className="flex items-center gap-2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />
              <span className="tabular-nums font-semibold" style={{ color: "var(--cave-txt)" }}>{s.v}</span>
              <span style={{ color: "var(--cave-dim)" }}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── J · visibility gauge (avg % keywords in top 3) ─────────────────────── */
function VisibilityGauge({ v, on }: { v: number; on: boolean }) {
  const val = Math.max(0, Math.min(100, v));
  const cx = 80, cy = 78, R = 56;
  // 180° gauge across the top: left (180°) → right (0°)
  const arc = (frac: number) => {
    const a = Math.PI * (1 - frac); // 0→π
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };
  const [ex, ey] = arc(1);
  const [sx, sy] = arc(0);
  const bg = `M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}`;
  const len = Math.PI * R;
  return (
    <Card title="Visibility" note="keywords ranking top-3">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 160 96" width="100%" height="96" role="img" aria-label="Visibility gauge">
          <path d={bg} fill="none" stroke="var(--cave-line)" strokeWidth={11} strokeLinecap="round" />
          <path d={bg} fill="none" stroke="var(--cave-cy)" strokeWidth={11} strokeLinecap="round" pathLength={100}
            strokeDasharray={`${val} 100`} style={{ strokeDashoffset: on ? 0 : val, transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1) .1s", filter: "drop-shadow(0 0 5px var(--cave-cy))" }} />
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize={26} fontWeight={700} fill="var(--cave-cy)">{val.toFixed(1)}%</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8.5} letterSpacing="1.4" fill="var(--cave-dim)">TOP-3 SHARE</text>
          <text x={cx - R} y={cy + 12} textAnchor="middle" fontSize={8} fill="var(--cave-dim)">0</text>
          <text x={cx + R} y={cy + 12} textAnchor="middle" fontSize={8} fill="var(--cave-dim)">100</text>
        </svg>
      </div>
    </Card>
  );
}

/* ── K · MRR distribution (bands) ───────────────────────────────────────── */
const MRR_BANDS = ["<$100", "$100–199", "$200–299", "$300–449", "$450+"];
function MrrBands({ bands, on }: { bands: number[]; on: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 130, padB = 24, padT = 12;
  const max = Math.max(1, ...bands);
  const bw = (W - 10) / bands.length;
  return (
    <Card title="MRR Distribution" note="accounts per band">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ maxHeight: 140 }} role="img" aria-label="MRR band distribution">
        {bands.map((c, i) => {
          const full = H - padT - padB;
          const h = (c / max) * full;
          const x = 5 + i * bw;
          const y = padT + (full - h);
          const hot = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <rect x={x + 3} y={y} width={bw - 8} height={Math.max(h, c > 0 ? 2 : 0)} rx={1.5} fill="var(--cave-cy)" style={{ transformBox: "fill-box", transformOrigin: "bottom", transform: on ? "scaleY(1)" : "scaleY(0)", transition: `transform .7s cubic-bezier(.2,.7,.2,1) ${i * 0.05}s`, filter: hot ? "drop-shadow(0 0 6px var(--cave-cy))" : "none", opacity: hover == null || hot ? 1 : 0.55 }} />
              <text x={x + (bw - 5) / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--cave-txt)">{c}</text>
              <text x={x + (bw - 5) / 2} y={H - 8} textAnchor="middle" fontSize={7.5} fill="var(--cave-dim)">{MRR_BANDS[i]}</text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

/* ── L · product adoption ───────────────────────────────────────────────── */
function Adoption({ a, on }: { a: { online: number; total: number; photos: number }; on: boolean }) {
  const pct = a.total ? Math.round((a.online / a.total) * 100) : 0;
  const C = 100, r = 26, cx = 34, cy = 34;
  return (
    <Card title="Adoption" note="online booking · media">
      <div className="flex items-center gap-4 pt-1">
        <svg viewBox="0 0 68 68" width="68" height="68" style={{ transform: on ? "scale(1)" : "scale(.6)", opacity: on ? 1 : 0, transition: "transform .6s, opacity .6s" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--cave-line)" strokeWidth={7} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--cave-cy)" strokeWidth={7} pathLength={C} strokeLinecap="round" strokeDasharray={`${pct} ${C - pct}`} transform={`rotate(-90 ${cx} ${cy})`} style={{ filter: "drop-shadow(0 0 4px var(--cave-cy))" }} />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--cave-cy)">{pct}%</text>
        </svg>
        <div className="flex flex-col gap-2 text-xs">
          <div><span className="tabular-nums text-lg font-semibold" style={{ color: "var(--cave-txt)" }}>{fmt(a.online)}</span> <span style={{ color: "var(--cave-dim)" }}>booking-active</span></div>
          <div><span className="tabular-nums text-lg font-semibold" style={{ color: "var(--cave-txt)" }}>{fmt(a.photos)}</span> <span style={{ color: "var(--cave-dim)" }}>photos uploaded</span></div>
        </div>
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
