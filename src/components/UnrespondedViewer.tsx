"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  entityId: string | null;
  conversationId: string | null;
  name: string | null;
  amName: string | null;
  sender: string | null;
  teamMembers: string | null;
  lastMessage: string | null;
  hoursWaiting: number;
  hasMissedInvoice: boolean;
  messageTime: string | null;
};

function ddmmyyhm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Hours → compact "18h" / "5.8d", the way an AM reads "how overdue is this". */
function fmtWait(h: number): string {
  if (!isFinite(h) || h <= 0) return "0h";
  return h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`;
}

/** Escalating tint by how long the reply has been owed. All rows are overdue by
 *  definition; colour separates "today" from "this is embarrassing". */
function waitColor(h: number): string {
  if (h >= 72) return "#dc2626"; // 3+ days
  if (h >= 24) return "#d97706"; // 1–3 days
  return "#0891b2"; // under a day
}

export default function UnrespondedViewer({ isAdmin = false }: { isAdmin?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [am, setAm] = useState("");
  const [q, setQ] = useState("");
  const [missedOnly, setMissedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Row>("hoursWaiting");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  function clearAll() { setAm(""); setQ(""); setMissedOnly(false); }
  function toggleSort(k: keyof Row) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === "name" || k === "amName" || k === "sender" ? 1 : -1); }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/unresponded", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setRows(d?.rows ?? []); setUnavailable(!!d?.unavailable); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const amOptions = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.amName).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const view = useMemo(() => {
    const term = q.trim().toLowerCase();
    const arr = (rows ?? []).filter((r) =>
      (am === "" || r.amName === am) &&
      (!missedOnly || r.hasMissedInvoice) &&
      (term === "" || [r.name, r.amName, r.sender, r.lastMessage].some((v) => (v || "").toLowerCase().includes(term))));
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" || typeof bv === "number") return sortDir * ((Number(av) || 0) - (Number(bv) || 0));
      return sortDir * String(av ?? "").localeCompare(String(bv ?? ""));
    });
    return arr;
  }, [rows, am, q, missedOnly, sortKey, sortDir]);

  const missedInView = view.filter((r) => r.hasMissedInvoice).length;

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading unresponded messages…</div>;

  if (unavailable) {
    return (
      <div className="rounded-lg border px-4 py-8 text-center text-sm text-slate-400" style={{ borderColor: "var(--cave-line)" }}>
        The unresponded-messages source is unavailable right now (Metabase). Nothing to show — try again shortly.
      </div>
    );
  }

  const th = "px-2 py-2 font-semibold whitespace-nowrap";
  const Sortable = ({ k, label, cls }: { k: keyof Row; label: string; cls?: string }) => (
    <th className={`${th} ${cls || ""} cursor-pointer select-none hover:text-slate-600`} onClick={() => toggleSort(k)} title="Sort">
      {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search account / AM / sender / message  ( / )"
          className="w-72 rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--cave-line2)" }}
        />
        {isAdmin && (
          <select
            value={am}
            onChange={(e) => setAm(e.target.value)}
            title="Filter by account manager"
            className="max-w-[180px] rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
            style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
          >
            <option value="">All AMs ({amOptions.length})</option>
            {amOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={missedOnly} onChange={(e) => setMissedOnly(e.target.checked)} /> Missed invoice only
        </label>
        {(am || q || missedOnly) && (
          <button onClick={clearAll} className="text-[11px] text-slate-400 hover:text-slate-600" title="Clear filters">clear</button>
        )}
        <a
          href={`/api/admin/unresponded?format=csv${am ? `&am=${encodeURIComponent(am)}` : ""}`}
          className="ml-auto rounded border px-2 py-1.5 text-[11px] font-medium no-underline"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >⭳ CSV</a>
      </div>

      <div className="mb-2 text-sm text-slate-400">
        <b className="text-slate-700">{view.length}</b> conversation{view.length === 1 ? "" : "s"} awaiting a reply
        {missedInView > 0 && (
          <button onClick={() => setMissedOnly((v) => !v)} className="ml-2 text-amber-600 hover:underline" title="Filter to accounts with a missed invoice">
            · {missedInView} also have a missed invoice{missedOnly ? " ✓" : ""}
          </button>
        )}
      </div>

      {view.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Nothing waiting on a reply. Inbox zero.</div>
      ) : (
        <div className="table-scroll -mx-1 max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
              <tr>
                <Sortable k="name" label="Account" />
                {isAdmin && <Sortable k="amName" label="Account manager" />}
                <Sortable k="hoursWaiting" label="Waiting" cls="text-right" />
                <Sortable k="sender" label="From" />
                <th className={th}>Last message</th>
                <Sortable k="hasMissedInvoice" label="Invoice" />
                <Sortable k="messageTime" label="Received" />
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={r.conversationId || `${r.entityId}-${i}`} className="border-t border-slate-100 align-top">
                  <td className="max-w-[240px] truncate px-2 py-1.5 text-slate-700">
                    {r.entityId ? (
                      <a href={`/account/${r.entityId}`} className="text-slate-700 no-underline hover:text-cyan-600" title="Open account">{r.name || "(unnamed)"}</a>
                    ) : (
                      <span title="No entity id on this row">{r.name || "(unnamed)"}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className={`px-2 py-1.5 text-slate-600 ${r.amName ? "cursor-pointer hover:text-cyan-600" : ""}`} onClick={() => r.amName && setAm(r.amName)} title={r.amName ? "Filter by this AM" : undefined}>{r.amName || "—"}</td>
                  )}
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: waitColor(r.hoursWaiting) }} title={`${Math.round(r.hoursWaiting)} hours without a reply`}>
                    {fmtWait(r.hoursWaiting)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{r.sender || "—"}</td>
                  <td className="max-w-[420px] px-2 py-1.5 text-slate-500">
                    <span className="line-clamp-2" title={r.lastMessage || undefined}>{r.lastMessage || "—"}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    {r.hasMissedInvoice
                      ? <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700" style={{ background: "rgba(217,119,6,.12)" }}>overdue</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-500">{ddmmyyhm(r.messageTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
