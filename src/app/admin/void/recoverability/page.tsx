import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import CaveNav from "@/components/CaveNav";
import RecoverabilityExplainer from "@/components/RecoverabilityExplainer";

// Recoverability explainer — the "why" behind every Rogues tier. Same data +
// same server-side AM scoping as the Rogues route (AMs see only their own book).
export const dynamic = "force-dynamic";

export default async function AdminVoidRecoverabilityPage() {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") redirect("/overview");
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1200px] px-4 py-5">
        <div className="mb-4">
          <a href="/admin/void" className="text-[11px] uppercase tracking-[0.16em] text-cyan-400/70 no-underline hover:text-cyan-300">← Rogues</a>
          <h1 className="cave-decode mt-1 text-2xl font-semibold tracking-tight">Why recoverable?</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every unpaid account, scored 0–100 on whether the missed payment can actually be collected — with the exact
            signals behind each call. Rule-based, not a black box.
          </p>
        </div>
        <RecoverabilityExplainer />
      </main>
    </>
  );
}
