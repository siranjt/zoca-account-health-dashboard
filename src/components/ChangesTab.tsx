"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangesPayload } from "@/lib/changes";

const SOURCE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  Profile: { bg: "rgba(53,224,255,.14)", fg: "#35e0ff", icon: "🏢" },
  Services: { bg: "rgba(22,163,74,.16)", fg: "#22c55e", icon: "💇" },
  FAQs: { bg: "rgba(217,119,6,.16)", fg: "#f59e0b", icon: "❓" },
  Website: { bg: "rgba(99,102,241,.16)", fg: "#818cf8", icon: "🌐" },
  CTAs: { bg: "rgba(168,85,247,.16)", fg: "#c084fc", icon: "🔘" },
  Media: { bg: "rgba(236,72,153,.16)", fg: "#ec4899", icon: "🖼️" },
};
const styleFor = (t: string) => SOURCE_STYLE[t] ?? { bg: "var(--cave-line)", fg: "#a7c3c8", icon: "•" };

function ddmmyyhm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// tidy a raw value for display: unwrap JSON scalars, collapse whitespace
function pretty(v: string | null): string {
  if (v == null) return "∅";
  const s = v.trim();
  if (s === "" ) return "∅";
  if (s === "null") return "∅";
  try {
    const j = JSON.parse(s);
    if (j == null) return "∅";
    if (typeof j === "object") return JSON.stringify(j);
    return String(j);
  } catch {
    return s;
  }
}

export default function ChangesTab({ entityId, windowDays }: { entityId: string; windowDays: number }) {
  const [data, setData] = useState<ChangesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setFilter("all");
    setOpen(new Set());
    fetch(`/api/account/${entityId}/changes?window=${windowDays}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [entityId, windowDays]);

  const shown = useMemo(
    () => (data ? (filter === "all" ? data.entries : data.entries.filter((e) => e.source === filter)) : []),
    [data, filter]
  );

  return (
    <div className="space-y-4">
      {error ? (
        <div className="py-8 text-center text-sm text-red-500">Couldn&apos;t load changes: {error}</div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-400" />
          Gathering edits across profile, services, website, FAQs, CTAs &amp; media…
        </div>
      ) : (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>Changes Log</span>
            <span className="text-xs text-slate-400">· {data.total} change{data.total === 1 ? "" : "s"} · last {data.windowDays}d{data.capped ? ` (showing ${data.entries.length})` : ""}</span>
          </div>

          {data.total === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No edits in this window. Try a wider window.</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Chip label={`All ${data.total}`} active={filter === "all"} onClick={() => setFilter("all")} />
                {Object.keys(data.bySource).map((t) => {
                  const s = styleFor(t);
                  return (
                    <Chip key={t} label={`${s.icon} ${t} ${data.bySource[t]}`} active={filter === t} onClick={() => setFilter(t)} color={s.fg} />
                  );
                })}
              </div>

              <div className="table-scroll max-h-[620px] space-y-2 overflow-auto pr-1">
                {shown.map((e, i) => {
                  const s = styleFor(e.source);
                  const isOpen = open.has(i);
                  const oldV = pretty(e.oldValue);
                  const newV = pretty(e.newValue);
                  const long = oldV.length + newV.length > 200;
                  return (
                    <div key={i} className="rounded-lg border border-slate-100 bg-white p-2.5">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: s.bg, color: s.fg }}>
                          {s.icon} {e.source}
                        </span>
                        <span className="font-medium text-slate-700">{e.field}</span>
                        {e.label && <span className="text-slate-400">· {e.label}</span>}
                        <span className="ml-auto tabular-nums text-slate-400">{ddmmyyhm(e.at)}</span>
                      </div>
                      <div className={`grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-xs ${isOpen || !long ? "" : "max-h-16 overflow-hidden"}`}>
                        <div className="min-w-0 break-words rounded bg-red-50 px-2 py-1 text-red-700 line-through decoration-red-300">{oldV}</div>
                        <div className="pt-1 text-slate-300">→</div>
                        <div className="min-w-0 break-words rounded bg-green-50 px-2 py-1 text-green-700">{newV}</div>
                      </div>
                      {long && (
                        <button
                          onClick={() => setOpen((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                          className="mt-1 text-[11px] font-medium text-indigo-600 hover:underline"
                        >
                          {isOpen ? "show less" : "show more"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={
        active
          ? { borderColor: color ?? "var(--cave-cy)", color: color ?? "var(--cave-cy)", background: "rgba(53,224,255,.08)" }
          : { borderColor: "var(--cave-line)", color: "#a7c3c8" }
      }
    >
      {label}
    </button>
  );
}
