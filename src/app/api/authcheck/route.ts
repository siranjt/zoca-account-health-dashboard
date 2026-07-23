import { NextResponse } from "next/server";
import { ssoConfigured } from "@/lib/access";

// SAFE diagnostic — reports only whether each auth env piece is present + valid.
// Never returns any secret value or email. Temporary, used to verify SSO wiring.
export const dynamic = "force-dynamic";

export function GET() {
  let acValid = false;
  let counts: { admins: number; managers: number; ams: number } | null = null;
  try {
    const raw = process.env.ACCESS_CONTROL;
    if (raw) {
      const j = JSON.parse(raw);
      acValid = true;
      counts = {
        admins: Array.isArray(j.admins) ? j.admins.length : 0,
        managers: Array.isArray(j.managers) ? j.managers.length : 0,
        ams: j.ams && typeof j.ams === "object" ? Object.keys(j.ams).length : 0,
      };
    }
  } catch {
    acValid = false;
  }
  return NextResponse.json({
    ssoConfigured: ssoConfigured(),
    hasGoogleId: !!process.env.AUTH_GOOGLE_ID,
    hasGoogleSecret: !!process.env.AUTH_GOOGLE_SECRET,
    hasAuthSecret: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    hasAccessControl: !!process.env.ACCESS_CONTROL,
    accessControlValidJSON: acValid,
    rosterCounts: counts,
  });
}
