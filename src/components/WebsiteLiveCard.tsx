"use client";

import { useCallback, useEffect, useState } from "react";

interface Check { ok: boolean; status: number | null; finalUrl: string | null; ms: number | null; error: string | null }

export default function WebsiteLiveCard({ url }: { url: string | null }) {
  const [data, setData] = useState<Check | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const run = useCallback(() => {
    if (!url) return;
    setLoading(true);
    setFailed(null);
    fetch(`/api/website-check?url=${encodeURIComponent(url)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d) => setData(d))
      .catch((e) => setFailed(String(e)))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { run(); }, [run]);

  if (!url) return <div className="py-4 text-center text-sm text-slate-400">No website on the GBP for this account.</div>;

  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const state = loading ? "checking" : failed ? "error" : data ? (data.ok ? "live" : "down") : "idle";
  const color = state === "live" ? "#16a34a" : state === "down" ? "#dc2626" : "#94a3b8";
  const label =
    state === "checking" ? "Checking…" :
    state === "live" ? `Live · ${data!.status}` :
    state === "down" ? (data!.error ? data!.error : `Not reachable · ${data!.status}`) :
    state === "error" ? "Check failed" : "—";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: loading ? "none" : `0 0 8px ${color}` }} />
        <span className="text-sm font-semibold" style={{ color }}>{label}</span>
        {data?.ms != null && !loading && state !== "error" && (
          <span className="text-[11px] tabular-nums text-slate-400">{(data.ms / 1000).toFixed(1)}s</span>
        )}
        <button onClick={run} className="ml-auto rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50">Re-check</button>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-indigo-600 no-underline hover:underline" title={url}>
        {host} ↗
      </a>
      {data?.finalUrl && data.finalUrl !== url && (
        <div className="truncate text-[10px] text-slate-400" title={data.finalUrl}>→ redirects to {(() => { try { return new URL(data.finalUrl!).hostname; } catch { return data.finalUrl; } })()}</div>
      )}
    </div>
  );
}
