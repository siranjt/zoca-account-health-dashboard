"use client";

import { useEffect, useMemo, useState } from "react";
import type { CommsPayload } from "@/lib/comms";
import AiAssist from "./AiAssist";

const TYPE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  "App Chat": { bg: "rgba(53,224,255,.14)", fg: "#35e0ff", icon: "💬" },
  Call: { bg: "rgba(22,163,74,.16)", fg: "#22c55e", icon: "📞" },
  SMS: { bg: "rgba(217,119,6,.16)", fg: "#f59e0b", icon: "✉️" },
  Email: { bg: "rgba(99,102,241,.16)", fg: "#818cf8", icon: "📧" },
  "Meeting (Fireflies)": { bg: "rgba(168,85,247,.16)", fg: "#c084fc", icon: "🎥" },
  "Demo Call": { bg: "rgba(168,85,247,.16)", fg: "#c084fc", icon: "🎬" },
  "Customer Meeting": { bg: "rgba(168,85,247,.16)", fg: "#c084fc", icon: "🎥" },
};
const styleFor = (t: string) => TYPE_STYLE[t] ?? { bg: "var(--cave-line)", fg: "#a7c3c8", icon: "•" };

function ddmmyyhm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CommunicationTab({ entityId, windowDays }: { entityId: string; windowDays: number }) {
  const [data, setData] = useState<CommsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [openTix, setOpenTix] = useState<Set<number>>(new Set());
  const [focusBody, setFocusBody] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setFilter("all");
    setOpen(new Set());
    fetch(`/api/account/${entityId}/comms?window=${windowDays}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [entityId, windowDays]);

  const shown = useMemo(
    () => (data ? (filter === "all" ? data.messages : data.messages.filter((m) => m.type === filter)) : []),
    [data, filter]
  );

  return (
    <div className="space-y-4">
      <div id="cave-ai-assist">
        <AiAssist entityId={entityId} windowDays={windowDays} focusBody={focusBody} onClearFocus={() => setFocusBody(null)} />
      </div>

      {error ? (
        <div className="py-8 text-center text-sm text-red-500">Couldn&apos;t load communication: {error}</div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-400" />
          Gathering messages across chat, calls, SMS, email &amp; meetings…
        </div>
      ) : (
        <>
      {/* ── Message History ─────────────────────────────────────────────── */}
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>Message History</span>
          <span className="text-xs text-slate-400">· {data.total} message{data.total === 1 ? "" : "s"} · last {data.windowDays}d{data.capped ? ` (showing ${data.messages.length})` : ""}</span>
        </div>

        {data.total === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No communication in this window. Try a wider window.</div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Chip label={`All ${data.total}`} active={filter === "all"} onClick={() => setFilter("all")} />
              {Object.keys(data.byType).map((t) => {
                const s = styleFor(t);
                return (
                  <Chip
                    key={t}
                    label={`${s.icon} ${t} ${data.byType[t]}`}
                    active={filter === t}
                    onClick={() => setFilter(t)}
                    color={s.fg}
                  />
                );
              })}
            </div>

            <div className="table-scroll max-h-[620px] space-y-2 overflow-auto pr-1">
              {shown.map((m, i) => {
                const s = styleFor(m.type);
                const isOpen = open.has(i);
                const body = m.body ?? "";
                const long = body.length > 260;
                return (
                  <div key={i} className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: s.bg, color: s.fg }}>
                        {s.icon} {m.type}
                      </span>
                      {m.sender && <span className="text-slate-500">{m.sender}</span>}
                      <span className="ml-auto tabular-nums text-slate-400">{ddmmyyhm(m.at)}</span>
                      {m.body && (
                        <button
                          onClick={() => { setFocusBody(m.body || ""); document.getElementById("cave-ai-assist")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                          title="Focus AI Assist on this message"
                          className="text-[11px] text-slate-400 hover:text-cyan-400"
                        >
                          🎯
                        </button>
                      )}
                    </div>
                    {body ? (
                      <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
                        {isOpen || !long ? body : body.slice(0, 260) + "…"}
                        {long && (
                          <button
                            onClick={() =>
                              setOpen((prev) => {
                                const n = new Set(prev);
                                n.has(i) ? n.delete(i) : n.add(i);
                                return n;
                              })
                            }
                            className="ml-1 font-medium text-indigo-600 hover:underline"
                          >
                            {isOpen ? "show less" : "show more"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs italic text-slate-400">No text captured.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Linear Tickets ──────────────────────────────────────────────── */}
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>Linear Tickets</span>
          <span className="text-xs text-slate-400">· {data.tickets.length} ticket{data.tickets.length === 1 ? "" : "s"} (all-time)</span>
        </div>
        {data.tickets.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">No Linear tickets linked to this account.</div>
        ) : (
          <div className="space-y-2">
            {data.tickets.map((t, i) => {
              const isOpen = openTix.has(i);
              const desc = t.description ?? "";
              const long = desc.length > 200;
              return (
                <div key={i} className="rounded-lg border border-slate-100 bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StateBadge state={t.state} />
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 no-underline hover:underline" title="Open in Linear">
                        {t.title ?? "—"} ↗
                      </a>
                    ) : (
                      <span className="font-medium text-slate-700">{t.title ?? "—"}</span>
                    )}
                    {t.assignee && <span className="text-slate-400">· {t.assignee}</span>}
                    <span className="ml-auto tabular-nums text-slate-400">{t.createdAt ? ddmmyyhm(t.createdAt) : "—"}</span>
                  </div>
                  {desc && (
                    <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500">
                      {isOpen || !long ? desc : desc.slice(0, 200) + "…"}
                      {long && (
                        <button
                          onClick={() =>
                            setOpenTix((prev) => {
                              const n = new Set(prev);
                              n.has(i) ? n.delete(i) : n.add(i);
                              return n;
                            })
                          }
                          className="ml-1 font-medium text-indigo-600 hover:underline"
                        >
                          {isOpen ? "show less" : "show more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
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

function StateBadge({ state }: { state: string | null }) {
  const s = (state ?? "").toLowerCase();
  const done = /done|complete|closed|cancel/.test(s);
  const active = /progress|started|review/.test(s);
  const color = done ? "#22c55e" : active ? "#f59e0b" : "#818cf8";
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
      {state ?? "—"}
    </span>
  );
}
