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
} from "./Charts";

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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-white px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-semibold tabular-nums text-slate-700">{value}</div>
    </div>
  );
}
