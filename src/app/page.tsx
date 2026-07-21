import { getAccountsPayload } from "@/lib/data";
import CaveNav from "@/components/CaveNav";
import LandingDeck from "@/components/LandingDeck";

// Landing / home — the cover screen the team passes through daily. A cinematic
// hero (dual-persona, Batman ⇄ Bruce Wayne) over a live launchpad: book
// snapshot, quick-launch tiles, an at-risk board, and an Ask-Alfred prompt with
// data-aware suggestions. All figures are computed live from the book here and
// handed to the client deck as plain props.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type LandingStats = { total: number; greens: number; yellows: number; reds: number; avg: number; mrr: number };
export type RiskItem = { id: string; name: string; city: string | null; state: string | null; am: string | null; score: number | null; reason: string | null };

export default async function Landing() {
  let stats: LandingStats = { total: 0, greens: 0, yellows: 0, reds: 0, avg: 0, mrr: 0 };
  let atRisk: RiskItem[] = [];
  let suggestions: string[] = [];
  let source: "mock" | "metabase" = "mock";

  try {
    const p = await getAccountsPayload();
    const A = p.accounts;
    source = p.source;
    const reds = A.filter((a) => a.health.color === "red");
    const comps = A.map((a) => a.health.composite ?? 0).filter((n) => n > 0);
    const avg = comps.length ? comps.reduce((s, n) => s + n, 0) / comps.length : 0;
    const mrr = A.reduce((s, a) => s + (a.mrr ?? 0), 0);
    stats = {
      total: A.length,
      greens: A.filter((a) => a.health.color === "green").length,
      yellows: A.filter((a) => a.health.color === "yellow").length,
      reds: reds.length,
      avg: Math.round(avg * 10) / 10,
      mrr: Math.round(mrr),
    };
    atRisk = [...reds]
      .sort((a, b) => (a.health.composite ?? 999) - (b.health.composite ?? 999))
      .slice(0, 6)
      .map((a) => ({
        id: a.entityId,
        name: a.name,
        city: a.city,
        state: a.state,
        am: a.accountManager,
        score: a.health.composite,
        reason: a.health.reason,
      }));

    // AM carrying the most at-risk accounts → a data-aware Alfred suggestion
    const amCount: Record<string, number> = {};
    reds.forEach((a) => { if (a.accountManager) amCount[a.accountManager] = (amCount[a.accountManager] ?? 0) + 1; });
    const topAM = Object.entries(amCount).sort((x, y) => y[1] - x[1])[0]?.[0];
    const worst = atRisk[0];
    suggestions = [
      worst ? `Why is ${worst.name} at risk?` : `Which 3 accounts need attention most?`,
      `Give me a health summary of the book`,
      `Which accounts declined the most this month?`,
      topAM ? `How is ${topAM}'s book doing?` : `Compare the two worst accounts`,
    ];
  } catch {
    /* keep zeros if the book can't load */
  }

  return (
    <>
      <CaveNav />
      <LandingDeck stats={stats} atRisk={atRisk} suggestions={suggestions} source={source} />
    </>
  );
}
