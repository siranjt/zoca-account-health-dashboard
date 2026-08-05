import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import CaveNav from "@/components/CaveNav";
import UnrespondedViewer from "@/components/UnrespondedViewer";

// Unresponded app-chat messages — conversations awaiting an AM reply. Visible to
// admin / manager / am; AMs see only their own accounts (scoped server-side).
export const dynamic = "force-dynamic";

export default async function AdminUnrespondedPage() {
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
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">Unresponded</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isAm ? "Your accounts" : "Accounts"} whose last app-chat message from the customer has gone without a reply —
            longest wait first. The message shown is what the customer is waiting on; open the account for the full
            context.
          </p>
        </div>
        <UnrespondedViewer isAdmin={isAdmin} />
      </main>
    </>
  );
}
