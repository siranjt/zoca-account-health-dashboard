import { getAccountsPayload } from "@/lib/data";
import AccountsTable from "@/components/AccountsTable";
import { formatDate } from "@/lib/format";

// Server component: fetch on each request so the dashboard is always live.
export const dynamic = "force-dynamic";

export default async function Home() {
  const payload = await getAccountsPayload();

  const greens = payload.accounts.filter((a) => a.health.color === "green").length;
  const yellows = payload.accounts.filter((a) => a.health.color === "yellow").length;
  const reds = payload.accounts.filter((a) => a.health.color === "red").length;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Account Health Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All active accounts (churned excluded) · {payload.accounts.length} accounts ·
            metrics over last {payload.windowDays} days ·{" "}
            {payload.source === "mock" ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                sample data
              </span>
            ) : (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                live: Metabase
              </span>
            )}{" "}
            · generated {formatDate(payload.generatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#16a34a" }} />
            {greens} healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d97706" }} />
            {yellows} monitor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#dc2626" }} />
            {reds} at risk
          </span>
        </div>
      </header>

      <AccountsTable accounts={payload.accounts} />
    </main>
  );
}
