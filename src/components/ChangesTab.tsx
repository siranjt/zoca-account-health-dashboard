"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEntry, ChangesPayload } from "@/lib/changes";

// Section order + titles mirror the Retool "SP Changes Log" app.
const GROUPS: { source: string; title: string; icon: string }[] = [
  { source: "Profile", title: "GBP Updates", icon: "🏢" },
  { source: "Website", title: "Website Location Updates", icon: "🌐" },
  { source: "Services", title: "Service Updates", icon: "💇" },
  { source: "FAQs", title: "FAQ Updates", icon: "❓" },
  { source: "CTAs", title: "CTA Updates", icon: "🔘" },
  { source: "Media", title: "Media Updates", icon: "🖼️" },
];

function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

const show = (v: string | null) => (v == null || v === "" ? "—" : v);

export default function ChangesTab({ entityId, windowDays }: { entityId: string; windowDays: number }) {
  const [data, setData] = useState<ChangesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setOpenRow(null);
    fetch(`/api/account/${entityId}/changes?window=${windowDays}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [entityId, windowDays]);

  const grouped = useMemo(() => {
    const m = new Map<string, ChangeEntry[]>();
    if (data)
      for (const e of data.entries) {
        const arr = m.get(e.source);
        if (arr) arr.push(e);
        else m.set(e.source, [e]);
      }
    return m;
  }, [data]);

  if (error) return <div className="py-8 text-center text-sm text-red-500">Couldn&apos;t load changes: {error}</div>;
  if (!data)
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-400" />
        Gathering edits across profile, services, website, FAQs, CTAs &amp; media…
      </div>
    );

  const activeGroups = GROUPS.filter((g) => (grouped.get(g.source)?.length ?? 0) > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>Changes Log</span>
        <span className="text-xs text-slate-400">· {data.total} change{data.total === 1 ? "" : "s"} across {activeGroups.length} area{activeGroups.length === 1 ? "" : "s"} · last {data.windowDays}d{data.capped ? " (most recent 800)" : ""}</span>
      </div>

      {data.total === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">No edits in this window. Try a wider window.</div>
      ) : (
        activeGroups.map((g) => {
          const rows = grouped.get(g.source)!;
          return (
            <section key={g.source}>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span>{g.icon}</span>
                <span>{g.title}</span>
                <span className="text-xs font-normal text-slate-400">· {rows.length}</span>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Updated at</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Old value</th>
                      <th className="px-3 py-2 font-medium">New value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => {
                      const key = `${g.source}-${i}`;
                      const isOpen = openRow === key;
                      const cellCls = isOpen
                        ? "px-3 py-2 align-top font-mono text-[11px] whitespace-pre-wrap break-all"
                        : "px-3 py-2 align-top font-mono text-[11px] max-w-[420px] truncate";
                      return (
                        <tr
                          key={key}
                          onClick={() => setOpenRow(isOpen ? null : key)}
                          className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                          title={isOpen ? "Collapse" : "Click to expand full values"}
                        >
                          <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-500">{ddmmyy(e.at)}</td>
                          <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-slate-700">
                            {e.field}
                            {e.label && <div className="text-[10px] font-normal text-slate-400">{e.label}</div>}
                          </td>
                          <td className={`${cellCls} text-rose-700`}>{show(e.oldValue)}</td>
                          <td className={`${cellCls} text-emerald-700`}>{show(e.newValue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
