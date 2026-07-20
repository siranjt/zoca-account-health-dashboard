import { NextResponse } from "next/server";
import { getBookTrend } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const series = await getBookTrend();
    return NextResponse.json({ series }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ series: [], error: String((e as Error)?.message || e).slice(0, 200) });
  }
}
