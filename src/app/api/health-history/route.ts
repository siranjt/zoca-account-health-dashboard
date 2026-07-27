import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getHealthHistory, getHealthSeries } from "@/lib/healthHistory";

// Per-account health history for the Trends "Account health over time" view.
// Scoped to the viewer (AMs see only their own book). ?entity=<id> returns one
// account's full line; otherwise book trajectory + decliners.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const viewer = await getViewer();
  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");

  if (entity) {
    const series = await getHealthSeries(entity, viewer);
    if (!series) return NextResponse.json({ error: "not found or out of scope" }, { status: 404 });
    return NextResponse.json(series, { headers: { "Cache-Control": "no-store" } });
  }

  const lookback = Number(searchParams.get("lookback")) || 4;
  const payload = await getHealthHistory(viewer, { lookback });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
