import { NextResponse } from "next/server";
import { verifyClick, appBaseUrl } from "@/lib/digest";
import { identityFor } from "@/lib/access";
import { logActivity } from "@/lib/activity";

// Digest link target. Validates the HMAC, records the click as adoption evidence
// (attributed to the AM), then redirects into the account dossier — which is
// itself SSO-gated, so the AM signs in and lands on the account. Public (must
// log before the SSO bounce); it only writes an internal analytics row and
// redirects to an internal path, and a bad/forged signature logs nothing.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(req: Request) {
  const base = appBaseUrl();
  const { searchParams } = new URL(req.url);
  const am = (searchParams.get("am") || "").toLowerCase();
  const e = searchParams.get("e") || "";
  const s = searchParams.get("s") || "";

  if (!am || !UUID.test(e) || !verifyClick(am, e, s)) {
    return NextResponse.redirect(`${base}/overview`); // invalid/forged → home, log nothing
  }

  const id = identityFor(am);
  await logActivity(
    { email: am, name: null, role: id?.role ?? "am", amName: id?.amName ?? null },
    { event: "digest_click", surface: "am_digest", entityId: e, detail: { account: e } },
  );

  return NextResponse.redirect(`${base}/account/${e}`);
}
