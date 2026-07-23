import { auth } from "@/auth";

// Per-viewer data scoping. AMs are restricted to accounts they own; managers
// and admins see everything. When SSO is off (no session), nothing is scoped —
// the app behaves exactly as before.
export interface Viewer {
  role: "admin" | "manager" | "am" | null;
  amName: string | null;
  email: string | null;
}

export async function getViewer(): Promise<Viewer> {
  try {
    const s = await auth();
    const u = (s?.user ?? null) as Record<string, unknown> | null;
    return {
      role: (u?.role as Viewer["role"]) ?? null,
      amName: (u?.amName as string | null) ?? null,
      email: (u?.email as string | null) ?? null,
    };
  } catch {
    return { role: null, amName: null, email: null };
  }
}

/** Restrict an account list to what this viewer may see. */
export function scopeAccounts<T extends { accountManager: string | null }>(accounts: T[], viewer: Viewer): T[] {
  if (viewer.role === "am") {
    return viewer.amName ? accounts.filter((a) => a.accountManager === viewer.amName) : [];
  }
  return accounts;
}
