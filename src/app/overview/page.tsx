import { getAccountsPayload } from "@/lib/data";
import { getViewer, scopeAccounts } from "@/lib/scope";
import AccountsTable from "@/components/AccountsTable";
import CaveNav from "@/components/CaveNav";

// Server component: initial fetch (default window) so the page renders fast;
// the window toggle re-fetches on the client.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function OverviewPage() {
  const [full, viewer] = await Promise.all([getAccountsPayload(), getViewer()]);
  // AMs only see their own book; managers/admins see everything.
  const payload = { ...full, accounts: scopeAccounts(full.accounts, viewer) };

  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {/* Header + health summary now live inside AccountsTable so they react
            to the active filters (see the reactive <header> there). */}
        <AccountsTable initial={payload} />
      </main>
    </>
  );
}
