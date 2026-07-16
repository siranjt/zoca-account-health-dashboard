"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountRow, HealthColor, ZocaProduct } from "@/lib/types";
import { PRODUCT_LABELS } from "@/lib/types";
import HealthDot from "./HealthDot";
import {
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

function otherProductsOf(a: AccountRow): ZocaProduct[] {
  return a.activeProducts.filter((p) => p !== "discovery");
}

export default function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] = useState<"all" | HealthColor>("all");
  const [amFilter, setAmFilter] = useState<string>("all");
  const [onlyMultiProduct, setOnlyMultiProduct] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "health", dir: "asc" });

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
        if (s.sort) setSort(s.sort);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ query, colorFilter, amFilter, onlyMultiProduct, sort })
      );
    } catch {
      /* ignore */
    }
  }, [query, colorFilter, amFilter, onlyMultiProduct, sort]);

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
          (a.accountManager ?? "").toLowerCase().includes(q) ||
          (a.accountExecutive ?? "").toLowerCase().includes(q)
      );
    }
    if (colorFilter !== "all") out = out.filter((a) => a.health.color === colorFilter);
    if (amFilter !== "all") out = out.filter((a) => a.accountManager === amFilter);
    if (onlyMultiProduct) out = out.filter((a) => otherProductsOf(a).length > 0);

    const dir = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => dir * cmp(a, b, sort.key));
    return out;
  }, [accounts, query, colorFilter, amFilter, onlyMultiProduct, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir(key) }
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search business, city, AM, AE…"
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
        <span className="ml-auto text-sm text-slate-500">{rows.length} shown</span>
      </div>

      <div className="table-scroll rounded-lg border border-slate-200 bg-white shadow-sm">
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
              const others = otherProductsOf(a);
              return (
                <tr key={a.entityId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-center">
                    <HealthDot health={a.health} />
                  </td>
                  <td className="sticky left-0 bg-white px-3 py-2">
                    <div className="font-medium text-slate-900">{a.name}</div>
                    <div className="text-xs text-slate-400">
                      {[a.city, a.state].filter(Boolean).join(", ")}
                      {a.accountManager ? ` · AM ${a.accountManager}` : ""}
                    </div>
                  </td>
                  <Num>{formatNumber(a.leadsReceived)}</Num>
                  <Num>{formatNumber(a.reviewsReceived)}</Num>
                  <Num>{formatNumber(a.photosUploaded)}</Num>
                  <Num>{formatNumber(a.profileClicks)}</Num>
                  <Num>{formatNumber(a.websiteClicks)}</Num>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {a.bookOnlineActive ? (
                      formatNumber(a.bookOnlineClicks)
                    ) : (
                      <span className="text-slate-300" title="Book Online CTA not active on GBP">
                        n/a
                      </span>
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
                        <Chip key={p} label={PRODUCT_LABELS[p]} tone="accent" />
                      ))}
                    </div>
                  </td>
                </tr>
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
      return otherProductsOf(a).length - otherProductsOf(b).length;
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

function Num({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-right tabular-nums text-slate-700">{children}</td>;
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
