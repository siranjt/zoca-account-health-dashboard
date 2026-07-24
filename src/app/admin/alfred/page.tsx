import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import CaveNav from "@/components/CaveNav";
import AlfredUsageViewer from "@/components/AlfredUsageViewer";

// Admin-only Alfred usage + conversation log.
export const dynamic = "force-dynamic";

export default async function AdminAlfredPage() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") redirect("/overview");
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">Admin</div>
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">Alfred Usage</h1>
        </div>
        <AlfredUsageViewer />
      </main>
    </>
  );
}
