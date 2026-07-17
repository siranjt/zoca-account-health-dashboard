import { getAccountsPayload } from "@/lib/data";
import AccountsTable from "@/components/AccountsTable";
import CaveNav from "@/components/CaveNav";

// Server component: initial fetch (default window) so the page renders fast;
// the window toggle re-fetches on the client.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function OverviewPage() {
  const payload = await getAccountsPayload();

  const greens = payload.accounts.filter((a) => a.health.color === "green").length;
  const yellows = payload.accounts.filter((a) => a.health.color === "yellow").length;
  const reds = payload.accounts.filter((a) => a.health.color === "red").length;

  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Overview</div>
            <h1 className="text-2xl font-semibold tracking-tight">Account Health Dashboard</h1>
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

        <AccountsTable initial={payload} />
      </main>
    </>
  );
}
