import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import CaveNav from "@/components/CaveNav";
import ImpactViewer from "@/components/ImpactViewer";

// Admin-only impact readout — evidence of adoption & usage from the activity log.
export const dynamic = "force-dynamic";

export default async function AdminImpactPage() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") redirect("/overview");
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Admin</div>
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">Impact &amp; Adoption</h1>
          <p className="mt-1 text-sm text-slate-400">
            What the tool actually did — distinct users, accounts reviewed, AM adoption, and Alfred questions that replaced a manual pull.
          </p>
        </div>
        <ImpactViewer />
      </main>
    </>
  );
}
