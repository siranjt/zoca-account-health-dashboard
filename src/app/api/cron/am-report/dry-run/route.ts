import { NextResponse } from "next/server";
import { computeAmSnapshot } from "@/lib/amReport";

// TEMPORARY verification route for the phase-2 port. Runs computeAmSnapshot()
// against production data and returns the rows WITHOUT writing to Neon.
//
// DELETE BEFORE MERGE. Until then it is hard-gated to development: it returns
// account-level aggregates with no auth check, and push to main deploys
// production with no staging gate.
//
//   npm run dev
//   curl -s localhost:3000/api/cron/am-report/dry-run | jq '.wallClockMs, .totals'
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse("not found", { status: 404 });
  const t0 = Date.now();
  try {
    const rows = await computeAmSnapshot();
    const sum = (k: keyof (typeof rows)[number]) =>
      rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return NextResponse.json({
      ok: true,
      wallClockMs: Date.now() - t0,
      amRows: rows.length,
      totals: {
        activeAccounts: sum("activeAccounts"),
        mrr: Math.round(sum("mrr") * 100) / 100,
        missedPaymentAccounts: sum("missedPaymentAccounts"),
        missedPaymentAmount: Math.round(sum("missedPaymentAmount") * 100) / 100,
        churned30d: sum("churned30d"),
        churnedMtd: sum("churnedMtd"),
        retentionRiskTickets: sum("retentionRiskTickets"),
        schedProvisioned: sum("schedProvisioned"),
        schedProductActive: sum("schedProductActive"),
        schedOnboarded: sum("schedOnboarded"),
        schedIncomplete: sum("schedIncomplete"),
        untouchedHuman30d: sum("untouchedHuman30d"),
        untouchedAll30d: sum("untouchedAll30d"),
      },
      unassigned: rows.find((r) => r.amName === "(unassigned)") ?? null,
      zeroBookRows: rows.filter((r) => r.activeAccounts === 0),
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, wallClockMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
