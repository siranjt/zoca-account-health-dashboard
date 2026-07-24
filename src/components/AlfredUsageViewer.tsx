"use client";

import { useCallback, useEffect, useState } from "react";

interface Summary { total: number; users: number; avg_ms: number; tok_in: number; tok_out: number }
interface Asker { label: string; email: string | null; n: number }
interface Named { name?: string; tool?: string; n: number }
interface Convo {
  id: number; ts: string; email: string | null; name: string | null; am_name: string | null; role: string | null;
  question: string; reply: string; tools: string[] | null; entities: { name: string }[] | null;
  status: string | null; latency_ms: number | null; tokens_in: number | null; tokens_out: number | null; model: string | null;
}

const WINDOWS = [7, 30, 90, 365];
const fmt = (n: number) => n.toLocaleString();
function when(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AlfredUsageViewer() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [askers, setAskers] = useState<Asker[]>([]);
  const [accounts, setAccounts] = useState<Named[]>([]);
  const [tools, setTools] = useState<Named[]>([]);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [user, setUser] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ days: String(days), limit: "150" });
    if (user) qs.set("user", user);
    if (q.trim()) qs.set("q", q.trim());
    fetch(`/api/admin/alfred?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary);
        setAskers(d.askers || []);
        setAccounts(d.accounts || []);
        setTools(d.tools || []);
        setConvos(d.conversations || []);
        setNote(d.reason || null);
      })
      .catch((e) => setNote(String(e)))
      .finally(() => setLoading(false));
  }, [days, user, q]);

  useEffect(() => { load(); }, [days, user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {WINDOWS.map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 text-xs font-medium ${days === d ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{d}d</button>
          ))}
        </div>
        <select value={user} onChange={(e) => setUser(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">All people</option>
          {askers.filter((a) => a.email).map((a) => <option key={a.email} value={a.email!}>{a.label} ({a.n})</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search question / reply…" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" />
        <button onClick={load} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">Search</button>
        <span className="text-xs text-slate-400">{loading ? "loading…" : `${convos.length} shown`}</span>
      </div>

      {note && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{note}</div>}

      {/* summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Conversations" value={summary ? fmt(summary.total) : "—"} />
        <Kpi label="People" value={summary ? fmt(summary.users) : "—"} />
        <Kpi label="Avg latency" value={summary ? `${(summary.avg_ms / 1000).toFixed(1)}s` : "—"} />
        <Kpi label="Tokens in" value={summary ? fmt(Number(summary.tok_in)) : "—"} />
        <Kpi label="Tokens out" value={summary ? fmt(Number(summary.tok_out)) : "—"} />
      </div>

      {/* leaderboards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Board title="Top askers" rows={askers.map((a) => ({ label: a.label, n: a.n }))} />
        <Board title="Top accounts asked about" rows={accounts.map((a) => ({ label: a.name || "—", n: a.n }))} />
        <Board title="Top tools used" rows={tools.map((t) => ({ label: t.tool || "—", n: t.n }))} />
      </div>

      {/* conversation log */}
      <div className="rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
        <div className="border-b px-3 py-2 text-sm font-semibold text-slate-700" style={{ borderColor: "var(--cave-line)" }}>Conversation log</div>
        <div className="max-h-[560px] divide-y divide-slate-100 overflow-auto">
          {convos.map((c) => {
            const isOpen = open === c.id;
            return (
              <div key={c.id} className="px-3 py-2 text-xs">
                <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-start gap-2 text-left">
                  <span className="mt-0.5 shrink-0 text-slate-400">{isOpen ? "▾" : "▸"}</span>
                  <span className="whitespace-nowrap tabular-nums text-slate-400">{when(c.ts)}</span>
                  <span className="whitespace-nowrap font-medium text-slate-700" title={c.email || ""}>{c.name || c.email?.split("@")[0] || "unknown"}{c.role === "am" && c.am_name ? ` · ${c.am_name}` : ""}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{c.question}</span>
                </button>
                {isOpen && (
                  <div className="ml-6 mt-2 space-y-2">
                    <div className="rounded bg-slate-50 px-2 py-1.5"><span className="font-semibold text-slate-500">Q:</span> <span className="text-slate-700">{c.question}</span></div>
                    <div className="whitespace-pre-wrap rounded bg-white px-2 py-1.5 leading-relaxed text-slate-600" style={{ border: "1px solid var(--cave-line)" }}><span className="font-semibold text-slate-500">Alfred:</span> {c.reply}</div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                      {c.tools?.length ? <span>tools: {c.tools.join(", ")}</span> : null}
                      {c.latency_ms != null && <span>· {(c.latency_ms / 1000).toFixed(1)}s</span>}
                      {c.tokens_in != null && <span>· {c.tokens_in}→{c.tokens_out} tok</span>}
                      {c.model && <span>· {c.model}</span>}
                      {c.status && <span>· {c.status}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && convos.length === 0 && <div className="px-3 py-8 text-center text-sm text-slate-400">No Alfred conversations in this window.</div>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--cave-line)" }}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

function Board({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--cave-line)" }}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {rows.length ? (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 truncate text-slate-600" title={r.label}>{r.label}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <div className="h-full rounded bg-cyan-500/60" style={{ width: `${Math.max(4, (r.n / max) * 100)}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-slate-500">{r.n}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-3 text-center text-xs text-slate-400">No data yet.</div>
      )}
    </div>
  );
}
