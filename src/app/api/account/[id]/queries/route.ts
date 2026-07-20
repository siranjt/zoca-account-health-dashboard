import { NextResponse } from "next/server";
import { runRetoolQueries } from "@/lib/retool";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120; // 76 queries, pooled — give them room

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  // Accept a real uuid, or a short mock-seed id (local dev — queries then no-op).
  if (!UUID.test(id) && !/^[a-z0-9]{1,12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const results = await runRetoolQueries(id);
  const ok = results.filter((r) => r.error == null).length;
  return NextResponse.json(
    { total: results.length, ok, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
