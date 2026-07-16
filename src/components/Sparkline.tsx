import { VIZ } from "@/lib/theme";
import type { Delta } from "@/lib/types";

/** Tiny inline trend line for a row cell. */
export function Sparkline({
  data,
  color = VIZ.series[0],
  width = 78,
  height = 22,
}: {
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) {
    return <span className="text-slate-300">—</span>;
  }
  const pad = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = (width - pad * 2) / (data.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const pts = data.map((v, i) => `${pad + i * step},${y(v)}`).join(" ");
  const last = data[data.length - 1];
  return (
    <svg width={width} height={height} className="inline-block align-middle" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pad + (data.length - 1) * step} cy={y(last)} r={2.2} fill={color} />
    </svg>
  );
}

/** ▲/▼ change vs previous period. invert=true means "down is good" (e.g. rank). */
export function DeltaBadge({ delta, invert = false }: { delta?: Delta; invert?: boolean }) {
  if (!delta) return null;
  const { cur, prev } = delta;
  if (prev === 0 && cur === 0) return <span className="text-slate-300 text-xs">·</span>;
  if (prev === 0) return <span className="text-xs font-medium text-emerald-700">new</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="text-slate-400 text-xs">0%</span>;
  const up = pct > 0;
  const good = invert ? !up : up;
  const color = good ? VIZ.deltaUp : VIZ.deltaDown;
  return (
    <span className="text-xs font-medium tabular-nums" style={{ color }} title={`${prev} → ${cur} vs previous period`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}
