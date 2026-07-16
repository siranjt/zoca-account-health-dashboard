"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { AccountRow, AccountsPayload, Delta, HealthColor } from "@/lib/types";
import { otherProducts } from "@/lib/types";
import HealthDot from "./HealthDot";
import DetailPanel from "./DetailPanel";
import { Sparkline, DeltaBadge } from "./Sparkline";
import { VIZ } from "@/lib/theme";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRank,
} from "@/lib/format";

type SortKey =
  | "health"
  | "name"
  | "leadsReceived"
  | "reviewsReceived"
  | "photosUploaded"
  | "profileClicks"
  | "websiteClicks"
  | "bookOnlineClicks"
  | "keywordsTop3Pct"
  | "avgCurrentRank"
  | "keywordImpressions"
  | "avgReceivedToOpenedMs"
  | "avgReceivedToContactedMs"
  | "avgOpenedToContactedMs"
  | "otherProducts";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const HEALTH_RANK: Record<HealthColor, number> = { red: 0, yellow: 1, green: 2 };
const LS_KEY = "zoca-ahd-view-v1";
const WINDOWS = [7, 30, 90, 180];

export default function AccountsTable({ initial }: { initial: AccountsPayload }) {
  const [accounts, setAccounts] = useState<AccountRow[]>(initial.accounts);
  const [windowDays, setWindowDays] = useState<number>(initial.windowDays);
  const [source, setSource] = useState(initial.source);
  const [generatedAt, setGeneratedAt] = useState(initial.generatedAt);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] = useState<"all" | HealthColor>("all");
  const [amFilter, setAmFilter] = useState<string>("all");
  const [onlyMultiProduct, setOnlyMultiProduct] = useState(false);
  const [onlyDeclining, setOnlyDeclining] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "health", dir: "asc" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadWindow(days: number) {
    if (!WINDOWS.includes(days)) return;
    setWindowDays(days);
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts?window=${days}`, { cache: "no-store" });
      const p = await res.json();
      setAccounts(p.accounts);
      setWindowDays(p.windowDays);
      setSource(p.source);
      setGeneratedAt(p.generatedAt);
    } catch {
      /* keep existing data on error */
    } finally {
      setLoading(false);
    }
  }

  // restore persisted view state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.query != null) setQuery(s.query);
        if (s.colorFilter) setColorFilter(s.colorFilter);
        if (s.amFilter) setAmFilter(s.amFilter);
        if (s.onlyMultiProduct != null) setOnlyMultiProduct(s.onlyMultiProduct);
        if (s.onlyDeclining != null) setOnlyDeclining(s.onlyDeclining);
        if (s.sort) setSort(s.sort);
        if (s.windowDays && WINDOWS.includes(s.windowDays) && s.windowDays !== initial.windowDays) {
          loadWindow(s.windowDays);
        }
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, sort, windowDays })
      );
    } catch {
      /* ignore */
    }
  }, [query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, sort, windowDays]);

  const managers = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => a.accountManager && set.add(a.accountManager));
    return Array.from(set).sort();
  }, [accounts]);

  const rows = useMemo(() => {
    let out = accounts.slice();

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.city ?? "").toLowerCase().includes(q) ||
          (a.accountManager ?? "").toLowerCase().includes(q)
      );
    }
    if (colorFilter !== "all") out = out.filter((a) => a.health.color === colorFilter);
    if (amFilter !== "all") out = out.filter((a) => a.accountManager === amFilter);
    if (onlyMultiProduct) out = out.filter((a) => otherProducts(a).length > 0);
    if (onlyDeclining) out = out.filter((a) => a.leadsDelta != null && a.leadsDelta.cur < a.leadsDelta.prev);

    const dir = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => dir * cmp(a, b, sort.key));
    return out;
  }, [accounts, query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, sort]);

  const kpi = useMemo(() => {
    const leads = rows.reduce((s, a) => s + a.leadsReceived, 0);
    const reviews = rows.reduce((s, a) => s + a.reviewsReceived, 0);
    const comps = rows.map((a) => a.health.composite).filter((v): v is number => v != null);
    const avgComp = comps.length ? comps.reduce((s, v) => s + v, 0) / comps.length : null;
    return {
      leads,
      reviews,
      avgComp,
      green: rows.filter((a) => a.health.color === "green").length,
      yellow: rows.filter((a) => a.health.color === "yellow").length,
      red: rows.filter((a) => a.health.color === "red").length,
      declining: rows.filter((a) => a.leadsDelta && a.leadsDelta.cur < a.leadsDelta.prev).length,
    };
  }, [rows]);

  function exportCsv() {
    const cols = ["Business", "City", "State", "AM", "Health", "Composite", "Leads", "Reviews", "Photos", "ProfileClicks", "WebsiteClicks", "BookOnline", "KWTracked", "Top3%", "AvgRank", "Impressions", "Products"];
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const a of rows) {
      lines.push([
        a.name, a.city, a.state, a.accountManager, a.health.tierLabel, a.health.composite,
        a.leadsReceived, a.reviewsReceived, a.photosUploaded, a.profileClicks, a.websiteClicks,
        a.bookOnlineActive ? a.bookOnlineClicks : "n/a", a.keywordsTracked, a.keywordsTop3Pct,
        a.avgCurrentRank, a.keywordImpressions, a.activeProducts.join(" | "),
      ].map(cell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `account-health-${windowDays}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir(key) }
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
        <span>{accounts.length} active accounts</span>
        <span>· metrics over last</span>
        <div
          className="inline-flex overflow-hidden rounded-md border border-slate-300"
          title="Window applies to Leads, Reviews, Profile/Website/Book-Online clicks. Photos, rankings, impressions and the health marker are not windowed."
        >
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => loadWindow(d)}
              disabled={loading}
              className={`px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                windowDays === d
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        {source === "metabase" ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
            live: Metabase
          </span>
        ) : (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
            sample data
          </span>
        )}
        <span>· generated {formatDate(generatedAt)}</span>
        {loading && <span className="text-slate-400">· refreshing…</span>}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Accounts shown" value={formatNumber(rows.length)} />
        <Kpi label={`Leads · ${windowDays}d`} value={formatNumber(kpi.leads)} />
        <Kpi label={`Reviews · ${windowDays}d`} value={formatNumber(kpi.reviews)} />
        <Kpi label="Avg composite" value={kpi.avgComp != null ? kpi.avgComp.toFixed(1) : "—"} />
        <Kpi
          label="Health mix"
          custom={
            <span className="text-base font-semibold tabular-nums">
              <span style={{ color: "#16a34a" }}>{kpi.green}</span>
              <span className="text-slate-300"> / </span>
              <span style={{ color: "#d97706" }}>{kpi.yellow}</span>
              <span className="text-slate-300"> / </span>
              <span style={{ color: "#dc2626" }}>{kpi.red}</span>
            </span>
          }
        />
        <Kpi label="Leads declining" value={formatNumber(kpi.declining)} alert={kpi.declining > 0} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search business, city, AM…"
          className="w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400"
        />
        <select
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value as any)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All health</option>
          <option value="green">🟢 Healthy</option>
          <option value="yellow">🟡 Monitor</option>
          <option value="red">🔴 At risk</option>
        </select>
        <select
          value={amFilter}
          onChange={(e) => setAmFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All AMs</option>
          {managers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={onlyMultiProduct}
            onChange={(e) => setOnlyMultiProduct(e.target.checked)}
          />
          Other products active
        </label>
        <label className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={onlyDeclining}
            onChange={(e) => setOnlyDeclining(e.target.checked)}
          />
          Leads declining
        </label>
        <button
          onClick={exportCsv}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          title="Download the current filtered view as CSV"
        >
          ⭳ Export CSV
        </button>
        <span className="ml-auto text-sm text-slate-500">{rows.length} shown</span>
      </div>

      <div
        className={`table-scroll rounded-lg border border-slate-200 bg-white shadow-sm transition-opacity ${
          loading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th onClick={() => toggleSort("health")} active={sort} k="health" center>
                Health
              </Th>
              <Th onClick={() => toggleSort("name")} active={sort} k="name" sticky>
                Business
              </Th>
              <Th onClick={() => toggleSort("leadsReceived")} active={sort} k="leadsReceived" num>
                Leads
              </Th>
              <Th onClick={() => toggleSort("reviewsReceived")} active={sort} k="reviewsReceived" num>
                Reviews
              </Th>
              <Th onClick={() => toggleSort("photosUploaded")} active={sort} k="photosUploaded" num>
                Photos
              </Th>
              <Th onClick={() => toggleSort("profileClicks")} active={sort} k="profileClicks" num>
                Profile clicks
              </Th>
              <Th onClick={() => toggleSort("websiteClicks")} active={sort} k="websiteClicks" num>
                Website clicks
              </Th>
              <Th onClick={() => toggleSort("bookOnlineClicks")} active={sort} k="bookOnlineClicks" num>
                Book Online
              </Th>
              <Th onClick={() => toggleSort("keywordsTop3Pct")} active={sort} k="keywordsTop3Pct" num>
                KW Top-3 %
              </Th>
              <Th onClick={() => toggleSort("avgCurrentRank")} active={sort} k="avgCurrentRank" num>
                Avg rank
              </Th>
              <Th onClick={() => toggleSort("keywordImpressions")} active={sort} k="keywordImpressions" num>
                KW impr.
              </Th>
              <Th onClick={() => toggleSort("avgReceivedToOpenedMs")} active={sort} k="avgReceivedToOpenedMs" num>
                Recv→Open
              </Th>
              <Th onClick={() => toggleSort("avgReceivedToContactedMs")} active={sort} k="avgReceivedToContactedMs" num>
                Recv→Contact
              </Th>
              <Th onClick={() => toggleSort("avgOpenedToContactedMs")} active={sort} k="avgOpenedToContactedMs" num>
                Open→Contact
              </Th>
              <Th onClick={() => toggleSort("otherProducts")} active={sort} k="otherProducts">
                Products
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const others = otherProducts(a);
              const isOpen = expanded.has(a.entityId);
              return (
                <Fragment key={a.entityId}>
                  <tr
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${isOpen ? "bg-slate-50" : ""}`}
                    onClick={() => toggleExpand(a.entityId)}
                  >
                    <td className="px-3 py-2 text-center">
                      <HealthDot health={a.health} />
                    </td>
                    <td className="sticky left-0 bg-white px-3 py-2">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 select-none text-slate-400">{isOpen ? "▾" : "▸"}</span>
                        <div>
                          <div className="font-medium text-slate-900">{a.name}</div>
                          <div className="text-xs text-slate-400">
                            {[a.city, a.state].filter(Boolean).join(", ")}
                            {a.accountManager ? ` · AM ${a.accountManager}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <MetricCell value={a.leadsReceived} delta={a.leadsDelta} spark={a.sparkLeads} color={VIZ.series[0]} />
                    <MetricCell value={a.reviewsReceived} delta={a.reviewsDelta} color={VIZ.series[1]} />
                    <Num>{formatNumber(a.photosUploaded)}</Num>
                    <MetricCell value={a.profileClicks} delta={a.clicksDelta} spark={a.sparkClicks} color={VIZ.series[0]} />
                    <Num>{formatNumber(a.websiteClicks)}</Num>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {a.bookOnlineActive ? (
                        formatNumber(a.bookOnlineClicks)
                      ) : (
                        <span className="text-slate-300" title="Book Online CTA not active on GBP">n/a</span>
                      )}
                    </td>
                    <Num>{formatPercent(a.keywordsTop3Pct)}</Num>
                    <Num>{formatRank(a.avgCurrentRank)}</Num>
                    <Num>{formatNumber(a.keywordImpressions)}</Num>
                    <Num>{formatDuration(a.avgReceivedToOpenedMs)}</Num>
                    <Num>{formatDuration(a.avgReceivedToContactedMs)}</Num>
                    <Num>{formatDuration(a.avgOpenedToContactedMs)}</Num>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Chip label="Discovery" tone="neutral" />
                        {others.map((p) => (
                          <Chip key={p} label={p} tone="accent" />
                        ))}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={15} className="p-0">
                        <DetailPanel account={a} windowDays={windowDays} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-10 text-center text-slate-400">
                  No accounts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cmp(a: AccountRow, b: AccountRow, key: SortKey): number {
  switch (key) {
    case "health":
      return HEALTH_RANK[a.health.color] - HEALTH_RANK[b.health.color] ||
        (a.health.composite ?? 0) - (b.health.composite ?? 0);
    case "name":
      return a.name.localeCompare(b.name);
    case "otherProducts":
      return otherProducts(a).length - otherProducts(b).length;
    default: {
      const av = (a[key] as number | null) ?? -Infinity;
      const bv = (b[key] as number | null) ?? -Infinity;
      return av - bv;
    }
  }
}

function defaultDir(key: SortKey): "asc" | "desc" {
  // health & response-time are "lower/worse first"; volume metrics "higher first"
  if (key === "health" || key === "name" || key === "avgCurrentRank") return "asc";
  if (key.startsWith("avg")) return "desc";
  return "desc";
}

function Th({
  children,
  onClick,
  active,
  k,
  num,
  center,
  sticky,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: SortState;
  k: SortKey;
  num?: boolean;
  center?: boolean;
  sticky?: boolean;
}) {
  const is = active.key === k;
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-semibold hover:text-slate-700 ${
        num ? "text-right" : center ? "text-center" : "text-left"
      } ${sticky ? "sticky left-0 bg-slate-50" : ""}`}
      title="Click to sort"
    >
      {children}
      <span className="ml-1 text-slate-400">{is ? (active.dir === "asc" ? "▲" : "▼") : ""}</span>
    </th>
  );
}

function Kpi({ label, value, custom, alert }: { label: string; value?: React.ReactNode; custom?: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white px-3 py-2 ${alert ? "border-red-200" : "border-slate-200"}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      {custom ?? <div className={`text-lg font-semibold tabular-nums ${alert ? "text-red-600" : "text-slate-800"}`}>{value}</div>}
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-right tabular-nums text-slate-700">{children}</td>;
}

function MetricCell({
  value,
  delta,
  spark,
  color,
}: {
  value: number;
  delta?: Delta;
  spark?: number[];
  color?: string;
}) {
  return (
    <td className="px-3 py-2 text-right align-middle">
      <div className="flex items-center justify-end gap-1.5">
        <span className="tabular-nums text-slate-700">{formatNumber(value)}</span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-0.5 flex justify-end">
          <Sparkline data={spark} color={color} />
        </div>
      )}
    </td>
  );
}

function Chip({ label, tone }: { label: string; tone: "neutral" | "accent" }) {
  const cls =
    tone === "accent"
      ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
      : "bg-slate-100 text-slate-500";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}
