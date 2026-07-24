"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Row {
  id: number; email: string | null; name: string | null; role: string | null; am_name: string | null;
  event: string; surface: string | null; entity_id: string | null; detail: Record<string, unknown> | null; ts: string;
}
interface Facet { event?: string; label?: string; email?: string; n: number }

const WINDOWS = [1, 7, 30, 90];

function ago(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function summariseDetail(d: Record<string, unknown> | null): string {
  if (!d) return "";
  if (d.question) return `“${String(d.question).slice(0, 80)}”`;
  const bits: string[] = [];
  if (d.bizname) bits.push(String(d.bizname));
  if (d.product) bits.push(`product: ${d.product}`);
  if (d.tab) bits.push(`tab: ${d.tab}`);
  if (d.window) bits.push(`window: ${d.window}`);
  if (d.count != null) bits.push(`count: ${d.count}`);
  return bits.join(" · ");
}

export default function ActivityLogViewer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<Facet[]>([]);
  const [users, setUsers] = useState<Facet[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [user, setUser] = useState("");
  const [event, setEvent] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ days: String(days), limit: "300" });
    if (user) qs.set("user", user);
    if (event) qs.set("event", event);
    fetch(`/api/admin/activity?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows || []);
        setEvents(d.events || []);
        setUsers(d.users || []);
        setNote(d.reason || null);
      })
      .catch((e) => setNote(String(e)))
      .finally(() => setLoading(false));
  }, [days, user, event]);

  useEffect(() => { load(); }, [load]);

  const totalEvents = useMemo(() => events.reduce((s, e) => s + e.n, 0), [events]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {WINDOWS.map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 text-xs font-medium ${days === d ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{d}d</button>
          ))}
        </div>
        <select value={user} onChange={(e) => setUser(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">All people ({users.length})</option>
          {users.map((u) => <option key={u.email || u.label} value={u.email || ""}>{u.label} ({u.n})</option>)}
        </select>
        <select value={event} onChange={(e) => setEvent(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">All events ({totalEvents})</option>
          {events.map((ev) => <option key={ev.event} value={ev.event}>{ev.event} ({ev.n})</option>)}
        </select>
        <button onClick={load} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">Refresh</button>
        <span className="text-xs text-slate-400">{loading ? "loading…" : `${rows.length} rows`}</span>
      </div>

      {note && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{note}</div>}

      <div className="overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-medium">When</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Who</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Role</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">Where / detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-500">{ago(r.ts)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700" title={r.email || ""}>{r.name || r.email?.split("@")[0] || "—"}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{r.role === "am" ? `AM · ${r.am_name || "?"}` : r.role || "—"}</td>
                <td className="whitespace-nowrap px-3 py-1.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{r.event}</span></td>
                <td className="px-3 py-1.5 text-slate-500"><span className="text-slate-400">{r.surface || ""}</span>{r.surface && summariseDetail(r.detail) ? " · " : ""}{summariseDetail(r.detail)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">No activity in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
