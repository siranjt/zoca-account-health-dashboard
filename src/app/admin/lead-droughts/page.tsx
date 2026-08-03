import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import CaveNav from "@/components/CaveNav";
import LeadDroughtViewer from "@/components/LeadDroughtViewer";

// Admin-only lead-drought view — accounts with no incoming leads for a
// continuous 3 / 7 / 14 / 30-day stretch, switchable by the toggle.
export const dynamic = "force-dynamic";

export default async function AdminLeadDroughtsPage() {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") redirect("/overview");
  const isAdmin = viewer.role === "admin";
  const isAm = viewer.role === "am";
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">{isAm ? "Your book" : "Admin"}</div>
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">Bat-Signal</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isAm ? "Your accounts that have gone quiet" : "Accounts that have gone quiet"} — no incoming website leads for a continuous stretch. Toggle the window;
            accounts with leads masked are dry by design and flagged separately.
          </p>
        </div>
        <LeadDroughtViewer isAdmin={isAdmin} />
      </main>
    </>
  );
}
