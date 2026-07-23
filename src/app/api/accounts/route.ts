import { NextResponse } from "next/server";
import { getAccountsPayload } from "@/lib/data";
import { getViewer, scopeAccounts } from "@/lib/scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const w = Number(searchParams.get("window"));
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const [full, viewer] = await Promise.all([
    getAccountsPayload({ window: Number.isFinite(w) ? w : undefined, from, to }),
    getViewer(),
  ]);
  // AMs only receive their own book; managers/admins get everything.
  const payload = { ...full, accounts: scopeAccounts(full.accounts, viewer) };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
