"use client";

import { useCallback, useEffect, useState } from "react";

interface Psi {
  fetchedUrl: string;
  strategy: string;
  scores: { performance: number | null; seo: number | null; accessibility: number | null; bestPractices: number | null };
  metrics: Record<string, string | null>;
}

const scoreColor = (n: number | null) => (n == null ? "#94a3b8" : n >= 90 ? "#16a34a" : n >= 50 ? "#d97706" : "#dc2626");

function Ring({ label, value }: { label: string; value: number | null }) {
  const c = scoreColor(value);
  const pct = value ?? 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold tabular-nums"
        style={{ color: c, background: `conic-gradient(${c} ${pct * 3.6}deg, rgba(148,163,184,.18) 0deg)` }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">{value ?? "—"}</span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

export default function PageSpeedCard({ url, strategy = "desktop" }: { url: string | null; strategy?: "desktop" | "mobile" }) {
  const [data, setData] = useState<Psi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    if (!url) return;
    setLoading(true);
    setError(null);
    fetch(`/api/pagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [url, strategy]);

  useEffect(() => { run(); }, [run]);

  if (!url) return <div className="py-6 text-center text-sm text-slate-400">No website on file for this account.</div>;

  const CWV: { k: string; label: string }[] = [
    { k: "lcp", label: "LCP" },
    { k: "cls", label: "CLS" },
    { k: "tbt", label: "TBT" },
    { k: "fcp", label: "FCP" },
    { k: "speedIndex", label: "Speed Index" },
    { k: "tti", label: "Time to Interactive" },
  ];

  return (
    <div className="space-y-3">
      {loading && !data ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-400" />
          Running PageSpeed on the landing page…
        </div>
      ) : error ? (
        <div className="py-6 text-center text-sm">
          <div className="text-red-500">Couldn&apos;t run PageSpeed: {error}</div>
          <button onClick={run} className="mt-2 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">Retry</button>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Ring label="Perf" value={data.scores.performance} />
            <Ring label="SEO" value={data.scores.seo} />
            <Ring label="A11y" value={data.scores.accessibility} />
            <Ring label="Best Prac." value={data.scores.bestPractices} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {CWV.map(({ k, label }) => (
              <div key={k} className="rounded-md border border-slate-100 bg-white px-2 py-1.5 text-center">
                <div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div>
                <div className="text-xs font-semibold tabular-nums text-slate-700">{data.metrics[k] ?? "—"}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="truncate" title={data.fetchedUrl}>{data.strategy} · {data.fetchedUrl.replace(/^https?:\/\//, "")}</span>
            <button onClick={run} className="ml-2 shrink-0 rounded border border-slate-200 px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-50">Re-test</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
