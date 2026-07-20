"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountDetail, AccountRow, PaymentInvoice } from "@/lib/types";
import type { PickerItem } from "@/app/account/[id]/page";
import { VIZ } from "@/lib/theme";
import HealthDot from "./HealthDot";
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
} from "./Charts";
import { formatNumber, formatDuration, formatTenure } from "@/lib/format";
import RetoolAllData from "./RetoolAllData";

const WINDOWS = [7, 30, 90, 180];

// Sections mirror the real Retool "Customer Dashboard" export order/vocabulary:
// Profile & GBP → Reviews → Funnel & Leads → Rankings → Payments → Scheduling & App.
// "All Data" runs every one of the 76 Retool queries live, with viewable SQL.
const TABS = [
  "Profile & GBP",
  "Reviews",
  "Funnel & Leads",
  "Rankings",
  "Payments",
  "Scheduling & App",
  "All Data (76)",
] as const;
type Tab = (typeof TABS)[number];

const HEALTH_HEX: Record<string, string> = { green: "#16a34a", yellow: "#d97706", red: "#dc2626" };

export default function AccountDossier({
  account,
  picker,
  initialWindow,
}: {
  account: AccountRow;
  picker: PickerItem[];
  initialWindow: number;
}) {
  const router = useRouter();
  const [windowDays, setWindowDays] = useState<number>(WINDOWS.includes(initialWindow) ? initialWindow : 30);
  const [tab, setTab] = useState<Tab>("Profile & GBP");
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(false);
    fetch(`/api/account/${account.entityId}?window=${windowDays}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [account.entityId, windowDays]);

  const h = account.health;
  const skel = <Skeleton error={error} />;
  const pay = detail?.payments;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5">
      {/* ── Customer Dashboard header (Retool: "#### Customer Dashboard" + Location Name) ── */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Customer Dashboard</span>
        <select
          value={account.entityId}
          onChange={(e) => router.push(`/account/${e.target.value}`)}
          className="min-w-[280px] max-w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {picker.map((p) => (
            <option key={p.entityId} value={p.entityId}>
              {p.color === "red" ? "🔴 " : p.color === "yellow" ? "🟡 " : "🟢 "}
              {p.name}
              {p.am ? ` — ${p.am}` : ""}
            </option>
          ))}
        </select>

        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-slate-300" title="Window applies to leads, reviews, clicks and time-series. Rankings, payments and health reflect current state.">
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-2.5 py-1 text-xs font-medium ${
                windowDays === d ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <header
        className="mb-4 rounded-xl border p-4"
        style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-1.5"><HealthDot health={h} /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{account.name}</h1>
              <div className="mt-0.5 text-sm text-slate-400">
                {[account.city, account.state].filter(Boolean).join(", ") || "—"}
                {account.accountManager ? ` · AM ${account.accountManager}` : ""}
                {" · "}
                {formatTenure(account.tenureDays)} with Zoca
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {account.activeProducts.length ? (
                  account.activeProducts.map((p) => (
                    <span
                      key={p}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        p === "Discovery" ? "bg-slate-100 text-slate-600" : "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                      }`}
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No active products</span>
                )}
              </div>
            </div>
          </div>

          <div
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ color: HEALTH_HEX[h.color], background: `${HEALTH_HEX[h.color]}1a`, border: `1px solid ${HEALTH_HEX[h.color]}55` }}
            title={h.reason ? `Watch: ${h.reason}` : undefined}
          >
            {h.tierLabel || "—"}
          </div>
        </div>

        {/* KPI strip — Retool header tiles: paid status / next billing / due amount + core metrics */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Composite" value={h.composite != null ? h.composite.toFixed(1) : "—"} />
          <Kpi label="MRR" value={account.mrr != null ? `$${formatNumber(account.mrr)}` : "—"} />
          <Kpi label={`Leads · ${windowDays}d`} value={formatNumber(account.leadsReceived)} />
          <Kpi label={`Reviews · ${windowDays}d`} value={formatNumber(account.reviewsReceived)} />
          <Kpi label="Open tickets" value={formatNumber(account.openTickets)} alert={account.openTickets > 0} />
          <Kpi
            label="Due amount"
            value={pay && pay.unpaid_total_usd > 0 ? `$${formatNumber(Math.round(pay.unpaid_total_usd))}` : account.daysOverdue && account.daysOverdue > 0 ? `${account.daysOverdue}d overdue` : "—"}
            alert={!!(pay && pay.unpaid_total_usd > 0) || !!(account.daysOverdue && account.daysOverdue > 0)}
          />
        </div>
      </header>

      {/* ── section tabs ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--cave-line)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative px-3.5 py-2 text-sm font-medium"
            style={
              tab === t
                ? { color: "var(--cave-cy)", borderBottom: "2px solid var(--cave-cy)" }
                : { color: "#a7c3c8", borderBottom: "2px solid transparent" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── section content ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tab === "Profile & GBP" && (
          <>
            <ChartCard title="Health breakdown" subtitle="engagement · value · product (cx.health_score)">
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

            <ChartCard title="Profile Clicks (Weekly)" subtitle="last 26 weeks (GBP)">
              {detail ? (
                <MultiLineChart
                  xLabels={detail.profileWeekly.map((w) => w.wk)}
                  series={[{ name: "Profile clicks", color: VIZ.series[0], values: detail.profileWeekly.map((w) => w.profileClicks) }]}
                />
              ) : skel}
            </ChartCard>

            <ChartCard title="Profile Metrics (Weekly)" subtitle="website · calls · directions · leads">
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
              ) : skel}
            </ChartCard>

            <ChartCard title="Search Impressions" subtitle="monthly Google search impressions (GBP)">
              {detail ? (detail.impressions?.length ? (
                <MultiLineChart xLabels={detail.impressions.map((m) => m.ym)} series={[
                  { name: "Impressions", color: VIZ.series[0], values: detail.impressions.map((m) => m.impressions) },
                ]} />
              ) : <NoData />) : skel}
            </ChartCard>

            <ChartCard title="Weekly Change in GBP Photos" subtitle="live photos on the profile over time">
              {detail ? (detail.mediaCadence?.length ? (
                <MultiLineChart xLabels={detail.mediaCadence.map((m) => m.wk)} series={[
                  { name: "Live photos", color: VIZ.series[2], values: detail.mediaCadence.map((m) => m.live) },
                ]} />
              ) : <NoData />) : skel}
            </ChartCard>

            <ChartCard title="Total Photos">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Photos uploaded" value={formatNumber(account.photosUploaded)} />
                <Stat label="Profile clicks" value={formatNumber(account.profileClicks)} />
                <Stat label="Website clicks" value={formatNumber(account.websiteClicks)} />
                <Stat label="Book-online" value={account.bookOnlineActive ? formatNumber(account.bookOnlineClicks) : "n/a"} />
              </div>
            </ChartCard>
          </>
        )}

        {tab === "Reviews" && (
          <>
            <ChartCard title="New Reviews / Total Reviews" subtitle="rating distribution + velocity (Google reviews)">
              {detail ? <ReviewsDistChart data={detail.reviewsDist} /> : skel}
            </ChartCard>

            <ChartCard title="Leads Vs Reviews" subtitle="monthly, last 12 months">
              {detail ? <LeadsReviewsChart data={detail.leadsReviews} /> : skel}
            </ChartCard>

            <div className="md:col-span-2 xl:col-span-3">
              <ChartCard title="Reviews List" subtitle="every review · what customers actually said (reviews.reviews)">
                {detail ? <ReviewsList reviews={detail.reviewsList ?? []} /> : skel}
              </ChartCard>
            </div>
          </>
        )}

        {tab === "Funnel & Leads" && (
          <>
            <ChartCard title="Complete Funnel" subtitle="enquiries → opened → contacted → booked">
              {detail ? <FunnelChart f={detail.funnel} /> : skel}
            </ChartCard>

            <ChartCard title="Lead Prediction" subtitle="ICP-predicted vs delivered, 6 months">
              {detail ? <LeadForecastChart data={detail.forecast} /> : skel}
            </ChartCard>

            <ChartCard title="Lead Response Time" subtitle="average across leads in window">
              <div className="space-y-1.5 py-2 text-sm">
                <Row l="Received → Opened" v={formatDuration(account.avgReceivedToOpenedMs)} />
                <Row l="Received → Contacted" v={formatDuration(account.avgReceivedToContactedMs)} />
                <Row l="Opened → Contacted" v={formatDuration(account.avgOpenedToContactedMs)} />
              </div>
            </ChartCard>

            <ChartCard title="Leads vs Bookings" subtitle="weekly unique, last 3 months (scheduling)">
              {detail ? (detail.bookings?.length ? (
                <MultiLineChart xLabels={detail.bookings.map((b) => b.label)} series={[
                  { name: "Leads", color: VIZ.series[0], values: detail.bookings.map((b) => b.leads) },
                  { name: "Bookings", color: VIZ.series[3], values: detail.bookings.map((b) => b.bookings) },
                ]} />
              ) : <NoData />) : skel}
            </ChartCard>

            <div className="md:col-span-2 xl:col-span-3">
              <ChartCard title="Lead Table" subtitle="individual lead records in window (website.booking_enquiries)">
                {detail ? <LeadsTable leads={detail.leadsList ?? []} /> : skel}
              </ChartCard>
            </div>
          </>
        )}

        {tab === "Rankings" && (
          <>
            <ChartCard title="Keyword Rankings" subtitle="best-ranking keywords (local SEO)">
              {detail ? <KeywordRankingsChart data={detail.keywordRankings?.slice(0, 12)} /> : skel}
            </ChartCard>

            <ChartCard title="Rank Trend" subtitle="avg current rank per extraction">
              {detail ? <RankTrendChart data={detail.rankTrend} /> : skel}
            </ChartCard>

            <ChartCard title="Metric Ratios" subtitle="keyword coverage & ranking mix">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Total Keywords" value={account.keywordsTracked ?? "—"} />
                <Stat label="% in Top 3 Ranks" value={account.keywordsTop3Pct != null ? `${account.keywordsTop3Pct}%` : "—"} />
                <Stat label="Avg. Rank" value={account.avgCurrentRank != null ? `#${account.avgCurrentRank}` : "—"} />
                <Stat label="KW Impressions" value={formatNumber(account.keywordImpressions)} />
              </div>
            </ChartCard>

            <div className="md:col-span-2 xl:col-span-3">
              <ChartCard title="Keyword Table" subtitle="every tracked keyword · rank & search volume (local_seo.rank)">
                {detail ? <KeywordTable rows={detail.keywordRankings ?? []} /> : skel}
              </ChartCard>
            </div>
          </>
        )}

        {tab === "Payments" && (
          <>
            <ChartCard title="Ratios" subtitle="auto-collection · MRR · what they've paid (Chargebee)">
              {detail ? <PaymentDetailsChart payments={detail.payments} /> : skel}
            </ChartCard>

            <ChartCard title="Payment Punctuality" subtitle="days paid after due · on-time vs late (Chargebee)">
              {detail ? <PaymentTrendsChart payments={detail.payments} /> : skel}
            </ChartCard>

            <ChartCard title="Refund Details / Due Amount">
              {detail ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Auto-collection" value={pay?.auto_collection ?? "—"} />
                  <Stat label="Active subs" value={pay?.active_subscription_count ?? "—"} />
                  <Stat label="Total paid" value={pay ? `$${formatNumber(Math.round(pay.total_paid_usd))}` : "—"} />
                  <Stat label="Due amount" value={pay ? `$${formatNumber(Math.round(pay.unpaid_total_usd))}` : "—"} />
                  <Stat label="On-time rate" value={pay?.on_time_rate != null ? `${Math.round(pay.on_time_rate * 100)}%` : "—"} />
                  <Stat label="Failed txns" value={pay?.failed_txn_count ?? "—"} />
                </div>
              ) : skel}
            </ChartCard>

            <div className="md:col-span-2 xl:col-span-3">
              <ChartCard title="One Time Invoices" subtitle="newest first · Chargebee">
                {detail ? <InvoiceTable invoices={detail.payments?.invoices ?? []} /> : skel}
              </ChartCard>
            </div>
          </>
        )}

        {tab === "Scheduling & App" && (
          <>
            <ChartCard title="Scheduling & Calls" subtitle="scheduling active · call CTA">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Book-online active" value={account.bookOnlineActive ? "Yes" : "No"} />
                <Stat label="Book-online clicks" value={account.bookOnlineActive ? formatNumber(account.bookOnlineClicks) : "n/a"} />
                <Stat label="Recv → Contacted" value={formatDuration(account.avgReceivedToContactedMs)} />
                <Stat label="Open tickets" value={formatNumber(account.openTickets)} />
              </div>
            </ChartCard>

            <ChartCard title="Total Calls / Comms" subtitle="weekly SMS · calls, last 3 months">
              {detail ? (detail.comms?.length ? (
                <MultiLineChart xLabels={detail.comms.map((c) => c.wk)} series={[
                  { name: "SMS", color: VIZ.series[0], values: detail.comms.map((c) => c.sms) },
                  { name: "Calls", color: VIZ.series[1], values: detail.comms.map((c) => c.call) },
                ]} />
              ) : <NoData />) : skel}
            </ChartCard>

            <ChartCard title="App Metrics" subtitle="weekly in-app screen opens (Mixpanel)">
              {detail ? (detail.appUsage?.length ? (
                <MultiLineChart xLabels={detail.appUsage.map((w) => w.wk)} series={[
                  { name: "App opens", color: VIZ.series[0], values: detail.appUsage.map((w) => w.appOpen) },
                  { name: "Leads", color: VIZ.series[1], values: detail.appUsage.map((w) => w.leads) },
                  { name: "Reviews", color: VIZ.series[2], values: detail.appUsage.map((w) => w.reviews) },
                  { name: "Photos", color: VIZ.series[3], values: detail.appUsage.map((w) => w.photos) },
                ]} />
              ) : <NoData />) : skel}
            </ChartCard>
          </>
        )}

        {tab === "All Data (76)" && (
          <div className="md:col-span-2 xl:col-span-3">
            <RetoolAllData entityId={account.entityId} />
          </div>
        )}
      </div>
    </main>
  );
}

// dd/mm/yy per report conventions.
function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

function InvoiceTable({ invoices }: { invoices: PaymentInvoice[] }) {
  const rows = useMemo(
    () =>
      [...invoices].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da; // newest first
      }),
    [invoices]
  );
  if (!rows.length) return <NoData />;
  return (
    <div className="table-scroll -mx-1 max-h-[420px] overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Date</th>
            <th className="px-2 py-1.5 font-semibold">Due</th>
            <th className="px-2 py-1.5 font-semibold">Paid on</th>
            <th className="px-2 py-1.5 text-right font-semibold">Total</th>
            <th className="px-2 py-1.5 text-right font-semibold">Paid</th>
            <th className="px-2 py-1.5 text-right font-semibold">Due amt</th>
            <th className="px-2 py-1.5 text-right font-semibold">Late</th>
            <th className="px-2 py-1.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv, i) => {
            const late = inv.days_late != null && inv.days_late > 0;
            return (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1.5 tabular-nums text-slate-700">{ddmmyy(inv.date)}</td>
                <td className="px-2 py-1.5 tabular-nums text-slate-500">{ddmmyy(inv.due_date)}</td>
                <td className="px-2 py-1.5 tabular-nums text-slate-500">{ddmmyy(inv.paid_at)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">${formatNumber(Math.round(inv.total_usd))}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">${formatNumber(Math.round(inv.amount_paid_usd))}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${inv.amount_due_usd > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}>
                  {inv.amount_due_usd > 0 ? `$${formatNumber(Math.round(inv.amount_due_usd))}` : "—"}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${late ? "font-semibold text-amber-600" : "text-slate-400"}`}>
                  {late ? `${inv.days_late}d` : inv.paid ? "on time" : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      inv.paid ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {inv.status || (inv.paid ? "paid" : "unpaid")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stars({ n }: { n: number | null }) {
  if (n == null) return <span className="text-slate-400">—</span>;
  const full = Math.max(0, Math.min(5, n));
  return (
    <span className="tracking-tight" title={`${n}/5`}>
      <span style={{ color: "#f59e0b" }}>{"★".repeat(full)}</span>
      <span className="text-slate-300">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function ReviewsList({ reviews }: { reviews: NonNullable<AccountDetail["reviewsList"]> }) {
  if (!reviews.length) return <NoData />;
  return (
    <div className="table-scroll max-h-[540px] space-y-2 overflow-auto pr-1">
      <div className="pb-1 text-xs text-slate-400">{reviews.length} review{reviews.length === 1 ? "" : "s"}</div>
      {reviews.map((r, i) => (
        <div key={i} className="rounded-lg border border-slate-100 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Stars n={r.rating} />
            <span className="font-medium text-slate-700">{r.reviewer || "Anonymous"}</span>
            {r.platform && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{r.platform}</span>
            )}
            <span className="ml-auto tabular-nums text-slate-400">{ddmmyy(r.date)}</span>
          </div>
          {r.text ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{r.text}</p>
          ) : (
            <p className="mt-1.5 text-xs italic text-slate-400">No text — rating only.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function LeadsTable({ leads }: { leads: NonNullable<AccountDetail["leadsList"]> }) {
  if (!leads.length) return <NoData />;
  return (
    <div className="table-scroll -mx-1 max-h-[540px] overflow-auto">
      <div className="px-1 pb-1 text-xs text-slate-400">{leads.length} lead{leads.length === 1 ? "" : "s"}</div>
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Date</th>
            <th className="px-2 py-1.5 font-semibold">Source</th>
            <th className="px-2 py-1.5 font-semibold">Service</th>
            <th className="px-2 py-1.5 font-semibold">Status</th>
            <th className="px-2 py-1.5 text-right font-semibold">Price</th>
            <th className="px-2 py-1.5 font-semibold">UTM</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1.5 tabular-nums text-slate-700">{ddmmyy(l.date)}</td>
              <td className="px-2 py-1.5 text-slate-600">{l.source || "—"}</td>
              <td className="px-2 py-1.5 text-slate-600">{l.service || "—"}</td>
              <td className="px-2 py-1.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{l.status || "—"}</span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                {l.price != null ? `${!l.currency || l.currency === "USD" ? "$" : ""}${formatNumber(l.price)}` : "—"}
              </td>
              <td className="px-2 py-1.5 text-slate-500">{l.utm || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeywordTable({ rows }: { rows: NonNullable<AccountDetail["keywordRankings"]> }) {
  if (!rows.length) return <NoData />;
  return (
    <div className="table-scroll -mx-1 max-h-[540px] overflow-auto">
      <div className="px-1 pb-1 text-xs text-slate-400">{rows.length} keyword{rows.length === 1 ? "" : "s"}</div>
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Keyword</th>
            <th className="px-2 py-1.5 text-right font-semibold">Avg rank</th>
            <th className="px-2 py-1.5 text-right font-semibold">Best rank</th>
            <th className="px-2 py-1.5 text-right font-semibold">Search vol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1.5 text-slate-700">{k.keyword}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${k.avgRank <= 3 ? "font-semibold text-emerald-600" : "text-slate-700"}`}>#{k.avgRank}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">#{k.minRank}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{k.searchVolume != null ? formatNumber(k.searchVolume) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white px-3 py-2 ${alert ? "border-red-200" : "border-slate-200"}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${alert ? "text-red-600" : "text-slate-800"}`}>{value}</div>
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

function Row({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{l}</span>
      <span className="font-medium tabular-nums text-slate-700">{v}</span>
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
