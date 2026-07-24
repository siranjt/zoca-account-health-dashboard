import "server-only";
import { getSql, neonUrl } from "@/lib/neon";

// ===========================================================================
// Activity logging for CAVE//OS. Every user action lands in one Neon table
// (cave_activity_log) and — for the notable ones — pings a Slack channel in
// real time. The actor is always taken from the signed-in session server-side,
// so "who did what" is trustworthy and un-spoofable. Fire-and-forget: a DB or
// Slack failure is warned, never propagated to the user.
// ===========================================================================

export type CaveRole = "admin" | "manager" | "am" | null;

export interface Actor {
  email: string | null;
  name: string | null;
  role: CaveRole;
  amName: string | null;
}

export interface ActivityInput {
  event: string;
  surface?: string | null;
  entityId?: string | null;
  detail?: Record<string, unknown> | null;
}

// Events recorded in the DB but NEVER posted to Slack — private content
// (Alfred conversations) that we keep for making Alfred smarter + usage
// analytics, but must not leak into the channel.
const SILENT = new Set(["alfred_asked"]);

let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS cave_activity_log (
    id BIGSERIAL PRIMARY KEY,
    email TEXT,
    name TEXT,
    role TEXT,
    am_name TEXT,
    event TEXT NOT NULL,
    surface TEXT,
    entity_id TEXT,
    detail JSONB,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cave_activity_ts ON cave_activity_log (ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cave_activity_email_ts ON cave_activity_log (email, ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cave_activity_event_ts ON cave_activity_log (event, ts DESC)`;
  ensured = true;
}

export async function logActivity(actor: Actor, input: ActivityInput): Promise<void> {
  try {
    if (neonUrl()) {
      await ensureTable();
      const sql = getSql();
      await sql`INSERT INTO cave_activity_log (email, name, role, am_name, event, surface, entity_id, detail)
        VALUES (${actor.email}, ${actor.name}, ${actor.role}, ${actor.amName}, ${input.event},
                ${input.surface ?? null}, ${input.entityId ?? null},
                ${input.detail ? JSON.stringify(input.detail) : null})`;
    }
  } catch (e) {
    console.warn("[activity] db write failed:", e);
  }
  // Every event is reflected in Slack in real time — except SILENT ones
  // (Alfred conversations), which stay DB-only for privacy.
  if (!SILENT.has(input.event)) {
    postActivitySlack(formatLine(actor, input)).catch(() => {});
  }
}

// ---- Slack ----------------------------------------------------------------

export async function postActivitySlack(text: string): Promise<void> {
  const url = process.env.ACTIVITY_SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* never throw */
  }
}

export function who(a: Actor): string {
  const name = a.name || (a.email ? a.email.split("@")[0] : "Someone");
  const role =
    a.role === "am" ? `AM · ${a.amName || "?"}` :
    a.role === "manager" ? "Manager" :
    a.role === "admin" ? "Admin" : "";
  return role ? `*${name}* (${role})` : `*${name}*`;
}

// Human label for a page_view surface (the pathname).
function pageLabel(surface: string | null | undefined): string {
  const p = surface || "/";
  if (p === "/") return "the launchpad";
  if (p === "/overview") return "the overview";
  if (p === "/trends") return "trends";
  if (p.startsWith("/account/")) return "an account page";
  if (p === "/admin/activity") return "the activity log";
  if (p === "/signin") return "the sign-in page";
  return p;
}

function formatLine(a: Actor, i: ActivityInput): string {
  const d = i.detail || {};
  const biz = (d.bizname as string) || (d.name as string) || i.entityId || "an account";
  switch (i.event) {
    case "sign_in": return `:wave: ${who(a)} signed in`;
    case "sign_out": return `:door: ${who(a)} signed out`;
    case "page_view": return `:eyes: ${who(a)} viewed ${pageLabel(i.surface)}`;
    case "account_opened": return `:mag: ${who(a)} opened *${biz}*`;
    case "tab_viewed": return `:bookmark_tabs: ${who(a)} opened the *${d.tab ?? "?"}* tab on *${biz}*`;
    case "alfred_asked": return `:robot_face: ${who(a)} asked Alfred: _${String(d.question ?? "").slice(0, 200)}_`;
    case "window_changed": return `:calendar: ${who(a)} set the metrics window to *${d.window ?? "?"}*`;
    case "filter_changed": return `:mag_right: ${who(a)} filtered the overview${d.label ? ` — ${d.label}` : ""}`;
    case "search": return `:mag: ${who(a)} searched "${String(d.query ?? "").slice(0, 80)}"`;
    case "csv_exported": return `:page_facing_up: ${who(a)} exported *${d.count ?? "?"}* accounts to CSV`;
    case "product_toggled": return `:package: ${who(a)} checked *${d.product}* MRR on *${biz}*`;
    case "website_checked": return `:globe_with_meridians: ${who(a)} ran a website check on *${biz}*`;
    case "view_saved": return `:bookmark: ${who(a)} saved a view "${d.name ?? ""}"`;
    default: return `:point_right: ${who(a)} — ${i.event}${d.bizname ? ` · ${d.bizname}` : ""}`;
  }
}
