import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scope";
import CaveNav from "@/components/CaveNav";
import VoidViewer from "@/components/VoidViewer";

// Admin-only unpaid-invoice book (Void) — every Chargebee invoice in
// payment_due / not_paid, enriched with the entity / AM / biz / phone to chase it.
export const dynamic = "force-dynamic";

export default async function AdminVoidPage() {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") redirect("/overview");
  const isAm = viewer.role === "am";
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/70">{isAm ? "Your book" : "Admin"}</div>
          <h1 className="cave-decode text-2xl font-semibold tracking-tight">Rogues</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isAm
              ? "Your unpaid invoices — every Chargebee invoice on your accounts that's payment-due or not-paid, with the phone and context to chase it."
              : "The unpaid-invoice book — every Chargebee invoice that's payment-due or not-paid, with the account, AM, and phone to chase it. Off-book (churned/unmapped) invoices are kept and flagged."}
          </p>
        </div>
        <VoidViewer />
      </main>
    </>
  );
}
