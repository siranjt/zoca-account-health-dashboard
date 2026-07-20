import { NextResponse } from "next/server";
import { getActivity } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getActivity();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ from: null, to: null, changes: [], error: String((e as Error)?.message || e).slice(0, 200) });
  }
}
