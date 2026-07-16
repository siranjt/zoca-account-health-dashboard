import { NextResponse } from "next/server";
import { getAccountsPayload } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const w = Number(searchParams.get("window"));
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const payload = await getAccountsPayload({
    window: Number.isFinite(w) ? w : undefined,
    from,
    to,
  });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
