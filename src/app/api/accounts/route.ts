import { NextResponse } from "next/server";
import { getAccountsPayload } from "@/lib/data";

// Always run fresh (no static caching) so numbers reflect the latest query.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const w = Number(searchParams.get("window"));
  const payload = await getAccountsPayload(Number.isFinite(w) ? w : undefined);
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
