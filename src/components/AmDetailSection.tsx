"use client";

// The Account-detail browser — the Excel workbook's detail sheets, in the app.
// One tab per sheet (Missed Payments, Churn 30d, Churn Monthly, Retention
// Tickets, Untouched, Scheduling), each the full account-level table with
// search, click-to-sort, an AM filter, the caveat note, and the TOTAL row.
//
// It reads the SAME /api/am-report/detail data the click-a-number drill-down
// uses — one renderer, two entry points: the Today table dispatches an
// `am-detail-open` event (sheet + optional AM scope) and this section catches
// it, selects the tab, applies the scope, and scrolls itself into view.
//
// Lazy on purpose: the payload is only fetched when the section nears the
// viewport or a drill event fires, so a visit that never scrolls down stays
// light (the page already carries the heavy Today table + trend grids).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ddmmyy } from "@/lib/amMetrics";

type Cell = string | number | null;
interface Sheet {
  title: string;
  headers: string[];
  rows: Cell[][];
  totalRow: Cell[] | null;
  notes: string | null;
  seq: number;
}

// The app owns these two; the detail browser is for the account-level sheets.
const HIDDEN = new Set(["Summary", "Definitions"]);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function cmp(a: Cell, b: Cell): number {
  const an = a === "" || a === null || a === undefined;
  const bn = b === "" || b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1; // blanks last, both directions
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function CellView({ value }: { value: Cell }) {
  if (typeof value === "number") {
    return (
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--cave-txt)" }}>
        {value.toLocaleString()}
      </td>
    );
  }
  const s = value == null ? "" : String(value);
  if (/^https?:\/\//.test(s)) {
    return (
      <td className="whitespace-nowrap px-2 py-1.5">
        <a href={s} target="_blank" rel="noreferrer noopener" className="underline" style={{ color: "var(--cave-cy)" }}>
          open ↗
        </a>
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap px-2 py-1.5" style={{ color: s ? "var(--cave-txt)" : "var(--cave-dim)" }}>
      {s}
    </td>
  );
}

export default function AmDetailSection({ latest }: { latest: string | null }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [amFilter, setAmFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: number | null; dir: "asc" | "desc" }>({ col: null, dir: "asc" });
  const sectionRef = useRef<HTMLElement | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setStatus("loading");
    try {
      const r = await fetch("/api/am-report/detail");
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { sheets?: Sheet[] };
      const visible = (d.sheets ?? []).filter((s) => !HIDDEN.has(s.title)).sort((a, b) => a.seq - b.seq);
      setSheets(visible);
      setStatus("idle");
      setActive((cur) => cur ?? visible[0]?.title ?? null);
    } catch {
      loadedRef.current = false; // allow retry
      setStatus("error");
    }
  }, []);

  // Lazy trigger: load when the section approaches the viewport.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      void load();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && void load(),
      { rootMargin: "500px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [load]);

  // Deep link: #account-detail or #account-detail:<sheet-slug>.
  useEffect(() => {
    const h = window.location.hash;
    if (!h.startsWith("#account-detail")) return;
    void load();
    const wanted = h.split(":")[1];
    if (wanted) setActive((cur) => cur ?? wanted); // resolved against slugs once sheets arrive
  }, [load]);

  // The Today table's click-a-number lands here.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ sheet: string; am: string | null }>).detail;
      if (!d) return;
      void load();
      setActive(d.sheet);
      setAmFilter(d.am);
      setQ("");
      setSort({ col: null, dir: "asc" });
      requestAnimationFrame(() =>
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    };
    window.addEventListener("am-detail-open", onOpen);
    return () => window.removeEventListener("am-detail-open", onOpen);
  }, [load]);

  // Resolve a slug (from a deep link) to a real title once sheets exist.
  useEffect(() => {
    if (!sheets || !active) return;
    if (sheets.some((s) => s.title === active)) return;
    const match = sheets.find((s) => slug(s.title) === active);
    if (match) setActive(match.title);
  }, [sheets, active]);

  const sheet = useMemo(() => sheets?.find((s) => s.title === active) ?? null, [sheets, active]);
  const amCol = sheet ? sheet.headers.indexOf("AM") : -1;
  const scopable = amCol >= 0;

  const visibleRows = useMemo(() => {
    if (!sheet) return [];
    let rows = sheet.rows;
    if (amFilter && scopable) rows = rows.filter((r) => String(r[amCol]) === amFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((r) => r.some((c) => c != null && String(c).toLowerCase().includes(needle)));
    }
    if (sort.col !== null) {
      const c = sort.col;
      rows = [...rows].sort((ra, rb) => (sort.dir === "asc" ? cmp(ra[c], rb[c]) : cmp(rb[c], ra[c])));
    }
    return rows;
  }, [sheet, amFilter, scopable, amCol, q, sort]);

  const filtered = (!!amFilter && scopable) || !!q.trim();

  function pickSheet(title: string) {
    setActive(title);
    setSort({ col: null, dir: "asc" });
    setQ("");
    if (!scopable || !amFilter) setAmFilter(null);
    if (typeof history !== "undefined") {
      history.replaceState(null, "", `#account-detail:${slug(title)}`);
    }
  }

  function toggleSort(col: number) {
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
  }

  const PANEL: React.CSSProperties = { borderColor: "var(--cave-line)", background: "var(--cave-panel)" };

  return (
    <section id="account-detail" ref={sectionRef} className="am-anchor rounded-xl border p-3" style={PANEL} aria-label="Account detail">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cave-cy)" }}>
            Account detail{latest ? <> · {ddmmyy(latest)}</> : null}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            The account-level sheets behind the numbers above — the same detail as the Excel workbook. Pick a sheet,
            search, and <b>click a column to sort</b>. Clicking a value in the Today table jumps here, scoped to that AM.
          </p>
        </div>
        <a
          href="/api/am-report/export"
          className="rounded border px-2 py-1 text-[11px] no-underline transition-colors hover:text-slate-200"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
          title="Download every sheet as one formatted Excel workbook"
        >
          ⇩ Export Excel
        </a>
      </div>

      {/* Sheet tabs */}
      {sheets && sheets.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Detail sheets">
          {sheets.map((s) => {
            const on = s.title === active;
            return (
              <button
                key={s.title}
                role="tab"
                aria-selected={on}
                onClick={() => pickSheet(s.title)}
                className="rounded-t-md border-b-2 px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  borderColor: on ? "var(--cave-cy)" : "transparent",
                  color: on ? "var(--cave-cy)" : "var(--cave-dim)",
                  background: on ? "color-mix(in srgb, var(--cave-cy) 10%, transparent)" : "transparent",
                }}
              >
                {s.title}
                <span className="ml-1.5 tabular-nums opacity-70">{s.rows.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      {sheet && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search {sheet.title}</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${sheet.title.toLowerCase()}…`}
              aria-label={`Search ${sheet.title}`}
              className="w-56 rounded border bg-transparent px-2 py-1 text-[11px] outline-none focus:border-cyan-400"
              style={{ borderColor: "var(--cave-line2)", color: "var(--cave-txt)" }}
            />
          </label>
          {amFilter && scopable && (
            <button
              type="button"
              onClick={() => setAmFilter(null)}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]"
              style={{ borderColor: "var(--cave-cy)", color: "var(--cave-cy)", background: "color-mix(in srgb, var(--cave-cy) 12%, transparent)" }}
              title="Clear the AM filter"
            >
              AM: {amFilter} <span aria-hidden>✕</span>
            </button>
          )}
          <span className="text-[10.5px] text-slate-400">
            {filtered ? `${visibleRows.length} of ${sheet.rows.length}` : `${visibleRows.length}`} row
            {visibleRows.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* States */}
      {status === "loading" && !sheet && (
        <div className="rounded border px-3 py-8 text-center text-xs text-slate-400" style={{ borderColor: "var(--cave-line)" }}>
          Loading account detail…
        </div>
      )}
      {status === "error" && !sheet && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded border px-3 py-8 text-center text-xs" style={{ borderColor: "var(--cave-line)", color: "var(--am-bad)" }}>
          Couldn’t load the account detail.
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
          >
            Retry
          </button>
        </div>
      )}
      {sheets && sheets.length === 0 && (
        <div className="rounded border px-3 py-8 text-center text-xs text-slate-400" style={{ borderColor: "var(--cave-line)" }}>
          No detail sheets for this day yet — the workbook writes them after the 17:30 run.
        </div>
      )}

      {/* The sheet */}
      {sheet && (
        <>
          {sheet.notes && <p className="mb-2 text-[10.5px] italic text-slate-500">{sheet.notes}</p>}
          {visibleRows.length === 0 ? (
            <div className="rounded border px-3 py-8 text-center text-xs text-slate-400" style={{ borderColor: "var(--cave-line)" }}>
              No rows match{amFilter && scopable ? <> for <b>{amFilter}</b></> : null}
              {q.trim() ? <> “{q.trim()}”</> : null}.
            </div>
          ) : (
            <div className="table-scroll max-h-[32rem] overflow-auto rounded border" style={{ borderColor: "var(--cave-line)" }}>
              <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 z-[2]">
                  <tr>
                    {sheet.headers.map((h, i) => {
                      const on = sort.col === i;
                      return (
                        <th
                          key={i}
                          onClick={() => toggleSort(i)}
                          aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                          className="cursor-pointer select-none whitespace-nowrap px-2 py-1.5 text-left font-semibold text-white hover:bg-white/5"
                          style={{ background: "var(--cave-hdr, #1f2937)" }}
                          title={`Sort by ${h}`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {h}
                            <span className="w-2 text-[9px] opacity-80">{on ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, ri) => (
                    <tr key={ri} className="border-t" style={{ borderColor: "var(--cave-line)" }}>
                      {row.map((cell, ci) => (
                        <CellView key={ci} value={cell} />
                      ))}
                    </tr>
                  ))}
                </tbody>
                {!filtered && sheet.totalRow && (
                  <tfoot>
                    <tr style={{ background: "var(--cave-panel2)", borderTop: "2px solid var(--cave-line2)" }}>
                      {sheet.totalRow.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`whitespace-nowrap px-2 py-1.5 font-bold tabular-nums ${typeof cell === "number" ? "text-right" : "text-left"}`}
                          style={{ color: "var(--cave-txt)" }}
                        >
                          {typeof cell === "number" ? cell.toLocaleString() : (cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
