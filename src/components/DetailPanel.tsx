"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountDetail, AccountRow } from "@/lib/types";
import { VIZ } from "@/lib/theme";
import {
  ChartCard,
  MultiLineChart,
  LeadsReviewsChart,
  RankTrendChart,
  FunnelChart,
  HealthBars,
  PaymentTrendsChart,
  PaymentDetailsChart,
  KeywordRankingsChart,
  ReviewsDistChart,
  LeadForecastChart,
  LeadSourcesBars,
  commsSeries,
} from "./Charts";
import WebsiteLiveCard from "./WebsiteLiveCard";

export default function DetailPanel({ account, windowDays }: { account: AccountRow; windowDays: number }) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(false);
    fetch(`/api/account/${account.entityId}?window=${windowDays}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [account.entityId, windowDays]);

  const h = account.health;
  const gran = windowDays <= 31 ? "daily" : windowDays <= 180 ? "weekly" : "monthly";
  const winN = windowDays >= 365 ? "all-time" : `last ${windowDays}d`;

  return (
    <div className="bg-slate-50 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Health breakdown" subtitle="engagement · value · product (from cx.health_score)">
          <HealthBars
            engagement={h.engagement} value={h.value} product={h.product}
            composite={h.composite} tier={h.tierLabel} reason={h.reason}
          />
          {h.recommendedAction && (
            <div className="mt-2 rounded bg-white px-2 py-1 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Action:</span> {h.recommendedAction}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Lead → booking funnel" subtitle={winN}>
          {detail ? <FunnelChart f={detail.funnel} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Products active" subtitle="toggle a product for its own MRR · start date">
          <ProductsActive account={account} detail={detail} />
        </ChartCard>

        <ChartCard title="Profile clicks" subtitle={`${gran} · ${winN}`}>
          {detail ? (
            <MultiLineChart
              xLabels={detail.profileWeekly.map((w) => w.wk)}
              series={[{ name: "Profile clicks", color: VIZ.series[0], values: detail.profileWeekly.map((w) => w.profileClicks) }]}
            />
          ) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Profile metrics" subtitle={`${gran} · website · calls · directions · leads`}>
          {detail ? (
            <MultiLineChart
              xLabels={detail.profileWeekly.map((w) => w.wk)}
              series={[
                { name: "Website", color: VIZ.series[0], values: detail.profileWeekly.map((w) => w.websiteClicks) },
                { name: "Calls", color: VIZ.series[1], values: detail.profileWeekly.map((w) => w.callClicks) },
                { name: "Directions", color: VIZ.series[2], values: detail.profileWeekly.map((w) => w.directions) },
                { name: "Leads", color: VIZ.series[3], values: detail.profileWeekly.map((w) => w.leads) },
              ]}
            />
          ) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Leads vs Reviews" subtitle={`${gran} · ${winN}`}>
          {detail ? <LeadsReviewsChart data={detail.leadsReviews} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Keyword rank trend" subtitle="avg current rank per extraction">
          {detail ? <RankTrendChart data={detail.rankTrend} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Payment punctuality" subtitle="days paid after due · on-time vs late (Chargebee)">
          {detail ? <PaymentTrendsChart payments={detail.payments} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Billing & payments" subtitle="auto-collection · MRR · what they've paid (Chargebee)">
          {detail ? <PaymentDetailsChart payments={detail.payments} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="App engagement" subtitle={`${gran} in-app screen opens · ${winN}`}>
          {detail ? (detail.appUsage?.length ? (
            <MultiLineChart xLabels={detail.appUsage.map((w) => w.wk)} series={[
              { name: "App opens", color: VIZ.series[0], values: detail.appUsage.map((w) => w.appOpen) },
              { name: "Leads", color: VIZ.series[1], values: detail.appUsage.map((w) => w.leads) },
              { name: "Reviews", color: VIZ.series[2], values: detail.appUsage.map((w) => w.reviews) },
              { name: "Photos", color: VIZ.series[3], values: detail.appUsage.map((w) => w.photos) },
            ]} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Leads vs bookings" subtitle={`${gran} unique · ${winN} (scheduling)`}>
          {detail ? (detail.bookings?.length ? (
            <MultiLineChart xLabels={detail.bookings.map((b) => b.label)} series={[
              { name: "Leads", color: VIZ.series[0], values: detail.bookings.map((b) => b.leads) },
              { name: "Bookings", color: VIZ.series[3], values: detail.bookings.map((b) => b.bookings) },
            ]} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Keyword rankings" subtitle="current avg rank per keyword (local SEO)">
          {detail ? <KeywordRankingsChart data={detail.keywordRankings} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Search impressions" subtitle="monthly Google search impressions (GBP)">
          {detail ? (detail.impressions?.length ? (
            <MultiLineChart xLabels={detail.impressions.map((m) => m.ym)} series={[
              { name: "Impressions", color: VIZ.series[0], values: detail.impressions.map((m) => m.impressions) },
            ]} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Reviews detail" subtitle="rating distribution + velocity (Google reviews)">
          {detail ? <ReviewsDistChart data={detail.reviewsDist} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Comms activity" subtitle={`${gran} chat · calls · SMS · email · meetings · ${winN}`}>
          {detail ? (detail.comms?.length ? (
            <MultiLineChart xLabels={detail.comms.map((c) => c.wk)} series={commsSeries(detail.comms)} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Lead sources" subtitle="where this window's leads came from">
          {detail ? (detail.leadSources?.length ? (
            <LeadSourcesBars data={detail.leadSources} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Website status" subtitle="live check on the GBP website">
          <WebsiteLiveCard url={account.websiteUrl} />
        </ChartCard>

        <ChartCard title="GBP content" subtitle="live photos on the profile over time">
          {detail ? (detail.mediaCadence?.length ? (
            <MultiLineChart xLabels={detail.mediaCadence.map((m) => m.wk)} series={[
              { name: "Live photos", color: VIZ.series[2], values: detail.mediaCadence.map((m) => m.live) },
            ]} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Lead forecast vs actual" subtitle="ICP-predicted vs delivered, 6 months">
          {detail ? <LeadForecastChart data={detail.forecast} /> : <Skeleton error={error} />}
        </ChartCard>
      </div>
    </div>
  );
}

function Skeleton({ error }: { error: boolean }) {
  return (
    <div className="flex h-[150px] items-center justify-center text-sm text-slate-400">
      {error ? "Couldn't load charts." : "Loading charts…"}
    </div>
  );
}

function NoData() {
  return <div className="py-8 text-center text-sm text-slate-400">No data for this account.</div>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-white px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-semibold tabular-nums text-slate-700">{value}</div>
    </div>
  );
}

function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}
const money = (v: number) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

function ProdBtn({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? accent ? "bg-cyan-600 text-white" : "bg-indigo-600 text-white"
          : accent ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 hover:bg-cyan-100" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

// "Products active" — per-product MRR + subscription start date, from Chargebee.
// Toggle "Combined" (all products summed) or any single product. Falls back to
// plain product badges + total MRR when no billing breakdown is available.
function ProductsActive({ account, detail }: { account: AccountRow; detail: AccountDetail | null }) {
  const products = useMemo(() => {
    const list = (detail?.productMrr ?? []).slice();
    // Discovery (base) first, then the rest by MRR desc.
    list.sort((a, b) => (a.product === "Discovery" ? -1 : b.product === "Discovery" ? 1 : b.mrr - a.mrr));
    return list;
  }, [detail]);

  const multi = products.length > 1;
  const combinedMrr = products.reduce((s, p) => s + p.mrr, 0);
  const combinedStart = products.map((p) => p.startDate).filter((s): s is string => !!s).sort()[0] ?? null;

  const [sel, setSel] = useState<string>("__combined__");
  useEffect(() => {
    setSel(multi ? "__combined__" : products[0]?.product ?? "__combined__");
  }, [account.entityId, multi, products.length]);

  const hasBreakdown = products.length > 0;
  const selP = products.find((p) => p.product === sel);
  const mrr = sel === "__combined__" ? combinedMrr : selP?.mrr ?? 0;
  const start = sel === "__combined__" ? combinedStart : selP?.startDate ?? null;
  const mrrLabel = !hasBreakdown ? "MRR" : sel === "__combined__" ? "MRR · Combined" : `MRR · ${sel}`;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {hasBreakdown ? (
          <>
            {multi && <ProdBtn label="Combined" active={sel === "__combined__"} onClick={() => setSel("__combined__")} accent />}
            {products.map((p) => (
              <ProdBtn key={p.product} label={p.product} active={sel === p.product} onClick={() => setSel(p.product)} />
            ))}
          </>
        ) : detail == null ? (
          <span className="text-xs text-slate-400">Loading products…</span>
        ) : account.activeProducts.length ? (
          account.activeProducts.map((p) => (
            <span key={p} className={`rounded px-2 py-1 text-xs font-medium ${p === "Discovery" ? "bg-slate-100 text-slate-600" : "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"}`}>{p}</span>
          ))
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label={mrrLabel} value={hasBreakdown ? money(mrr) : account.mrr != null ? money(account.mrr) : "—"} />
        <Stat label={hasBreakdown ? (sel === "__combined__" ? "Started · earliest" : "Started") : "Started"} value={ddmmyy(start)} />
        <Stat label="Keywords" value={account.keywordsTracked ?? "—"} />
        <Stat label="Top-3 %" value={account.keywordsTop3Pct != null ? `${account.keywordsTop3Pct}%` : "—"} />
        <Stat label="Impressions" value={account.keywordImpressions} />
      </div>
    </>
  );
}
