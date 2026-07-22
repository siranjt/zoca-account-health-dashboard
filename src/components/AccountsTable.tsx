"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { AccountRow, AccountsPayload, Delta, HealthColor } from "@/lib/types";
import { otherProducts } from "@/lib/types";
import dynamic from "next/dynamic";
import HealthDot from "./HealthDot";
import DetailPanel from "./DetailPanel";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="py-16 text-center text-sm text-slate-400">Loading map…</div> });
import { Sparkline, DeltaBadge } from "./Sparkline";
import { VIZ } from "@/lib/theme";
import {
  formatDate,
  formatDays,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRank,
  formatShort,
  formatTenure,
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
  | "daysToInvoice"
  | "daysOverdue"
  | "failedPayments"
  | "tenureDays"
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
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [custom, setCustom] = useState(initial.custom);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => initial.from.slice(0, 10));
  const [dateTo, setDateTo] = useState(() => initial.to.slice(0, 10));

  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] = useState<"all" | HealthColor>("all");
  const [amFilter, setAmFilter] = useState<string>("all");
  const [onlyMultiProduct, setOnlyMultiProduct] = useState(false);
  const [onlyDeclining, setOnlyDeclining] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [ticketsOnly, setTicketsOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [mrrMin, setMrrMin] = useState<string>("");
  const [mrrMax, setMrrMax] = useState<string>("");
  const [cols, setCols] = useState({ engagement: true, seo: true, timing: true, payments: true });
  const [metricRange, setMetricRange] = useState<{ key: keyof AccountRow; label: string; min: number; max: number } | null>(null);
  const [colMenu, setColMenu] = useState(false);
  useEffect(() => {
    try { const r = localStorage.getItem("zoca-ahd-cols"); if (r) setCols((c) => ({ ...c, ...JSON.parse(r) })); } catch { /* ignore */ }
  }, []);
  function toggleColGroup(k: "engagement" | "seo" | "timing" | "payments") {
    setCols((c) => { const n = { ...c, [k]: !c[k] }; try { localStorage.setItem("zoca-ahd-cols", JSON.stringify(n)); } catch { /* ignore */ } return n; });
  }
  const colCount = 3 + (cols.engagement ? 6 : 0) + (cols.seo ? 3 : 0) + (cols.timing ? 3 : 0) + (cols.payments ? 4 : 0);
  const [sort, setSort] = useState<SortState>({ key: "health", dir: "asc" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pop, setPop] = useState<{ x: number; y: number; body: React.ReactNode } | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [dense, setDense] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "am" | "tier" | "state">("none");
  const [viewMode, setViewMode] = useState<"table" | "board" | "map">("table");
  const [showCompare, setShowCompare] = useState(false);
  const [showLeaders, setShowLeaders] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [savedViews, setSavedViews] = useState<{ name: string; s: any }[]>([]);
  const searchParams = useSearchParams();

  // deep-link filters from the URL (e.g. /overview?am=Sudha&color=red) — takes
  // precedence over the persisted view, so breadcrumb/Alfred links land filtered.
  useEffect(() => {
    const am = searchParams.get("am");
    const color = searchParams.get("color");
    const q = searchParams.get("q");
    if (am) setAmFilter(am);
    if (color === "green" || color === "yellow" || color === "red") setColorFilter(color);
    if (q) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // pinned accounts (persisted) — float to the top
  useEffect(() => {
    try {
      const raw = localStorage.getItem("zoca-ahd-pins");
      if (raw) setPinned(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);
  function togglePin(id: string) {
    setPinned((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem("zoca-ahd-pins", JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // saved views (filter + sort snapshots)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("zoca-ahd-views");
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  function persistViews(v: { name: string; s: any }[]) {
    setSavedViews(v);
    try { localStorage.setItem("zoca-ahd-views", JSON.stringify(v)); } catch { /* ignore */ }
  }
  function saveView() {
    const name = window.prompt("Name this view:");
    if (!name) return;
    const s = { query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, overdueOnly, ticketsOnly, pinnedOnly, sort, groupBy };
    persistViews([...savedViews.filter((x) => x.name !== name), { name, s }]);
    window.dispatchEvent(new CustomEvent("cave-toast", { detail: { message: `Saved view "${name}"` } }));
  }
  function loadView(v: { name: string; s: any }) {
    const s = v.s;
    setQuery(s.query || "");
    setColorFilter(s.colorFilter || "all");
    setAmFilter(s.amFilter || "all");
    setOnlyMultiProduct(!!s.onlyMultiProduct);
    setOnlyDeclining(!!s.onlyDeclining);
    setOverdueOnly(!!s.overdueOnly);
    setTicketsOnly(!!s.ticketsOnly);
    setPinnedOnly(!!s.pinnedOnly);
    if (s.sort) setSort(s.sort);
    setGroupBy(s.groupBy || "none");
  }

  function openPop(e: React.MouseEvent, body: React.ReactNode) {
    e.stopPropagation();
    setPop({ x: e.clientX, y: e.clientY, body });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadRange(params: { window?: number; from?: string; to?: string }) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params.from && params.to) {
        qs.set("from", params.from);
        qs.set("to", params.to);
      } else if (params.window) {
        qs.set("window", String(params.window));
      }
      const res = await fetch(`/api/accounts?${qs.toString()}`, { cache: "no-store" });
      const p = await res.json();
      setAccounts(p.accounts);
      setWindowDays(p.windowDays);
      setSource(p.source);
      setGeneratedAt(p.generatedAt);
      setFrom(p.from);
      setTo(p.to);
      setCustom(p.custom);
    } catch {
      /* keep existing data on error */
    } finally {
      setLoading(false);
    }
  }
  function loadWindow(days: number) {
    if (!WINDOWS.includes(days)) return;
    setPickerOpen(false);
    loadRange({ window: days });
  }
  function applyCustom() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return;
    setPickerOpen(false);
    loadRange({ from: dateFrom, to: dateTo });
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
        if (s.custom && s.dateFrom && s.dateTo) {
          setDateFrom(s.dateFrom);
          setDateTo(s.dateTo);
          loadRange({ from: s.dateFrom, to: s.dateTo });
        } else if (s.windowDays && WINDOWS.includes(s.windowDays) && s.windowDays !== initial.windowDays) {
          loadRange({ window: s.windowDays });
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
        JSON.stringify({ query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, sort, windowDays, custom, dateFrom, dateTo })
      );
    } catch {
      /* ignore */
    }
  }, [query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, sort, windowDays, custom, dateFrom, dateTo]);

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
    if (overdueOnly) out = out.filter((a) => a.daysOverdue != null && a.daysOverdue > 0);
    if (ticketsOnly) out = out.filter((a) => a.openTickets > 0);
    if (pinnedOnly) out = out.filter((a) => pinned.has(a.entityId));
    const lo = mrrMin === "" ? null : Number(mrrMin);
    const hi = mrrMax === "" ? null : Number(mrrMax);
    if (lo != null && Number.isFinite(lo)) out = out.filter((a) => (a.mrr ?? 0) >= lo);
    if (hi != null && Number.isFinite(hi)) out = out.filter((a) => (a.mrr ?? 0) <= hi);
    if (metricRange) {
      const { key, min, max } = metricRange;
      out = out.filter((a) => { const v = a[key]; return typeof v === "number" && v >= min && v <= max; });
    }

    const dir = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const pa = pinned.has(a.entityId) ? 0 : 1;
      const pb = pinned.has(b.entityId) ? 0 : 1;
      if (pa !== pb) return pa - pb; // pinned float to top
      return dir * cmp(a, b, sort.key);
    });
    return out;
  }, [accounts, query, colorFilter, amFilter, onlyMultiProduct, onlyDeclining, overdueOnly, ticketsOnly, pinnedOnly, mrrMin, mrrMax, metricRange, sort, pinned]);

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
    const cols = ["Business", "City", "State", "AM", "Health", "Composite", "Leads", "Reviews", "Photos", "ProfileClicks", "WebsiteClicks", "BookOnline", "KWTracked", "Top3%", "AvgRank", "Impressions", "DaysToInvoice", "DaysOverdue", "MissedPayments", "TenureDays", "Products"];
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
        a.avgCurrentRank, a.keywordImpressions,
        a.daysToInvoice, a.daysOverdue, a.failedPayments, a.tenureDays,
        a.activeProducts.join(" | "),
      ].map(cell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `account-health-${windowDays}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
    window.dispatchEvent(new CustomEvent("cave-toast", { detail: { message: `Exported ${rows.length} accounts` } }));
  }

  function metricPop(a: AccountRow, key: string): React.ReactNode {
    const H = (t: string) => <div className="mb-1 text-xs font-medium text-slate-500">{t}</div>;
    const Big = ({ v, d, s }: { v: React.ReactNode; d?: Delta; s?: number[] }) => (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{v}</span>
          {d && <DeltaBadge delta={d} />}
        </div>
        {s && s.length > 1 && <div className="mt-1"><Sparkline data={s} width={210} height={34} /></div>}
      </div>
    );
    const R = ({ l, v, red }: { l: string; v: React.ReactNode; red?: boolean }) => (
      <div className="flex justify-between py-0.5 text-xs">
        <span className="text-slate-500">{l}</span>
        <span className={`font-medium tabular-nums ${red ? "text-red-600" : "text-slate-800"}`}>{v}</span>
      </div>
    );
    switch (key) {
      case "leads": return <div className="w-60">{H(`Leads · ${a.name}`)}<Big v={formatNumber(a.leadsReceived)} d={a.leadsDelta} s={a.sparkLeads} />{a.leadsDelta && <div className="mt-1"><R l="Previous period" v={a.leadsDelta.prev} /></div>}<PopLink id={a.entityId} tab="Funnel & Leads" /></div>;
      case "reviews": return <div className="w-56">{H("Reviews received")}<Big v={formatNumber(a.reviewsReceived)} d={a.reviewsDelta} />{a.reviewsDelta && <R l="Previous period" v={a.reviewsDelta.prev} />}<PopLink id={a.entityId} tab="Reviews" /></div>;
      case "photos": return <div className="w-56">{H("Photos uploaded")}<Big v={formatNumber(a.photosUploaded)} /><div className="mt-1 text-xs text-slate-400">Uploaded within the selected window.</div></div>;
      case "profileClicks": return <div className="w-60">{H("Profile clicks")}<Big v={formatNumber(a.profileClicks)} d={a.clicksDelta} s={a.sparkClicks} /></div>;
      case "websiteClicks": return <div className="w-52">{H("Website clicks")}<Big v={formatNumber(a.websiteClicks)} /></div>;
      case "bookOnline": return <div className="w-52">{H("Book Online clicks")}<Big v={a.bookOnlineActive ? formatNumber(a.bookOnlineClicks) : "n/a"} />{!a.bookOnlineActive && <div className="mt-1 text-xs text-slate-400">Book-Online CTA not active on GBP.</div>}</div>;
      case "rank": return <div className="w-56">{H("Keyword rankings")}<R l="Keywords tracked" v={a.keywordsTracked ?? "—"} /><R l="% in top 3" v={a.keywordsTop3Pct != null ? `${a.keywordsTop3Pct}%` : "—"} /><R l="Avg current rank" v={a.avgCurrentRank != null ? `#${a.avgCurrentRank}` : "—"} /><R l="Impressions (mo)" v={formatNumber(a.keywordImpressions)} /><PopLink id={a.entityId} tab="Rankings" /></div>;
      case "impressions": return <div className="w-52">{H("Keyword impressions")}<Big v={formatNumber(a.keywordImpressions)} /><div className="mt-1 text-xs text-slate-400">Latest complete month.</div></div>;
      case "timing": return <div className="w-56">{H("Lead response time")}<R l="Received → Opened" v={formatDuration(a.avgReceivedToOpenedMs)} /><R l="Received → Contacted" v={formatDuration(a.avgReceivedToContactedMs)} /><R l="Opened → Contacted" v={formatDuration(a.avgOpenedToContactedMs)} /></div>;
      case "payments": return <div className="w-60">{H(`Payments · ${a.name}`)}<R l="MRR" v={a.mrr != null ? `$${a.mrr}` : "—"} /><R l="Next invoice in" v={a.daysToInvoice != null ? `${a.daysToInvoice}d` : "—"} /><R l="Overdue" v={a.daysOverdue && a.daysOverdue > 0 ? `${a.daysOverdue}d` : "—"} red={!!(a.daysOverdue && a.daysOverdue > 0)} /><R l="Missed payments" v={a.failedPayments} red={a.failedPayments > 0} /><R l="Tenure" v={formatTenure(a.tenureDays)} /><PopLink id={a.entityId} tab="Payments" /></div>;
      case "health": return (
        <div className="w-60">
          {H(`Health · ${a.health.tierLabel}`)}
          <div className="text-2xl font-semibold tabular-nums">{a.health.composite != null ? a.health.composite.toFixed(0) : "—"}<span className="ml-1 text-xs font-normal text-slate-400">composite</span></div>
          <div className="mt-1"><R l="Engagement" v={a.health.engagement?.toFixed(0) ?? "—"} /><R l="Value" v={a.health.value?.toFixed(0) ?? "—"} /><R l="Product" v={a.health.product?.toFixed(0) ?? "—"} /></div>
          {a.health.reason && <div className="mt-1 text-xs text-slate-500">Watch: {a.health.reason}</div>}
          {a.health.recommendedAction && <div className="mt-1 text-xs text-slate-500">Action: {a.health.recommendedAction}</div>}
          <Link href={`/account/${a.entityId}`} onClick={(e) => { e.stopPropagation(); setPop(null); }} className="mt-2 block w-full rounded bg-slate-800 px-2 py-1 text-center text-xs font-medium text-white no-underline hover:bg-slate-700">Open detailed page →</Link>
          <button onClick={(e) => { e.stopPropagation(); setPop(null); window.dispatchEvent(new CustomEvent("cave-open-alfred", { detail: { prefill: `Give me a briefing on ${a.name}.` } })); }} className="mt-1 block w-full rounded border px-2 py-1 text-center text-xs font-medium" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}>✨ Ask Alfred</button>
        </div>
      );
      default: return null;
    }
  }

  function distro(key: keyof AccountRow, label: string): React.ReactNode {
    const vals = rows.map((a) => a[key]).filter((v): v is number => typeof v === "number");
    if (!vals.length) return <div className="w-56 text-xs text-slate-400">No data.</div>;
    const min = Math.min(...vals), max = Math.max(...vals);
    const bins = 10, counts = new Array(bins).fill(0), span = max - min || 1;
    vals.forEach((v) => { counts[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++; });
    const cmax = Math.max(...counts);
    const sorted = [...vals].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    return (
      <div className="w-64">
        <div className="mb-1 text-xs font-medium text-slate-500">{label} · {rows.length} accounts <span className="text-slate-400">· click a bar to filter</span></div>
        <div className="flex h-16 items-end gap-0.5">
          {counts.map((c, i) => {
            const bMin = min + (i / bins) * span;
            const bMax = i === bins - 1 ? max : min + ((i + 1) / bins) * span;
            return (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setPop(null); setMetricRange({ key, label: `${label} ${formatNumber(Math.round(bMin))}–${formatNumber(Math.round(bMax))}`, min: bMin, max: bMax }); }}
                className="flex-1 rounded-t hover:opacity-80"
                style={{ height: `${cmax ? (c / cmax) * 100 : 0}%`, background: "#86b6ef" }}
                title={`${c} accounts · ${formatNumber(Math.round(bMin))}–${formatNumber(Math.round(bMax))} — click to filter`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{formatNumber(Math.round(min))}</span><span>{formatNumber(Math.round(max))}</span></div>
        <div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Median</span><span className="font-medium tabular-nums">{formatNumber(Math.round(median))}</span></div>
      </div>
    );
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
        <span>· metrics {custom ? "from" : "over last"}</span>
        <div className="relative inline-flex items-center">
          <div
            className="inline-flex overflow-hidden rounded-md border border-slate-300"
            title="Window applies to Leads, Reviews, Photos (uploads) and clicks. Rankings, impressions, payments and the health marker reflect current state."
          >
            {WINDOWS.map((d) => (
              <button
                key={d}
                onClick={() => loadWindow(d)}
                disabled={loading}
                className={`px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                  !custom && windowDays === d ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {d}d
              </button>
            ))}
            <button
              onClick={() => setPickerOpen((o) => !o)}
              disabled={loading}
              className={`border-l border-slate-300 px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                custom ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {custom ? `${formatShort(from)}–${formatShort(to)}` : "Custom"}
            </button>
          </div>
          {pickerOpen && (
            <div className="absolute left-0 top-7 z-30 flex items-end gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
              <label className="text-[11px] text-slate-500">
                From
                <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} className="block rounded border border-slate-300 px-1 py-0.5 text-xs" />
              </label>
              <label className="text-[11px] text-slate-500">
                To
                <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} className="block rounded border border-slate-300 px-1 py-0.5 text-xs" />
              </label>
              <button onClick={applyCustom} className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700">Apply</button>
            </div>
          )}
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

      <div className="cave-kpis mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Accounts shown" value={formatNumber(rows.length)} />
        <Kpi label={`Leads · ${windowDays}d`} value={formatNumber(kpi.leads)} />
        <Kpi label={`Reviews · ${windowDays}d`} value={formatNumber(kpi.reviews)} />
        <Kpi label="Avg composite" value={kpi.avgComp != null ? kpi.avgComp.toFixed(1) : "—"} />
        <Kpi
          label="Health mix (click to filter)"
          custom={
            <span className="text-base font-semibold tabular-nums">
              <button onClick={() => setColorFilter((c) => (c === "green" ? "all" : "green"))} style={{ color: "#16a34a" }} className="hover:underline" title="Filter healthy">{kpi.green}</button>
              <span className="text-slate-300"> / </span>
              <button onClick={() => setColorFilter((c) => (c === "yellow" ? "all" : "yellow"))} style={{ color: "#d97706" }} className="hover:underline" title="Filter monitor">{kpi.yellow}</button>
              <span className="text-slate-300"> / </span>
              <button onClick={() => setColorFilter((c) => (c === "red" ? "all" : "red"))} style={{ color: "#dc2626" }} className="cave-alarm hover:underline" title="Filter at-risk">{kpi.red}</button>
            </span>
          }
        />
        <Kpi label="Leads declining" value={formatNumber(kpi.declining)} alert={kpi.declining > 0} onClick={() => setOnlyDeclining((v) => !v)} active={onlyDeclining} />
      </div>

      {/* quick-filter presets */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400">Quick filters:</span>
        <Preset label="🔴 At-risk" active={colorFilter === "red"} onClick={() => setColorFilter((c) => (c === "red" ? "all" : "red"))} />
        <Preset label="📉 Declining" active={onlyDeclining} onClick={() => setOnlyDeclining((v) => !v)} />
        <Preset label="⏰ Overdue" active={overdueOnly} onClick={() => setOverdueOnly((v) => !v)} />
        <Preset label="🎫 Has tickets" active={ticketsOnly} onClick={() => setTicketsOnly((v) => !v)} />
        <Preset label="➕ Multi-product" active={onlyMultiProduct} onClick={() => setOnlyMultiProduct((v) => !v)} />
        <Preset label={`★ Pinned${pinned.size ? ` (${pinned.size})` : ""}`} active={pinnedOnly} onClick={() => setPinnedOnly((v) => !v)} />
      </div>

      {/* active-filter chips (dismissible) */}
      {(() => {
        const chips: { label: string; clear: () => void }[] = [];
        if (query) chips.push({ label: `search: "${query}"`, clear: () => setQuery("") });
        if (colorFilter !== "all") chips.push({ label: `health: ${colorFilter}`, clear: () => setColorFilter("all") });
        if (amFilter !== "all") chips.push({ label: `AM: ${amFilter}`, clear: () => setAmFilter("all") });
        if (onlyMultiProduct) chips.push({ label: "multi-product", clear: () => setOnlyMultiProduct(false) });
        if (onlyDeclining) chips.push({ label: "declining", clear: () => setOnlyDeclining(false) });
        if (overdueOnly) chips.push({ label: "overdue", clear: () => setOverdueOnly(false) });
        if (ticketsOnly) chips.push({ label: "has tickets", clear: () => setTicketsOnly(false) });
        if (pinnedOnly) chips.push({ label: "pinned only", clear: () => setPinnedOnly(false) });
        if (mrrMin || mrrMax) chips.push({ label: `MRR ${mrrMin || "0"}–${mrrMax || "∞"}`, clear: () => { setMrrMin(""); setMrrMax(""); } });
        if (metricRange) chips.push({ label: metricRange.label, clear: () => setMetricRange(null) });
        if (!chips.length) return null;
        return (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <button
                key={i}
                onClick={c.clear}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:bg-slate-100"
                style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
                title="Remove filter"
              >
                {c.label} <span className="text-slate-400">✕</span>
              </button>
            ))}
            <button
              onClick={() => { setQuery(""); setColorFilter("all"); setAmFilter("all"); setOnlyMultiProduct(false); setOnlyDeclining(false); setOverdueOnly(false); setTicketsOnly(false); setPinnedOnly(false); }}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              clear all
            </button>
          </div>
        );
      })()}

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
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-500" title="Filter by MRR range">
          MRR
          <input type="number" value={mrrMin} onChange={(e) => setMrrMin(e.target.value)} placeholder="min" className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs outline-none" />
          –
          <input type="number" value={mrrMax} onChange={(e) => setMrrMax(e.target.value)} placeholder="max" className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs outline-none" />
        </span>
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
        {(colorFilter !== "all" || amFilter !== "all" || onlyMultiProduct || onlyDeclining || query) && (
          <button
            onClick={() => { setColorFilter("all"); setAmFilter("all"); setOnlyMultiProduct(false); setOnlyDeclining(false); setQuery(""); }}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ✕ Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">{rows.length} shown</span>
      </div>

      {/* view mode + tools */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {(["table", "board", "map"] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)} className={`px-2.5 py-1 font-medium ${viewMode === m ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
              {m === "table" ? "▤ Table" : m === "board" ? "▦ Board" : "🗺 Map"}
            </button>
          ))}
        </div>
        <button onClick={() => setDense((d) => !d)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100">
          {dense ? "↕ Comfortable" : "↕ Compact"}
        </button>
        <select
          value=""
          onChange={(e) => { const v = savedViews.find((x) => x.name === e.target.value); if (v) loadView(v); }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1"
        >
          <option value="">Saved views…</option>
          {savedViews.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
        <button onClick={saveView} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100">＋ Save view</button>
        <div className="relative inline-block">
          <button onClick={() => setColMenu((o) => !o)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100">⚙ Columns</button>
          {colMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setColMenu(false)} />
              <div className="absolute left-0 top-8 z-30 w-44 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                {([["engagement", "Engagement"], ["seo", "SEO / rankings"], ["timing", "Response timing"], ["payments", "Payments"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-100">
                    <input type="checkbox" checked={cols[k]} onChange={() => toggleColGroup(k)} />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={() => setShowLeaders(true)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100">🏆 Leaderboards</button>
        <button onClick={() => setShowAlerts(true)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100">🔔 Alerts</button>
        <button onClick={() => setShowActivity(true)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100">📋 Activity</button>
        {pinned.size >= 2 && (
          <button onClick={() => setShowCompare(true)} className="rounded-md border px-2.5 py-1 font-medium" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}>
            ⇄ Compare ({pinned.size})
          </button>
        )}
      </div>

      {viewMode === "board" && <BoardView rows={rows} pinned={pinned} togglePin={togglePin} />}
      {viewMode === "map" && <MapView rows={rows} />}

      <div className={`relative cave-brk cave-scanin ${viewMode !== "table" ? "hidden" : ""}`}>
        <div className="cave-radar"><b></b><i></i></div>
        {loading && <div className="cave-scanning" aria-hidden="true" />}
        <div
          className={`table-scroll rounded-lg border border-slate-200 bg-white shadow-sm transition-opacity ${dense ? "cave-dense" : ""} ${
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
              {cols.engagement && (<>
              <Th onClick={() => toggleSort("leadsReceived")} active={sort} k="leadsReceived" num onDistro={(e) => openPop(e, distro("leadsReceived", "Leads"))}>
                Leads
              </Th>
              <Th onClick={() => toggleSort("reviewsReceived")} active={sort} k="reviewsReceived" num onDistro={(e) => openPop(e, distro("reviewsReceived", "Reviews"))}>
                Reviews
              </Th>
              <Th onClick={() => toggleSort("photosUploaded")} active={sort} k="photosUploaded" num onDistro={(e) => openPop(e, distro("photosUploaded", "Photos"))}>
                Photos
              </Th>
              <Th onClick={() => toggleSort("profileClicks")} active={sort} k="profileClicks" num onDistro={(e) => openPop(e, distro("profileClicks", "Profile clicks"))}>
                Profile clicks
              </Th>
              <Th onClick={() => toggleSort("websiteClicks")} active={sort} k="websiteClicks" num>
                Website clicks
              </Th>
              <Th onClick={() => toggleSort("bookOnlineClicks")} active={sort} k="bookOnlineClicks" num>
                Book Online
              </Th>
              </>)}
              {cols.seo && (<>
              <Th onClick={() => toggleSort("keywordsTop3Pct")} active={sort} k="keywordsTop3Pct" num>
                KW Top-3 %
              </Th>
              <Th onClick={() => toggleSort("avgCurrentRank")} active={sort} k="avgCurrentRank" num>
                Avg rank
              </Th>
              <Th onClick={() => toggleSort("keywordImpressions")} active={sort} k="keywordImpressions" num onDistro={(e) => openPop(e, distro("keywordImpressions", "Keyword impressions"))}>
                KW impr.
              </Th>
              </>)}
              {cols.timing && (<>
              <Th onClick={() => toggleSort("avgReceivedToOpenedMs")} active={sort} k="avgReceivedToOpenedMs" num>
                Recv→Open
              </Th>
              <Th onClick={() => toggleSort("avgReceivedToContactedMs")} active={sort} k="avgReceivedToContactedMs" num>
                Recv→Contact
              </Th>
              <Th onClick={() => toggleSort("avgOpenedToContactedMs")} active={sort} k="avgOpenedToContactedMs" num>
                Open→Contact
              </Th>
              </>)}
              {cols.payments && (<>
              <Th onClick={() => toggleSort("daysToInvoice")} active={sort} k="daysToInvoice" num>
                Next invoice
              </Th>
              <Th onClick={() => toggleSort("daysOverdue")} active={sort} k="daysOverdue" num onDistro={(e) => openPop(e, distro("daysOverdue", "Days overdue"))}>
                Overdue
              </Th>
              <Th onClick={() => toggleSort("failedPayments")} active={sort} k="failedPayments" num onDistro={(e) => openPop(e, distro("failedPayments", "Missed payments"))}>
                Missed pmts
              </Th>
              <Th onClick={() => toggleSort("tenureDays")} active={sort} k="tenureDays" num onDistro={(e) => openPop(e, distro("tenureDays", "Tenure (days)"))}>
                Tenure
              </Th>
              </>)}
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
                    className={`cave-row cave-row-${a.health.color} cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${isOpen ? "bg-slate-50" : ""}`}
                    onClick={() => toggleExpand(a.entityId)}
                  >
                    <td className="cursor-pointer px-3 py-2 text-center hover:bg-indigo-50" onClick={(e) => openPop(e, metricPop(a, "health"))} title="Click for health breakdown">
                      <HealthDot health={a.health} />
                    </td>
                    <td className="sticky left-0 bg-white px-3 py-2">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 select-none text-slate-400">{isOpen ? "▾" : "▸"}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePin(a.entityId); }}
                              title={pinned.has(a.entityId) ? "Unpin" : "Pin to top"}
                              className="text-sm leading-none"
                              style={{ color: pinned.has(a.entityId) ? "#f5b301" : "#3a565d" }}
                            >
                              {pinned.has(a.entityId) ? "★" : "☆"}
                            </button>
                            <Link
                              href={`/account/${a.entityId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-slate-900 no-underline hover:text-indigo-600"
                              title="Open account dossier"
                            >
                              {a.name}
                            </Link>
                            {a.webAppActive && (
                              <span
                                className="cave-web ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
                                title="Discovery Web active — live on the web app"
                                style={{ border: "1px solid var(--cave-cy)", color: "var(--cave-cy)", background: "rgba(53,224,255,.08)" }}
                              >
                                ◉ Web
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {a.city ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setQuery(a.city!); }}
                                className="hover:text-indigo-600"
                                title={`Filter to ${a.city}`}
                              >
                                {[a.city, a.state].filter(Boolean).join(", ")}
                              </button>
                            ) : [a.city, a.state].filter(Boolean).join(", ")}
                            {a.accountManager ? (
                              <>
                                {" · AM "}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAmFilter(a.accountManager!); }}
                                  className="underline decoration-dotted underline-offset-2 hover:text-indigo-600"
                                  title={`Filter to ${a.accountManager}`}
                                >
                                  {a.accountManager}
                                </button>
                              </>
                            ) : ""}
                          </div>
                          <Link
                            href={`/account/${a.entityId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 no-underline hover:bg-indigo-100"
                            title="Open the full Retool-style account dossier"
                          >
                            Open in detail →
                          </Link>
                        </div>
                      </div>
                    </td>
                    {cols.engagement && (<>
                    <MetricCell value={a.leadsReceived} delta={a.leadsDelta} spark={a.sparkLeads} color={VIZ.series[0]} onClick={(e) => openPop(e, metricPop(a, "leads"))} />
                    <MetricCell value={a.reviewsReceived} delta={a.reviewsDelta} color={VIZ.series[1]} onClick={(e) => openPop(e, metricPop(a, "reviews"))} />
                    <Num onClick={(e) => openPop(e, metricPop(a, "photos"))}>{formatNumber(a.photosUploaded)}</Num>
                    <MetricCell value={a.profileClicks} delta={a.clicksDelta} spark={a.sparkClicks} color={VIZ.series[0]} onClick={(e) => openPop(e, metricPop(a, "profileClicks"))} />
                    <Num onClick={(e) => openPop(e, metricPop(a, "websiteClicks"))}>{formatNumber(a.websiteClicks)}</Num>
                    <td className="cursor-pointer px-3 py-2 text-right tabular-nums hover:bg-indigo-50" onClick={(e) => openPop(e, metricPop(a, "bookOnline"))}>
                      {a.bookOnlineActive ? (
                        formatNumber(a.bookOnlineClicks)
                      ) : (
                        <span className="text-slate-300" title="Book Online CTA not active on GBP">n/a</span>
                      )}
                    </td>
                    </>)}
                    {cols.seo && (<>
                    <Num onClick={(e) => openPop(e, metricPop(a, "rank"))}>{formatPercent(a.keywordsTop3Pct)}</Num>
                    <Num onClick={(e) => openPop(e, metricPop(a, "rank"))}>{formatRank(a.avgCurrentRank)}</Num>
                    <Num onClick={(e) => openPop(e, metricPop(a, "impressions"))}>{formatNumber(a.keywordImpressions)}</Num>
                    </>)}
                    {cols.timing && (<>
                    <Num onClick={(e) => openPop(e, metricPop(a, "timing"))}>{formatDuration(a.avgReceivedToOpenedMs)}</Num>
                    <Num onClick={(e) => openPop(e, metricPop(a, "timing"))}>{formatDuration(a.avgReceivedToContactedMs)}</Num>
                    <Num onClick={(e) => openPop(e, metricPop(a, "timing"))}>{formatDuration(a.avgOpenedToContactedMs)}</Num>
                    </>)}
                    {cols.payments && (<>
                    <td className="cursor-pointer px-3 py-2 text-right tabular-nums text-slate-700 hover:bg-indigo-50" onClick={(e) => openPop(e, metricPop(a, "payments"))} title="Click for payment detail">
                      {a.daysToInvoice != null ? formatDays(a.daysToInvoice) : "—"}
                    </td>
                    <td className="cursor-pointer px-3 py-2 text-right tabular-nums hover:bg-indigo-50" onClick={(e) => openPop(e, metricPop(a, "payments"))}>
                      {a.daysOverdue != null && a.daysOverdue > 0 ? (
                        <span className="font-semibold text-red-600">{formatDays(a.daysOverdue)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="cursor-pointer px-3 py-2 text-right tabular-nums hover:bg-indigo-50" onClick={(e) => openPop(e, metricPop(a, "payments"))}>
                      {a.failedPayments > 0 ? (
                        <span className="font-semibold text-red-600">{a.failedPayments}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="cursor-pointer px-3 py-2 text-right tabular-nums text-slate-700 hover:bg-indigo-50" onClick={(e) => openPop(e, metricPop(a, "payments"))}>
                      {formatTenure(a.tenureDays)}
                    </td>
                    </>)}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Chip label="Discovery" tone="neutral" />
                        {others.map((p) => (
                          <button key={p} onClick={(e) => { e.stopPropagation(); setOnlyMultiProduct(true); }} title="Filter to accounts with other products">
                            <Chip label={p} tone="accent" />
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        <DetailPanel account={a} windowDays={windowDays} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-slate-400">
                  No accounts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
            style={{
              left: Math.min(pop.x + 8, (typeof window !== "undefined" ? window.innerWidth : 1200) - 290),
              top: Math.min(pop.y + 8, (typeof window !== "undefined" ? window.innerHeight : 800) - 240),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {pop.body}
          </div>
        </>
      )}

      {showCompare && (
        <div className="fixed inset-0 z-[2147483450] flex items-center justify-center p-6" style={{ background: "rgba(2,6,8,.72)" }} onClick={() => setShowCompare(false)}>
          <div className="max-h-[85vh] w-full max-w-[1000px] overflow-auto rounded-xl border p-4" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>⇄ Compare {accounts.filter((a) => pinned.has(a.entityId)).length} pinned accounts</div>
              <button onClick={() => setShowCompare(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <CompareTable accounts={accounts.filter((a) => pinned.has(a.entityId))} />
          </div>
        </div>
      )}

      {showLeaders && (
        <div className="fixed inset-0 z-[2147483450] flex items-center justify-center p-6" style={{ background: "rgba(2,6,8,.72)" }} onClick={() => setShowLeaders(false)}>
          <div className="max-h-[85vh] w-full max-w-[980px] overflow-auto rounded-xl border p-4" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>🏆 Leaderboards <span className="text-slate-400">· {rows.length} accounts in view</span></div>
              <button onClick={() => setShowLeaders(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <LeaderboardView accounts={rows} onOpen={() => setShowLeaders(false)} />
          </div>
        </div>
      )}

      {showAlerts && (
        <div className="fixed inset-0 z-[2147483450] flex items-center justify-center p-6" style={{ background: "rgba(2,6,8,.72)" }} onClick={() => setShowAlerts(false)}>
          <div className="max-h-[85vh] w-full max-w-[720px] overflow-auto rounded-xl border p-4" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>🔔 Threshold alerts</div>
              <button onClick={() => setShowAlerts(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <AlertsView accounts={accounts} onOpen={() => setShowAlerts(false)} />
          </div>
        </div>
      )}

      {showActivity && (
        <div className="fixed inset-0 z-[2147483450] flex items-center justify-center p-6" style={{ background: "rgba(2,6,8,.72)" }} onClick={() => setShowActivity(false)}>
          <div className="max-h-[85vh] w-full max-w-[720px] overflow-auto rounded-xl border p-4" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>📋 Activity feed</div>
              <button onClick={() => setShowActivity(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <ActivityView onOpen={() => setShowActivity(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsView({ accounts, onOpen }: { accounts: AccountRow[]; onOpen: () => void }) {
  const [compBelow, setCompBelow] = useState(40);
  const [overdueOver, setOverdueOver] = useState(0);
  const [ticketsAtLeast, setTicketsAtLeast] = useState(3);
  const hits = accounts.filter(
    (a) =>
      (a.health.composite != null && a.health.composite < compBelow) ||
      (a.daysOverdue != null && a.daysOverdue > overdueOver) ||
      a.openTickets >= ticketsAtLeast
  );
  const reason = (a: AccountRow) => {
    const r: string[] = [];
    if (a.health.composite != null && a.health.composite < compBelow) r.push(`composite ${a.health.composite.toFixed(0)}`);
    if (a.daysOverdue != null && a.daysOverdue > overdueOver) r.push(`${a.daysOverdue}d overdue`);
    if (a.openTickets >= ticketsAtLeast) r.push(`${a.openTickets} tickets`);
    return r.join(" · ");
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">composite &lt; <input type="number" value={compBelow} onChange={(e) => setCompBelow(Number(e.target.value))} className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5" /></span>
        <span className="flex items-center gap-1">overdue &gt; <input type="number" value={overdueOver} onChange={(e) => setOverdueOver(Number(e.target.value))} className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5" />d</span>
        <span className="flex items-center gap-1">tickets ≥ <input type="number" value={ticketsAtLeast} onChange={(e) => setTicketsAtLeast(Number(e.target.value))} className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5" /></span>
        <span className="ml-auto font-medium text-slate-500">{hits.length} breaching</span>
      </div>
      <div className="space-y-1">
        {hits.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">No accounts breach these thresholds.</div>
        ) : (
          hits.sort((x, y) => (x.health.composite ?? 999) - (y.health.composite ?? 999)).map((a) => (
            <Link key={a.entityId} href={`/account/${a.entityId}`} onClick={onOpen} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs no-underline hover:bg-slate-100">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.health.color === "red" ? "#dc2626" : a.health.color === "yellow" ? "#d97706" : "#16a34a" }} />
              <span className="flex-1 truncate text-slate-700">{a.name}</span>
              <span className="text-red-500">{reason(a)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityView({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<{ from: string | null; to: string | null; changes: { entityId: string; name: string; kind: string; detail: string }[] } | null>(null);
  useEffect(() => {
    fetch("/api/activity", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => setData({ from: null, to: null, changes: [] }));
  }, []);
  if (!data) return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>;
  const color = (k: string) => (k === "risk" ? "#dc2626" : k === "recover" ? "#16a34a" : k === "new" ? "#818cf8" : "#d97706");
  return (
    <div>
      <div className="mb-2 text-xs text-slate-400">
        {data.changes.length ? `${data.changes.length} changes · ${data.from} → ${data.to}` : "No changes to show yet."}
      </div>
      {data.changes.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">
          The activity feed compares consecutive daily snapshots. It fills in once at least two days of history exist (a snapshot is taken automatically each day).
        </div>
      ) : (
        <div className="space-y-1">
          {data.changes.map((c, i) => (
            <Link key={i} href={`/account/${c.entityId}`} onClick={onOpen} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs no-underline hover:bg-slate-100">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color(c.kind) }} />
              <span className="flex-1 truncate text-slate-700">{c.name}</span>
              <span className="text-slate-500">{c.detail}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderboardView({ accounts, onOpen }: { accounts: AccountRow[]; onOpen: () => void }) {
  const boards: { title: string; val: (a: AccountRow) => number; fmt: (a: AccountRow) => string; asc?: boolean }[] = [
    { title: "Top MRR", val: (a) => a.mrr ?? 0, fmt: (a) => (a.mrr != null ? `$${formatNumber(a.mrr)}` : "—") },
    { title: "Most leads", val: (a) => a.leadsReceived, fmt: (a) => formatNumber(a.leadsReceived) },
    { title: "Most reviews", val: (a) => a.reviewsReceived, fmt: (a) => formatNumber(a.reviewsReceived) },
    { title: "Lowest composite", val: (a) => a.health.composite ?? 999, fmt: (a) => a.health.composite?.toFixed(1) ?? "—", asc: true },
    { title: "Most open tickets", val: (a) => a.openTickets, fmt: (a) => formatNumber(a.openTickets) },
    { title: "Most overdue", val: (a) => a.daysOverdue ?? 0, fmt: (a) => (a.daysOverdue && a.daysOverdue > 0 ? `${a.daysOverdue}d` : "—") },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((b) => {
        const top = [...accounts].sort((x, y) => (b.asc ? b.val(x) - b.val(y) : b.val(y) - b.val(x))).slice(0, 8);
        return (
          <div key={b.title} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="mb-1.5 px-1 text-xs font-semibold text-slate-600">{b.title}</div>
            <div className="space-y-0.5">
              {top.map((a, i) => (
                <Link key={a.entityId} href={`/account/${a.entityId}`} onClick={onOpen} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs no-underline hover:bg-slate-100">
                  <span className="w-4 text-right tabular-nums text-slate-400">{i + 1}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.health.color === "red" ? "#dc2626" : a.health.color === "yellow" ? "#d97706" : "#16a34a" }} />
                  <span className="flex-1 truncate text-slate-700">{a.name}</span>
                  <span className="tabular-nums font-medium text-slate-600">{b.fmt(a)}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
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
  onDistro,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: SortState;
  k: SortKey;
  num?: boolean;
  center?: boolean;
  sticky?: boolean;
  onDistro?: (e: React.MouseEvent) => void;
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
      {onDistro && (
        <button
          onClick={(e) => { e.stopPropagation(); onDistro(e); }}
          className="ml-1 align-middle text-[10px] text-slate-300 hover:text-indigo-600"
          title="Distribution across accounts"
        >
          ▦
        </button>
      )}
    </th>
  );
}

function Kpi({ label, value, custom, alert, onClick, active }: { label: string; value?: React.ReactNode; custom?: React.ReactNode; alert?: boolean; onClick?: () => void; active?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`cave-brk rounded-lg border bg-white px-3 py-2 ${onClick ? "cursor-pointer hover:border-indigo-300" : ""} ${active ? "ring-2 ring-indigo-300" : ""} ${alert ? "border-red-200" : "border-slate-200"}`}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      {custom ?? <div className={`text-lg font-semibold tabular-nums ${alert ? "text-red-600" : "text-slate-800"}`}>{value}</div>}
    </div>
  );
}

function Num({ children, onClick }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <td onClick={onClick} className={`px-3 py-2 text-right tabular-nums text-slate-700 ${onClick ? "cursor-pointer hover:bg-indigo-50" : ""}`}>
      {children}
    </td>
  );
}

function MetricCell({
  value,
  delta,
  spark,
  color,
  onClick,
}: {
  value: number;
  delta?: Delta;
  spark?: number[];
  color?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td onClick={onClick} className={`px-3 py-2 text-right align-middle ${onClick ? "cursor-pointer hover:bg-indigo-50" : ""}`}>
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

function CompareTable({ accounts }: { accounts: AccountRow[] }) {
  if (accounts.length < 2) return <div className="text-sm text-slate-400">Pin 2 or more accounts (★) to compare them side by side.</div>;
  const metrics: { label: string; get: (a: AccountRow) => React.ReactNode }[] = [
    { label: "Health", get: (a) => a.health.tierLabel || "—" },
    { label: "Composite", get: (a) => a.health.composite?.toFixed(1) ?? "—" },
    { label: "MRR", get: (a) => (a.mrr != null ? `$${formatNumber(a.mrr)}` : "—") },
    { label: "Leads", get: (a) => formatNumber(a.leadsReceived) },
    { label: "Reviews", get: (a) => formatNumber(a.reviewsReceived) },
    { label: "Profile clicks", get: (a) => formatNumber(a.profileClicks) },
    { label: "KW top-3 %", get: (a) => (a.keywordsTop3Pct != null ? `${a.keywordsTop3Pct}%` : "—") },
    { label: "Avg rank", get: (a) => (a.avgCurrentRank != null ? `#${a.avgCurrentRank}` : "—") },
    { label: "Impressions", get: (a) => formatNumber(a.keywordImpressions) },
    { label: "Open tickets", get: (a) => formatNumber(a.openTickets) },
    { label: "Overdue", get: (a) => (a.daysOverdue && a.daysOverdue > 0 ? `${a.daysOverdue}d` : "—") },
    { label: "Tenure", get: (a) => formatTenure(a.tenureDays) },
    { label: "AM", get: (a) => a.accountManager ?? "—" },
    { label: "Products", get: (a) => a.activeProducts.join(", ") || "—" },
  ];
  return (
    <div className="table-scroll overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-2 py-1.5" />
            {accounts.map((a) => (
              <th key={a.entityId} className="px-2 py-1.5 text-left">
                <Link href={`/account/${a.entityId}`} className="font-medium text-slate-900 no-underline hover:text-indigo-600">{a.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.label} className="border-t border-slate-100">
              <td className="sticky left-0 bg-white px-2 py-1.5 font-medium text-slate-500">{m.label}</td>
              {accounts.map((a) => (
                <td key={a.entityId} className="px-2 py-1.5 tabular-nums text-slate-700">{m.get(a)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardView({ rows, pinned, togglePin }: { rows: AccountRow[]; pinned: Set<string>; togglePin: (id: string) => void }) {
  const cols: { key: HealthColor; label: string; hex: string }[] = [
    { key: "red", label: "At risk", hex: "#dc2626" },
    { key: "yellow", label: "Monitor", hex: "#d97706" },
    { key: "green", label: "Healthy", hex: "#16a34a" },
  ];
  return (
    <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
      {cols.map((c) => {
        const items = rows.filter((a) => a.health.color === c.key);
        return (
          <div key={c.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold" style={{ color: c.hex }}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.hex }} />
              {c.label} <span className="text-slate-400">({items.length})</span>
            </div>
            <div className="table-scroll max-h-[70vh] space-y-1.5 overflow-auto pr-1">
              {items.map((a) => (
                <div key={a.entityId} className="rounded-md border border-slate-200 bg-white p-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => togglePin(a.entityId)} style={{ color: pinned.has(a.entityId) ? "#f5b301" : "#3a565d" }}>{pinned.has(a.entityId) ? "★" : "☆"}</button>
                    <Link href={`/account/${a.entityId}`} className="flex-1 truncate text-xs font-medium text-slate-900 no-underline hover:text-indigo-600">{a.name}</Link>
                    <span className="text-[10px] tabular-nums text-slate-400">{a.mrr != null ? `$${formatNumber(a.mrr)}` : ""}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="truncate">{a.accountManager ?? "—"}</span>
                    <span className="ml-auto">L{formatNumber(a.leadsReceived)}</span>
                    {a.openTickets > 0 && <span className="text-red-500">🎫{a.openTickets}</span>}
                  </div>
                </div>
              ))}
              {!items.length && <div className="px-1 py-2 text-center text-[11px] text-slate-400">none</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Preset({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={
        active
          ? { borderColor: "var(--cave-cy)", color: "var(--cave-cy)", background: "rgba(53,224,255,.1)" }
          : { borderColor: "var(--cave-line)", color: "#a7c3c8" }
      }
    >
      {label}
    </button>
  );
}

function PopLink({ id, tab }: { id: string; tab: string }) {
  return (
    <Link
      href={`/account/${id}?tab=${encodeURIComponent(tab)}`}
      onClick={(e) => e.stopPropagation()}
      className="mt-2 block w-full rounded bg-slate-800 px-2 py-1 text-center text-xs font-medium text-white no-underline hover:bg-slate-700"
    >
      Open {tab} →
    </Link>
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
