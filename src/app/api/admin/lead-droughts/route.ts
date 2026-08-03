import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getLeadDroughts, scopeDroughts } from "@/lib/leadDroughts";

// Lead-drought readout: accounts with no incoming leads for a continuous stretch.
// Visible to admin / manager / am; AMs are scoped server-side to their own
// accounts only (fail-closed). JSON by default; ?format=csv&days=N exports the
// SAME scoped set for accounts dry >= N days.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // SECURITY BOUNDARY: scope to the viewer BEFORE anything is returned/exported.
  const rows = scopeDroughts(await getLeadDroughts(), viewer);
  const { searchParams } = new URL(req.url);

  if (searchParams.get("format") === "csv") {
    // Exclusive band: [days, next threshold). Matches the on-screen toggle.
    const THRESHOLDS = [3, 7, 14, 30];
    const days = Math.max(1, Number(searchParams.get("days")) || 3);
    const idx = THRESHOLDS.indexOf(days);
    const upper = idx >= 0 && idx < THRESHOLDS.length - 1 ? THRESHOLDS[idx + 1] : Infinity;
    const am = searchParams.get("am") || "";
    const health = searchParams.get("health") || "";
    const tierGroup = (tier: string | null) => {
      const t = (tier || "").toUpperCase();
      if (t.includes("CRITICAL")) return "Critical";
      if (t.includes("RISK")) return "At-risk";
      if (t.includes("MONITOR")) return "Monitor";
      if (t.includes("HEALTHY")) return "Healthy";
      return "Other";
    };
    const dry = rows.filter((r) =>
      r.droughtDays >= days && r.droughtDays < upper &&
      (am === "" || r.amName === am) &&
      (health === "" || tierGroup(r.healthTier) === health));
    const esc = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const header = ["Account", "AM", "Location", "Days since last lead", "Last lead", "MRR", "Health", "Leads masked"];
    const body = dry.map((r) => [r.name ?? "", r.amName ?? "", r.location ?? "", r.droughtDays, r.neverHadLead ? "never" : r.lastLead ?? "", r.mrr ?? "", r.healthTier ?? "", r.leadsMasked ? "yes" : "no"]);
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
