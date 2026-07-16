import { VIZ, scoreColor } from "@/lib/theme";
import { formatNumber } from "@/lib/format";

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

// ---- multi-line (profile metrics) -----------------------------------------
export function MultiLineChart({
  xLabels,
  series,
}: {
  xLabels: string[];
  series: { name: string; color: string; values: number[] }[];
}) {
  const W = 520, H = 170, PL = 34, PR = 8, PT = 8, PB = 20;
  const n = xLabels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const ticks = [0, max / 2, max];
  return (
    <div>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth={1} />
            <text x={PL - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>{formatNumber(Math.round(t))}</text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          />
        ))}
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={VIZ.muted}>{xLabels[i]?.slice(5)}</text>
        ))}
      </svg>
    </div>
  );
}

// ---- leads (line) + reviews (bars), two aligned panels (no dual axis) -----
export function LeadsReviewsChart({ data }: { data: { mon: string; leads: number; reviews: number }[] }) {
  const W = 520, PL = 26, PR = 8;
  const n = data.length || 1;
  const lmax = niceMax(Math.max(1, ...data.map((d) => d.leads)));
  const rmax = niceMax(Math.max(1, ...data.map((d) => d.reviews)));
  const bw = (W - PL - PR) / n;
  const xc = (i: number) => PL + bw * (i + 0.5);
  const panel = (h: number, maxV: number, kind: "line" | "bar", color: string, key: (d: any) => number) => {
    const PT = 6, PB = 4;
    const y = (v: number) => PT + (1 - v / maxV) * (h - PT - PB);
    return (
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" style={{ maxHeight: h }} role="img">
        <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke={VIZ.baseline} strokeWidth={1} />
        <text x={PL - 3} y={y(maxV) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>{maxV}</text>
        {kind === "line" ? (
          <polyline points={data.map((d, i) => `${xc(i)},${y(key(d))}`).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        ) : (
          data.map((d, i) => {
            const v = key(d);
            return <rect key={i} x={xc(i) - bw * 0.3} y={y(v)} width={bw * 0.6} height={Math.max(0, y(0) - y(v))} rx={1.5} fill={color} />;
          })
        )}
      </svg>
    );
  };
  return (
    <div>
      <Legend items={[{ name: "Leads", color: VIZ.series[0] }, { name: "Reviews", color: VIZ.series[1] }]} />
      {panel(80, lmax, "line", VIZ.series[0], (d) => d.leads)}
      {panel(56, rmax, "bar", VIZ.series[1], (d) => d.reviews)}
      <div className="flex justify-between px-5 text-[9px] text-slate-400">
        <span>{data[0]?.mon}</span>
        <span>{data[data.length - 1]?.mon}</span>
      </div>
    </div>
  );
}

// ---- rank trend (single line, inverted: rank 1 at top = better) -----------
export function RankTrendChart({ data }: { data: { d: string; avgRank: number | null; top3: number | null }[] }) {
  const pts = data.filter((d) => d.avgRank != null) as { d: string; avgRank: number }[];
  const W = 520, H = 150, PL = 26, PR = 8, PT = 8, PB = 18;
  if (pts.length < 2) return <div className="py-8 text-center text-sm text-slate-400">Not enough rank history.</div>;
  const n = pts.length;
  const maxR = Math.max(...pts.map((p) => p.avgRank), 5);
  const x = (i: number) => PL + (i / (n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + ((v - 1) / (maxR - 1)) * (H - PT - PB); // rank 1 at top
  const ticks = [1, Math.round(maxR / 2), Math.round(maxR)];
  return (
    <div>
      <Legend items={[{ name: "Avg rank (lower = better)", color: VIZ.series[0] }]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 170 }} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth={1} />
            <text x={PL - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>#{t}</text>
          </g>
        ))}
        <polyline points={pts.map((p, i) => `${x(i)},${y(p.avgRank)}`).join(" ")} fill="none" stroke={VIZ.series[0]} strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.avgRank)} r={2} fill={VIZ.series[0]} />)}
        {[0, n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : "end"} fontSize={9} fill={VIZ.muted}>{pts[i].d.slice(5)}</text>
        ))}
      </svg>
    </div>
  );
}

// ---- lead → booking funnel (horizontal bars, ordinal blue ramp) -----------
const RAMP = ["#2a78d6", "#3987e5", "#5598e7", "#86b6ef"];
export function FunnelChart({ f }: { f: { enquiries: number; opened: number; contacted: number; booked: number } }) {
  const rows = [
    { label: "Enquiries", v: f.enquiries },
    { label: "Opened", v: f.opened },
    { label: "Contacted", v: f.contacted },
    { label: "Booked", v: f.booked },
  ];
  const max = Math.max(1, f.enquiries);
  const conv = f.enquiries ? Math.round((f.booked / f.enquiries) * 100) : 0;
  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">Booking conversion: <span className="font-semibold text-slate-700">{conv}%</span></div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-slate-500">{r.label}</span>
            <div className="h-4 flex-1 rounded bg-slate-100">
              <div className="h-4 rounded" style={{ width: `${(r.v / max) * 100}%`, background: RAMP[i], minWidth: r.v > 0 ? 2 : 0 }} />
            </div>
            <span className="w-8 shrink-0 text-right font-medium tabular-nums text-slate-700">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- health sub-score bars -------------------------------------------------
export function HealthBars({
  engagement, value, product, composite, tier, reason,
}: {
  engagement: number | null; value: number | null; product: number | null;
  composite: number | null; tier: string; reason: string | null;
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
          <div key={b.label} className="flex items-center gap-2 text-xs">
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
