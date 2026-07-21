import { getAccountsPayload } from "@/lib/data";
import CaveNav from "@/components/CaveNav";
import LandingDeck from "@/components/LandingDeck";

// Landing / home — the cover screen the team passes through daily. A cinematic
// hero (dual-persona, Batman ⇄ Bruce Wayne) over a live launchpad + a tactical
// readout of live charts. All figures are computed live from the book here and
// handed to the client deck as plain props.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type LandingStats = { total: number; greens: number; yellows: number; reds: number; avg: number; mrr: number };
export type RiskItem = { id: string; name: string; city: string | null; state: string | null; am: string | null; score: number | null; reason: string | null };
export type ChartData = {
  hist: number[]; // 10 buckets of composite score (0-9 → 0-100)
  mix: { green: number; yellow: number; red: number };
  dims: { engagement: number; value: number; product: number };
  amLoad: { name: string; total: number; red: number }[];
  vitals: { leads: number; reviews: number };
  mrrTier: { green: number; yellow: number; red: number };
  geo: { lat: number; lng: number; c: "green" | "yellow" | "red" }[];
  leadSpark: number[];
  reviewSpark: number[];
};

export default async function Landing() {
  let stats: LandingStats = { total: 0, greens: 0, yellows: 0, reds: 0, avg: 0, mrr: 0 };
  let atRisk: RiskItem[] = [];
  let suggestions: string[] = [];
  let charts: ChartData = { hist: Array(10).fill(0), mix: { green: 0, yellow: 0, red: 0 }, dims: { engagement: 0, value: 0, product: 0 }, amLoad: [], vitals: { leads: 0, reviews: 0 }, mrrTier: { green: 0, yellow: 0, red: 0 }, geo: [], leadSpark: [], reviewSpark: [] };
  let source: "mock" | "metabase" = "mock";

  try {
    const p = await getAccountsPayload();
    const A = p.accounts;
    source = p.source;
    const reds = A.filter((a) => a.health.color === "red");
    const greens = A.filter((a) => a.health.color === "green").length;
    const yellows = A.filter((a) => a.health.color === "yellow").length;
    const comps = A.map((a) => a.health.composite ?? 0).filter((n) => n > 0);
    const avg = comps.length ? comps.reduce((s, n) => s + n, 0) / comps.length : 0;
    const mrr = A.reduce((s, a) => s + (a.mrr ?? 0), 0);
    stats = { total: A.length, greens, yellows, reds: reds.length, avg: Math.round(avg * 10) / 10, mrr: Math.round(mrr) };

    atRisk = [...reds]
      .sort((a, b) => (a.health.composite ?? 999) - (b.health.composite ?? 999))
      .slice(0, 6)
      .map((a) => ({ id: a.entityId, name: a.name, city: a.city, state: a.state, am: a.accountManager, score: a.health.composite, reason: a.health.reason }));

    // ── chart aggregations (no extra queries — all from the book in memory) ──
    const hist = Array(10).fill(0);
    A.forEach((a) => { const c = a.health.composite; if (c != null && c >= 0) hist[Math.min(9, Math.floor(c / 10))]++; });
    const avgOf = (sel: (a: (typeof A)[number]) => number | null | undefined) => {
      const v = A.map(sel).filter((n): n is number => n != null && n > 0);
      return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : 0;
    };
    const dims = { engagement: avgOf((a) => a.health.engagement), value: avgOf((a) => a.health.value), product: avgOf((a) => a.health.product) };
    const amMap: Record<string, { name: string; total: number; red: number }> = {};
    A.forEach((a) => {
      const m = a.accountManager || "Unassigned";
      (amMap[m] ??= { name: m, total: 0, red: 0 }).total++;
      if (a.health.color === "red") amMap[m].red++;
    });
    const amLoad = Object.values(amMap).sort((x, y) => y.total - x.total).slice(0, 6);
    const vitals = { leads: A.reduce((s, a) => s + (a.leadsReceived || 0), 0), reviews: A.reduce((s, a) => s + (a.reviewsReceived || 0), 0) };
    // MRR grouped by health tier (how much revenue sits in each colour)
    const mrrTier = { green: 0, yellow: 0, red: 0 };
    A.forEach((a) => { mrrTier[a.health.color] += a.mrr || 0; });
    (Object.keys(mrrTier) as (keyof typeof mrrTier)[]).forEach((k) => { mrrTier[k] = Math.round(mrrTier[k]); });
    // geo blips (accounts with real coords), coloured by tier
    const geo = A.filter((a) => a.lat != null && a.lng != null).map((a) => ({ lat: a.lat as number, lng: a.lng as number, c: a.health.color }));
    // per-account signal distributions (sorted desc, downsampled to 64 points)
    const ds = (arr: number[], n = 64) => {
      const s = [...arr].sort((x, y) => y - x);
      if (s.length <= n) return s;
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push(s[Math.floor((i * (s.length - 1)) / (n - 1))]);
      return out;
    };
    const leadSpark = ds(A.map((a) => a.leadsReceived || 0));
    const reviewSpark = ds(A.map((a) => a.reviewsReceived || 0));
    charts = { hist, mix: { green: greens, yellow: yellows, red: reds.length }, dims, amLoad, vitals, mrrTier, geo, leadSpark, reviewSpark };

    // AM carrying the most at-risk accounts → a data-aware Alfred suggestion
    const topAM = [...amLoad].sort((x, y) => y.red - x.red)[0];
    const worst = atRisk[0];
    suggestions = [
      worst ? `Why is ${worst.name} at risk?` : `Which 3 accounts need attention most?`,
      `Give me a health summary of the book`,
      `Which accounts declined the most this month?`,
      topAM && topAM.red > 0 ? `How is ${topAM.name}'s book doing?` : `Compare the two worst accounts`,
    ];
  } catch {
    /* keep zeros if the book can't load */
  }

  return (
    <>
      <CaveNav />
      <LandingDeck stats={stats} atRisk={atRisk} suggestions={suggestions} charts={charts} source={source} />
    </>
  );
}
