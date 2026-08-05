import "server-only";
import { fetchPublicQuestionJson } from "@/lib/metabase";

// ===========================================================================
// Unresponded messages (per-AM): app-chat conversations where a customer's
// message has gone without a reply. This is the servicing counterpart to
// Rogues (unpaid invoices) and Bat-Signal (lead droughts): a scoped worklist
// so an AM can see, at a glance, which of THEIR accounts are waiting on them.
//
// Source is a PUBLIC Metabase question (6e4f5933-…) the CS team maintains, so
// the "unresponded" definition lives with them, not re-implemented here. Each
// row already carries rm_name — the same AM display-name space as the roster
// and cx.health_score.am_name — so scoping is an exact name match, identical to
// scopeDroughts / scopeVoidInvoices. No location_entity_id join, no zero-row
// trap.
// ===========================================================================

/** Public question maintained by CS — the source of "which messages are unanswered". */
export const UNRESPONDED_QUESTION_UUID = "6e4f5933-4870-4a94-875c-93f4ce5de3fe";

export interface UnrespondedRow {
  entityId: string | null; // location_entity_id → the CAVE//OS account
  conversationId: string | null;
  name: string | null; // conversation label, e.g. "Salon CoCo BOND Spa-Erin"
  amName: string | null; // rm_name — the AM who owns the reply
  sender: string | null; // who sent the last (unanswered) message
  teamMembers: string | null;
  lastMessage: string | null; // the unanswered message body (shown to the scoped AM only)
  hoursWaiting: number; // hours_without_response
  hasMissedInvoice: boolean;
  messageTime: string | null; // ISO timestamp of the last message
}

const TTL_MS = 5 * 60_000; // 5 min — a servicing worklist should feel near-live
let cache: { at: number; rows: UnrespondedRow[] } | null = null;
let inflight: Promise<UnrespondedRow[]> | null = null;

export async function getUnresponded(): Promise<UnrespondedRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    const raw = await fetchPublicQuestionJson(UNRESPONDED_QUESTION_UUID);
    const out: UnrespondedRow[] = raw.map((r) => ({
      entityId: (r.location_entity_id as string) || null,
      conversationId: (r.conversation_id as string) || null,
      name: (r.conversation_name as string) || null,
      amName: (r.rm_name as string) || null,
      sender: (r.sender_name as string) || null,
      teamMembers: (r.team_members as string) || null,
      lastMessage: (r.last_message as string) || null,
      hoursWaiting: r.hours_without_response != null ? Number(r.hours_without_response) : 0,
      hasMissedInvoice: r.has_missed_invoice === true,
      messageTime: (r.message_time as string) || null,
    }));
    // Longest-waiting first — the reply that is most overdue is the one to make.
    out.sort((a, b) => b.hoursWaiting - a.hoursWaiting);
    cache = { at: Date.now(), rows: out };
    return out;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Restrict the list to what a viewer may see. AMs see ONLY their own accounts
 *  (exact amName match, same rule as scopeDroughts); an AM with no amName sees
 *  nothing (fail-closed). Managers and admins see everything. Apply server-side
 *  — never rely on the client's filters. */
export function scopeUnresponded(
  rows: UnrespondedRow[],
  viewer: { role: string | null; amName: string | null },
): UnrespondedRow[] {
  if (viewer.role === "am") {
    return viewer.amName ? rows.filter((r) => r.amName === viewer.amName) : [];
  }
  return rows;
}
