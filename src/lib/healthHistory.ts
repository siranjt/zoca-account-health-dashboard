import "server-only";
import Papa from "papaparse";

// ===========================================================================
// Per-account health-score HISTORY — the weekly composite/tier snapshots from
// the warehouse (public Metabase CSV). Powers the Trends "Account health over
// time" view: book trajectory, decliners (biggest recent drop), and a single
// account's line. Read-only over the warehouse's own recorded scores — no
// health is computed here (see CLAUDE.md rule #4). Cached like tickets.ts.
// ===========================================================================

const CSV_URL = "https://metabase.zoca.ai/public/question/96e1066a-32cc-4ef9-a919-090ce6755a07.csv";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — the data only changes weekly
const TIMEOUT_MS = 45_000;

export interface HealthPoint { d: string; c: number; tier: string }
export interface HealthAccount { entityId: string; name: string; am: string; points: HealthPoint[] }
interface HealthData { accounts: Map<string, HealthAccount>; days: string[] }

const num = (s: string | undefined) => { const n = Number(s); return Number.isFinite(n) ? n : null; };

let cache: { data: HealthData; ts: number } | null = null;
let inflight: Promise<HealthData> | null = null;

async function load(): Promise<HealthData> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(CSV_URL, { signal: ctrl.signal, cache: "no-store", redirect: "follow" });
      if (!r.ok) throw new Error(`health-history CSV ${r.status}`);
      const csv = await r.text();
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      const accounts = new Map<string, HealthAccount>();
      const daySet = new Set<string>();
      for (const row of parsed.data || []) {
        const id = (row["Entity ID"] || "").trim();
        const c = num(row["Composite Health Score"]);
        const at = row["Recorded At"] || "";
        if (!id || c == null || !at) continue;
        const d = at.slice(0, 10);
        daySet.add(d);
        let acc = accounts.get(id);
        if (!acc) { acc = { entityId: id, name: row["Gbp Title"] || "(unnamed)", am: row["Am Name"] || "", points: [] }; accounts.set(id, acc); }
        acc.points.push({ d, c, tier: row["Health Tier"] || "" });
      }
      for (const acc of accounts.values()) acc.points.sort((a, b) => a.d.localeCompare(b.d));
      const data: HealthData = { accounts, days: Array.from(daySet).sort() };
      cache = { data, ts: Date.now() };
      return data;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

const tierColor = (t: string): "green" | "yellow" | "red" => {
  const T = t.toUpperCase();
  if (T.startsWith("HEALTHY") || T.startsWith("THRIVING")) return "green";
  if (T.startsWith("MONITOR")) return "yellow";
  return "red"; // AT-RISK, CRITICAL
};

function inScope(am: string, viewer: { role: string | null; amName: string | null }): boolean {
  if (viewer.role === "am") return !!viewer.amName && am === viewer.amName;
  return true; // manager / admin
}

export interface Decliner { entityId: string; name: string; am: string; latest: number; prev: number; delta: number; tier: string; spark: number[] }
export interface TrajectoryPoint { d: string; avg: number; green: number; yellow: number; red: number; n: number }

export interface HealthHistoryPayload {
  configured: boolean;
  days: string[];
  lookbackWeeks: number;
  trajectory: TrajectoryPoint[];
  decliners: Decliner[];
  scopedAccounts: number;
}

/** Book trajectory + decliners, scoped to the viewer. lookback = snapshots back
 *  for the "recent drop" comparison (default 4 ≈ 1 month). */
export async function getHealthHistory(
  viewer: { role: string | null; amName: string | null },
  opts: { lookback?: number; limit?: number } = {},
): Promise<HealthHistoryPayload> {
  const lookback = Math.max(1, Math.min(19, Math.round(opts.lookback ?? 4)));
  const limit = Math.max(1, Math.min(100, Math.round(opts.limit ?? 25)));
  let data: HealthData;
  try { data = await load(); } catch { return { configured: false, days: [], lookbackWeeks: lookback, trajectory: [], decliners: [], scopedAccounts: 0 }; }

  const scoped = Array.from(data.accounts.values()).filter((a) => inScope(a.am, viewer));

  // book trajectory: per snapshot day, avg composite + tier mix (scoped)
  const byDay = new Map<string, { sum: number; n: number; green: number; yellow: number; red: number }>();
  for (const a of scoped) {
    for (const p of a.points) {
      const b = byDay.get(p.d) ?? { sum: 0, n: 0, green: 0, yellow: 0, red: 0 };
      b.sum += p.c; b.n += 1; b[tierColor(p.tier)] += 1;
      byDay.set(p.d, b);
    }
  }
  const trajectory: TrajectoryPoint[] = data.days
    .filter((d) => byDay.has(d))
    .map((d) => { const b = byDay.get(d)!; return { d, avg: Math.round((b.sum / b.n) * 10) / 10, green: b.green, yellow: b.yellow, red: b.red, n: b.n }; });

  // decliners: latest vs `lookback` snapshots earlier, biggest drop first
  const decliners: Decliner[] = scoped
    .map((a): Decliner | null => {
      const pts = a.points;
      if (pts.length < 2) return null;
      const latest = pts[pts.length - 1];
      const prev = pts[Math.max(0, pts.length - 1 - lookback)];
      const delta = Math.round((latest.c - prev.c) * 10) / 10;
      return { entityId: a.entityId, name: a.name, am: a.am, latest: latest.c, prev: prev.c, delta, tier: latest.tier, spark: pts.map((p) => p.c) };
    })
    .filter((x): x is Decliner => !!x && x.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);

  return { configured: true, days: data.days, lookbackWeeks: lookback, trajectory, decliners, scopedAccounts: scoped.length };
}

/** One account's full health line (scoped). */
export async function getHealthSeries(
  entityId: string,
  viewer: { role: string | null; amName: string | null },
): Promise<{ entityId: string; name: string; am: string; points: HealthPoint[] } | null> {
  let data: HealthData;
  try { data = await load(); } catch { return null; }
  const a = data.accounts.get(entityId.trim());
  if (!a || !inScope(a.am, viewer)) return null;
  return { entityId: a.entityId, name: a.name, am: a.am, points: a.points };
}
