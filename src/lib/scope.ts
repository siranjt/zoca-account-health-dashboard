import { auth } from "@/auth";

// Per-viewer data scoping. AMs are restricted to accounts they own; managers
// and admins see everything. When SSO is off (no session), nothing is scoped —
// the app behaves exactly as before.
export interface Viewer {
  role: "admin" | "manager" | "am" | null;
  amName: string | null;
  email: string | null;
  name: string | null; // display name (for addressing the user by first name)
}

export async function getViewer(): Promise<Viewer> {
  try {
    const s = await auth();
    const u = (s?.user ?? null) as Record<string, unknown> | null;
    return {
      role: (u?.role as Viewer["role"]) ?? null,
      amName: (u?.amName as string | null) ?? null,
      email: (u?.email as string | null) ?? null,
      name: (u?.name as string | null) ?? null,
    };
  } catch {
    return { role: null, amName: null, email: null, name: null };
  }
}

// Non-admins who may open the admin analytics tools (Impact / Activity / Alfred)
// WITHOUT holding the full admin role. Kept here as the single source of truth so
// the page guards, API guards, and nav all read the same rule. Emails lowercased.
// NOTE: this does NOT grant /am-report or /admin/archives — those stay admin-only.
export const ADMIN_TOOL_EMAILS = ["robin@zoca.com"];

/** True if this viewer may open Impact / Activity / Alfred: any admin, plus the
 *  explicitly-listed ADMIN_TOOL_EMAILS. */
export function canUseAdminTools(v: Pick<Viewer, "role" | "email">): boolean {
  if (v.role === "admin") return true;
  return ADMIN_TOOL_EMAILS.includes((v.email || "").trim().toLowerCase());
}

/** Restrict an account list to what this viewer may see. */
export function scopeAccounts<T extends { accountManager: string | null }>(accounts: T[], viewer: Viewer): T[] {
  if (viewer.role === "am") {
    return viewer.amName ? accounts.filter((a) => a.accountManager === viewer.amName) : [];
  }
  return accounts;
}
