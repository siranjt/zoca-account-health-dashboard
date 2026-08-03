import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import { ssoConfigured } from "@/lib/access";
import { neonUrl } from "@/lib/neon";
import { getAmRuns, getAmTrend } from "@/lib/amSnapshot";
import { buildAmReportView, parseTrend } from "@/lib/amMetrics";
import CaveNav from "@/components/CaveNav";
import AmReport from "@/components/AmReport";

// Owner-only AM daily report. Reads alfred.am_daily and alfred.am_daily_run —
// it never computes a metric. The compute lives in src/lib/amReport.ts behind
// the 17:30 IST cron, and having exactly one implementation is the point: the
// TypeScript port and the Python workbook disagreed across a seven-minute gap
// on 29/07 when there were two.
//
// The real 403 for a signed-in non-admin is issued by src/middleware.ts, which
// can set a status code where a page cannot. The guard below is the second
// lock on the same door — deliberate duplication on an auth path.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: "var(--am-bad)", background: "var(--am-bad-wash)" }}>
      <div className="text-sm font-semibold tracking-[0.14em]" style={{ color: "var(--am-bad)" }}>
        {title}
      </div>
      <p className="mt-1 text-[12px] text-slate-400">{body}</p>
    </div>
  );
}

export default async function AmReportPage() {
  const viewer = await getViewer();

  // Signed out under configured SSO: back to the gate, with a return path.
  // (The middleware normally catches this first.)
  if (ssoConfigured() && !viewer.email) redirect("/signin?callbackUrl=%2Fam-report");

  if (!ssoConfigured()) {
    // No roster means no roles, so "owner only" cannot be enforced. Refuse
    // rather than open — CLAUDE.md hard rule 6: never degrade an auth path.
    return (
      <>
        <CaveNav />
        <main className="mx-auto max-w-[1600px] px-4 py-5">
          <Locked
            title="LOCKED — access control not configured"
            body="ACCESS_CONTROL, AUTH_GOOGLE_ID/SECRET or AUTH_SECRET is missing, so no role can be resolved and owner-only cannot be enforced. This page stays shut rather than opening to whoever reaches it."
          />
        </main>
      </>
    );
  }

  if (viewer.role !== "admin") {
    return (
      <>
        <CaveNav />
        <main className="mx-auto max-w-[1600px] px-4 py-5">
          <Locked
            title="403 — FORBIDDEN"
            body="This report is restricted to the platform owner. Your account is signed in but does not hold the admin role."
          />
        </main>
      </>
    );
  }

  const dbConfigured = !!neonUrl();
  // Both helpers return [] rather than throwing when DATABASE_URL is unset, so
  // the page degrades to an empty state instead of crashing.
  const [trend, runs] = await Promise.all([getAmTrend(), getAmRuns(60)]);
  const view = buildAmReportView(parseTrend(trend));

  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Owner</div>
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">AM Daily Report</h1>
          <p className="mt-1 text-sm text-slate-400">
            Read straight from the daily snapshot in <code>alfred.am_daily</code>. Nothing on this page is recomputed —
            if a number here is wrong, it is wrong in the snapshot, and the workbook says the same thing.
          </p>
        </div>
        <AmReport view={view} runs={runs} dbConfigured={dbConfigured} />
      </main>
    </>
  );
}
