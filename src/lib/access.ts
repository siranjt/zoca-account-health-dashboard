// ===========================================================================
// Role-based access control.
//
// The roster (who can sign in, their role, and — for AMs — which account-manager
// book they own) is supplied via the ACCESS_CONTROL env var as JSON so that
// employee emails never live in this public repo. Shape:
//
//   {
//     "admins":  ["success@zoca.com", ...],
//     "managers":["chetan.m@zoca.com", ...],
//     "ams":     { "sudha.g@zoca.com": "Sudha Goutami", ... }
//   }
//
// SSO (Google) only activates when both the Google credentials and AUTH_SECRET
// are present; otherwise the app falls back to its previous gate, so deploying
// this code never locks anyone out before the env is configured.
// ===========================================================================

export type Role = "admin" | "manager" | "am";
export interface Identity {
  email: string;
  role: Role;
  /** For AMs only: the exact accountManager name to scope their book. */
  amName: string | null;
}

interface AccessConfig {
  admins: string[];
  managers: string[];
  ams: Record<string, string>; // email -> AM display name
}

let cached: AccessConfig | null | undefined;

function loadConfig(): AccessConfig | null {
  if (cached !== undefined) return cached;
  const raw = process.env.ACCESS_CONTROL;
  if (!raw) return (cached = null);
  try {
    const parsed = JSON.parse(raw) as Partial<AccessConfig>;
    const norm = (a?: string[]) => (a ?? []).map((s) => s.trim().toLowerCase());
    const ams: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.ams ?? {})) ams[k.trim().toLowerCase()] = String(v);
    cached = { admins: norm(parsed.admins), managers: norm(parsed.managers), ams };
    return cached;
  } catch (err) {
    console.error("[access] ACCESS_CONTROL is not valid JSON:", err);
    return (cached = null);
  }
}

/** True once Google SSO is fully configured (credentials + secret + roster). */
export function ssoConfigured(): boolean {
  const hasGoogle = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const hasSecret = !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  return hasGoogle && hasSecret && loadConfig() !== null;
}

/** Resolve an email to its Identity, or null if the email is not on the roster. */
export function identityFor(email?: string | null): Identity | null {
  if (!email) return null;
  const cfg = loadConfig();
  if (!cfg) return null;
  const e = email.trim().toLowerCase();
  if (cfg.admins.includes(e)) return { email: e, role: "admin", amName: null };
  if (cfg.managers.includes(e)) return { email: e, role: "manager", amName: null };
  if (e in cfg.ams) return { email: e, role: "am", amName: cfg.ams[e] };
  return null;
}
