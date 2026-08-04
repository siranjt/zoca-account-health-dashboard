import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import { getAccountsPayload } from "@/lib/data";
import CaveNav from "@/components/CaveNav";
import ArchivesViewer from "@/components/ArchivesViewer";

// Admin-only "Archives" — the full per-account data dump (76 Retool queries),
// moved off the account detail page so its heavy live query fan-out only fires
// when an admin deliberately opens one account here.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminArchivesPage() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") redirect("/overview");
  const payload = await getAccountsPayload();
  const picker = payload.accounts
    .map((a) => ({ entityId: a.entityId, name: a.name, aka: a.aka, am: a.accountManager }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Admin</div>
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">Archives</h1>
          <p className="mt-1 text-sm text-slate-400">
            The full per-account data dump — all 76 Retool queries with viewable SQL. Moved off the detail page and gated to
            admins, since it runs every query live against the warehouse.
          </p>
        </div>
        <ArchivesViewer picker={picker} />
      </main>
    </>
  );
}
