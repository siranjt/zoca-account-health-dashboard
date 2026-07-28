import { NextResponse } from "next/server";
import { getAccountContext } from "@/lib/accountContext";

// Extra AM context for the dossier: contact, retention narrative, adoption/setup.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const ctx = await getAccountContext(id);
  return NextResponse.json(ctx, { headers: { "Cache-Control": "no-store" } });
}
