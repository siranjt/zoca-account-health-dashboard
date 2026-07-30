import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getLeadDroughts } from "@/lib/leadDroughts";

// Admin-only lead-drought readout: accounts with no incoming leads for a
// continuous stretch. JSON by default; ?format=csv&days=N returns the accounts
// dry for >= N days.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await getLeadDroughts();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("format") === "csv") {
    // Exclusive band: [days, next threshold). Matches the on-screen toggle.
    const THRESHOLDS = [3, 7, 14, 30];
    const days = Math.max(1, Number(searchParams.get("days")) || 3);
    const idx = THRESHOLDS.indexOf(days);
    const upper = idx >= 0 && idx < THRESHOLDS.length - 1 ? THRESHOLDS[idx + 1] : Infinity;
    const dry = rows.filter((r) => r.droughtDays >= days && r.droughtDays < upper);
    const esc = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const header = ["Account", "AM", "State", "Days since last lead", "Last lead", "MRR", "Health", "Leads masked"];
    const body = dry.map((r) => [r.name ?? "", r.amName ?? "", r.state ?? "", r.droughtDays, r.neverHadLead ? "never" : r.lastLead ?? "", r.mrr ?? "", r.healthTier ?? "", r.leadsMasked ? "yes" : "no"]);
    const csv = [header, ...body].map((r) => r.map(esc).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="lead-droughts-${days}d.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
