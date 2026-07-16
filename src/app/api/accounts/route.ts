import { NextResponse } from "next/server";
import { getAccountsPayload } from "@/lib/data";

// Always run fresh (no static caching) so numbers reflect the latest query.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = await getAccountsPayload();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
