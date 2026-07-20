"use client";

import { useEffect, useMemo, useState } from "react";

interface QResult {
  name: string;
  section: string;
  runnable: boolean;
  deps: string[];
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  error: string | null;
  ms: number;
}

const SECTION_ORDER = [
  "Profile & GBP",
  "GBP Content",
  "Reviews",
  "Funnel & Leads",
  "Rankings & SEO",
  "Payments & Billing",
  "Scheduling & Bookings",
  "Calls & Chatbot",
  "App Engagement",
  "Onboarding & Team",
  "Contact, IDs & Requests",
  "Other",
];

const ROW_SHOW = 100;

function cell(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 160 ? s.slice(0, 160) + "…" : s;
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

export default function RetoolAllData({ entityId }: { entityId: string }) {
  const [results, setResults] = useState<QResult[] | null>(null);
  const [meta, setMeta] = useState<{ total: number; ok: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSql, setOpenSql] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setResults(null);
    setError(null);
    fetch(`/api/account/${entityId}/queries`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((j) => {
        if (!alive) return;
        setResults(j.results);
        setMeta({ total: j.total, ok: j.ok });
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [entityId]);

  const grouped = useMemo(() => {
    const g = new Map<string, QResult[]>();
    for (const r of results ?? []) {
      if (!g.has(r.section)) g.set(r.section, []);
      g.get(r.section)!.push(r);
    }
    return SECTION_ORDER.filter((s) => g.has(s)).map((s) => [s, g.get(s)!] as const);
  }, [results]);

  if (error) return <div className="py-10 text-center text-sm text-red-500">Couldn&apos;t run queries: {error}</div>;
  if (!results)
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-400" />
        Running all 76 Retool queries for this account…
      </div>
    );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded bg-white px-2 py-1 font-medium text-slate-600">{meta?.total ?? results.length} queries</span>
        <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700">{meta?.ok ?? 0} returned data</span>
        <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-500">
          {results.filter((r) => r.error && r.runnable).length} errored · {results.filter((r) => !r.runnable).length} derived
        </span>
        <span className="ml-auto">every query the Retool Customer Dashboard runs, live for this account</span>
      </div>

      {grouped.map(([section, items]) => {
        const isCollapsed = collapsed.has(section);
        return (
          <div key={section} className="mb-4">
            <button
              onClick={() =>
                setCollapsed((prev) => {
                  const n = new Set(prev);
                  n.has(section) ? n.delete(section) : n.add(section);
                  return n;
                })
              }
              className="mb-2 flex w-full items-center gap-2 border-b pb-1 text-left"
              style={{ borderColor: "var(--cave-line)" }}
            >
              <span className="text-slate-400">{isCollapsed ? "▸" : "▾"}</span>
              <span className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>{section}</span>
              <span className="text-xs text-slate-400">· {items.length}</span>
            </button>

            {!isCollapsed && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {items.map((q) => {
                  const sqlOpen = openSql.has(q.name);
                  return (
                    <div key={q.name} className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--cave-line)" }}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-700">{q.name}</span>
                        {q.error ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${q.runnable ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                            {q.runnable ? "error" : "derived"}
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            {q.rowCount} row{q.rowCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {q.ms > 0 && <span className="text-[10px] text-slate-400">{q.ms}ms</span>}
                        <button
                          onClick={() =>
                            setOpenSql((prev) => {
                              const n = new Set(prev);
                              n.has(q.name) ? n.delete(q.name) : n.add(q.name);
                              return n;
                            })
                          }
                          className="ml-auto rounded border px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:text-cyan-400"
                          style={{ borderColor: "var(--cave-line)" }}
                        >
                          {sqlOpen ? "Hide SQL" : "View SQL ▾"}
                        </button>
                      </div>

                      {sqlOpen && (
                        <pre className="mb-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[10.5px] leading-snug text-slate-600" style={{ whiteSpace: "pre" }}>
                          {q.sql}
                        </pre>
                      )}

                      {q.error ? (
                        <div className="py-2 text-xs text-slate-400">
                          {q.runnable ? <span className="text-red-500">{q.error}</span> : q.error}
                        </div>
                      ) : q.rows.length ? (
                        <ResultTable columns={q.columns} rows={q.rows} total={q.rowCount} />
                      ) : (
                        <div className="py-2 text-xs text-slate-400">No rows for this account.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultTable({ columns, rows, total }: { columns: string[]; rows: Record<string, unknown>[]; total: number }) {
  const shown = rows.slice(0, ROW_SHOW);
  return (
    <div className="table-scroll -mx-1 max-h-[340px] overflow-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1 font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              {columns.map((c) => (
                <td key={c} className="max-w-[280px] px-2 py-1 text-slate-600">{cell(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > shown.length && (
        <div className="px-1 py-1 text-[10px] text-slate-400">showing {shown.length} of {total} rows</div>
      )}
    </div>
  );
}
