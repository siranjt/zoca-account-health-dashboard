import { NextResponse } from "next/server";

// Google PageSpeed Insights proxy. Runs Lighthouse on a given URL and returns
// the category scores + Core Web Vitals. Cached in-memory per (strategy,url)
// for 6h so re-opening an account doesn't re-hit PSI. Optional PAGESPEED_API_KEY
// raises the rate limit; without it, PSI still works at low volume.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

interface PsiResult {
  url: string;
  strategy: "desktop" | "mobile";
  fetchedUrl: string;
  scores: { performance: number | null; seo: number | null; accessibility: number | null; bestPractices: number | null };
  metrics: Record<string, string | null>;
}

const cache = new Map<string, { at: number; data: PsiResult }>();
const TTL = 6 * 3600 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const strategy = searchParams.get("strategy") === "mobile" ? "mobile" : "desktop";
  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const key = `${strategy}:${url}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ ...hit.data, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", strategy);
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) api.searchParams.append("category", c);
  if (process.env.PAGESPEED_API_KEY) api.searchParams.set("key", process.env.PAGESPEED_API_KEY);

  try {
    const r = await fetch(api.toString(), { signal: AbortSignal.timeout(55_000) });
    if (r.status === 429) {
      // The shared keyless PSI quota is exhausted; a PAGESPEED_API_KEY gives a
      // private 25k/day quota. Surface a clear, actionable message.
      const msg = process.env.PAGESPEED_API_KEY
        ? "PageSpeed API quota reached — try again shortly."
        : "PageSpeed rate limit reached — add a free PAGESPEED_API_KEY env var for reliable scores.";
      return NextResponse.json({ error: msg, quota: true }, { status: 429 });
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return NextResponse.json({ error: `PageSpeed ${r.status}`, detail: body.slice(0, 200) }, { status: 502 });
    }
    const j = (await r.json()) as {
      lighthouseResult?: { finalUrl?: string; categories?: Record<string, { score?: number }>; audits?: Record<string, { displayValue?: string }> };
    };
    const lh = j.lighthouseResult ?? {};
    const cats = lh.categories ?? {};
    const audits = lh.audits ?? {};
    const score = (c?: { score?: number }) => (c && typeof c.score === "number" ? Math.round(c.score * 100) : null);
    const metric = (id: string) => audits[id]?.displayValue ?? null;
    const data: PsiResult = {
      url,
      strategy,
      fetchedUrl: lh.finalUrl ?? url,
      scores: {
        performance: score(cats.performance),
        seo: score(cats.seo),
        accessibility: score(cats.accessibility),
        bestPractices: score(cats["best-practices"]),
      },
      metrics: {
        lcp: metric("largest-contentful-paint"),
        fcp: metric("first-contentful-paint"),
        cls: metric("cumulative-layout-shift"),
        tbt: metric("total-blocking-time"),
        speedIndex: metric("speed-index"),
        tti: metric("interactive"),
      },
    };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "PageSpeed request failed", detail: String(e).slice(0, 200) }, { status: 502 });
  }
}
