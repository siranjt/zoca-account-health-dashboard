"use client";

import { useEffect, useState } from "react";
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

        <ChartCard title="Lead → booking funnel" subtitle="last 90 days">
          {detail ? <FunnelChart f={detail.funnel} /> : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Products active">
          <div className="flex flex-wrap gap-1.5">
            {account.activeProducts.length ? (
              account.activeProducts.map((p) => (
                <span key={p} className={`rounded px-2 py-1 text-xs font-medium ${p === "Discovery" ? "bg-slate-100 text-slate-600" : "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"}`}>{p}</span>
              ))
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Stat label="MRR" value={account.mrr != null ? `$${account.mrr}` : "—"} />
            <Stat label="Keywords" value={account.keywordsTracked ?? "—"} />
            <Stat label="Top-3 %" value={account.keywordsTop3Pct != null ? `${account.keywordsTop3Pct}%` : "—"} />
            <Stat label="Impressions" value={account.keywordImpressions} />
          </div>
        </ChartCard>

        <ChartCard title="Profile clicks (weekly)" subtitle="last 26 weeks">
          {detail ? (
            <MultiLineChart
              xLabels={detail.profileWeekly.map((w) => w.wk)}
              series={[{ name: "Profile clicks", color: VIZ.series[0], values: detail.profileWeekly.map((w) => w.profileClicks) }]}
            />
          ) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Profile metrics (weekly)" subtitle="website · calls · directions · leads">
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

        <ChartCard title="Leads vs Reviews" subtitle="monthly, last 12 months">
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

        <ChartCard title="App engagement" subtitle="weekly in-app screen opens (Mixpanel)">
          {detail ? (detail.appUsage?.length ? (
            <MultiLineChart xLabels={detail.appUsage.map((w) => w.wk)} series={[
              { name: "App opens", color: VIZ.series[0], values: detail.appUsage.map((w) => w.appOpen) },
              { name: "Leads", color: VIZ.series[1], values: detail.appUsage.map((w) => w.leads) },
              { name: "Reviews", color: VIZ.series[2], values: detail.appUsage.map((w) => w.reviews) },
              { name: "Photos", color: VIZ.series[3], values: detail.appUsage.map((w) => w.photos) },
            ]} />
          ) : <NoData />) : <Skeleton error={error} />}
        </ChartCard>

        <ChartCard title="Leads vs bookings" subtitle="weekly unique, last 3 months (scheduling)">
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

        <ChartCard title="Comms activity" subtitle="weekly chat · calls · SMS · email · meetings, last 3 months">
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
