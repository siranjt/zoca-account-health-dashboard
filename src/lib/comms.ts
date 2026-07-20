import "server-only";
import { queryAurora } from "@/lib/metabase";

// ===========================================================================
// Communication Centralisation — omni-channel message history + Linear tickets
// for one account, ported from the Retool "Communication Centralisation" app.
//
// The original app ran everything in ONE monolithic query that seq-scanned
// call_hippo.calls (691K) / .messages (821K) / gmail.emails (223K) and timed
// out at 60s. Here each channel is a SEPARATE entity-scoped, windowed, capped
// query run in parallel (each < 1s), then merged newest-first in JS.
// ===========================================================================

export interface CommsMessage {
  type: string; // App Chat / Call / SMS / Email / Meeting (Fireflies) / Demo Call / Customer Meeting
  at: string | null; // timestamp (text)
  body: string | null;
  sender: string | null; // direction or speaker
}
export interface CommsTicket {
  createdAt: string | null;
  assignee: string | null;
  title: string | null;
  description: string | null;
  state: string | null;
  url: string | null;
}
export interface CommsPayload {
  windowDays: number;
  messages: CommsMessage[];
  tickets: CommsTicket[];
  byType: Record<string, number>;
  total: number;
  capped: boolean;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TOTAL_CAP = 600; // merged messages returned
const BODY_CAP = 8000; // per-message body chars

// Shared CTE fragments (id is a validated UUID string literal).
const csCte = (id: string) =>
  `cs AS (SELECT entity_1_id uid FROM entities.entity_relationships WHERE entity_2_id::text='${id}'
     UNION ALL SELECT entity_2_id FROM entities.entity_relationships WHERE entity_1_id::text='${id}')`;
const phCte = (id: string) =>
  `ph AS (SELECT DISTINCT regexp_replace(phone_number,'\\D','','g') n FROM entities.phones WHERE entity_id::text IN (SELECT uid::text FROM cs)
     UNION SELECT right(phone::text,10) FROM sales.demo_call_tracker WHERE entity_id::text='${id}' AND phone IS NOT NULL)`;
const emCte = (id: string) =>
  `em AS (SELECT email_address e FROM entities.emails WHERE entity_id::text IN (SELECT uid::text FROM cs) AND email_address NOT ILIKE '%zoca%' AND email_address NOT ILIKE '%timely%'
     UNION SELECT sp_email FROM sales.demo_call_tracker WHERE entity_id::text='${id}' AND sp_email IS NOT NULL AND sp_email NOT ILIKE '%zoca%' AND sp_email NOT ILIKE '%timely%')`;

// One SQL builder per channel — each entity-scoped, windowed and LIMITed.
function channelSqls(id: string, days: number): string[] {
  const w = Number.isFinite(days) && days > 0 ? Math.round(days) : 90;
  return [
    // App chat
    `WITH ${csCte(id)}, conv AS (SELECT c.id FROM chat.conversations c JOIN chat.conversation_members cm ON c.id=cm.conversation_id WHERE cm.member_id IN (SELECT uid FROM cs))
     SELECT 'App Chat' message_type, cms.created_at::text created_at, cms.text message_body, cmb.name sender
     FROM chat.messages cms LEFT JOIN chat.members cmb ON cms.from=cmb.member_id
     WHERE cms.is_deleted=false AND cms.conversation_id IN (SELECT id FROM conv) AND cms.created_at >= now()-interval '${w} days'
     ORDER BY cms.created_at DESC LIMIT 200`,
    // Calls (CallHippo + transcript)
    `WITH ${csCte(id)}, ${phCte(id)}
     SELECT 'Call' message_type, c.start_time::text created_at, (ca.transcript #>> array['text'])::text message_body,
       CASE WHEN right(c.from_::text,10) IN (SELECT n FROM ph) THEN 'Client → Us' ELSE 'Us → Client' END sender
     FROM call_hippo.calls c LEFT JOIN call_hippo.call_analysis ca ON ca.call_sid=c.call_sid
     WHERE c.start_time >= now()-interval '${w} days' AND (right(c.from_::text,10) IN (SELECT n FROM ph) OR right(c.to_::text,10) IN (SELECT n FROM ph))
     ORDER BY c.start_time DESC LIMIT 200`,
    // SMS (CallHippo)
    `WITH ${csCte(id)}, ${phCte(id)}
     SELECT 'SMS' message_type, m.time::text created_at, m.content message_body,
       CASE WHEN sms_type='Outgoing' THEN 'Us → Client' ELSE 'Client → Us' END sender
     FROM call_hippo.messages m
     WHERE m.time >= now()-interval '${w} days' AND (right(m.from_::text,10) IN (SELECT n FROM ph) OR right(m.to_::text,10) IN (SELECT n FROM ph))
     ORDER BY m.time DESC LIMIT 200`,
    // Email (Gmail)
    `WITH ${csCte(id)}, ${emCte(id)}
     SELECT 'Email' message_type, ge.received_at::text created_at, concat('Subject: ', ge.subject, E'\\n\\n', left(ge.body,4000)) message_body,
       CASE WHEN ge.from_email IN (SELECT e FROM em) THEN 'Client → Us' ELSE 'Us → Client' END sender
     FROM gmail.emails ge
     WHERE ge.received_at >= now()-interval '${w} days'
       AND (ge.from_email IN (SELECT e FROM em) OR EXISTS(SELECT 1 FROM unnest(string_to_array(ge.to_email,',')) x(o) WHERE trim(x.o) IN (SELECT e FROM em)))
     ORDER BY ge.received_at DESC LIMIT 200`,
    // Fireflies meeting (direct, keyed by entity)
    `SELECT 'Meeting (Fireflies)' message_type, meeting_time::text created_at, left(sentences::text,6000) message_body, 'Video call' sender
     FROM sales.fireflies_meeting WHERE entity_id::text='${id}' AND meeting_time >= now()-interval '${w} days'
     ORDER BY meeting_time DESC LIMIT 50`,
    // Demo call (Sybill via demo_call_tracker)
    `WITH dc AS (SELECT substring(meeting_recording FROM 'conversations/([a-f0-9-]+)') mid, substring(meeting_recording FROM 'shared/([a-f0-9-]+)') mid2 FROM sales.demo_call_tracker WHERE entity_id::text='${id}')
     SELECT 'Demo Call' message_type, smd.timestamp::text created_at, left(smd.transcript::text,6000) message_body, 'Video call' sender
     FROM sales.meeting_data smd JOIN dc ON dc.mid=substring(smd.metadata #>> array['url'] FROM 'id=([a-f0-9-]+)') OR dc.mid2=substring(smd.metadata #>> array['url'] FROM 'id=([a-f0-9-]+)')
     WHERE smd.timestamp >= now()-interval '${w} days' ORDER BY smd.timestamp DESC LIMIT 50`,
    // Customer meeting (Sybill via customer_meetings)
    `WITH cm AS (SELECT substring(meeting_recording FROM 'conversations/([a-f0-9-]+)') mid, substring(meeting_recording FROM 'shared/([a-f0-9-]+)') mid2 FROM sales.customer_meetings WHERE entity_id::text='${id}')
     SELECT 'Customer Meeting' message_type, smd.timestamp::text created_at, left(smd.transcript::text,6000) message_body, 'Video call' sender
     FROM sales.meeting_data smd JOIN cm ON cm.mid=substring(smd.metadata #>> array['url'] FROM 'id=([a-f0-9-]+)') OR cm.mid2=substring(smd.metadata #>> array['url'] FROM 'id=([a-f0-9-]+)')
     WHERE smd.timestamp >= now()-interval '${w} days' ORDER BY smd.timestamp DESC LIMIT 50`,
  ];
}

// Linear tickets for the account (Retool "query7").
function ticketsSql(id: string): string {
  return `SELECT cn.linear_created_at::text linear_created_at, i.assignee_name, i.title, i.description, i.state_name, i.url
    FROM linear.customer_needs cn
    JOIN linear.issues i ON cn.issue_id = i.id
    WHERE cn.customer_external_id = '${id}'
    ORDER BY cn.linear_created_at DESC NULLS LAST LIMIT 200`;
}

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

export async function getComms(entityId: string, windowDays: number): Promise<CommsPayload> {
  const id = UUID.test(entityId) ? entityId : String(entityId).replace(/[^a-z0-9-]/gi, "");
  const w = Number.isFinite(windowDays) && windowDays > 0 ? Math.round(windowDays) : 90;

  const channelRuns = channelSqls(id, w).map((sql) => queryAurora(sql).catch(() => [] as Record<string, unknown>[]));
  const ticketRun = queryAurora(ticketsSql(id)).catch(() => [] as Record<string, unknown>[]);
  const [channels, ticketRows] = await Promise.all([Promise.all(channelRuns), ticketRun]);

  let merged: CommsMessage[] = channels.flat().map((r) => {
    let body = str(r.message_body);
    if (body && body.length > BODY_CAP) body = body.slice(0, BODY_CAP) + "…";
    return { type: String(r.message_type ?? "—"), at: str(r.created_at), body, sender: str(r.sender) };
  });
  // newest first (timestamps cast to text sort lexicographically within same format)
  merged.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const total = merged.length;
  const capped = total > TOTAL_CAP;
  if (capped) merged = merged.slice(0, TOTAL_CAP);

  const byType: Record<string, number> = {};
  for (const m of merged) byType[m.type] = (byType[m.type] ?? 0) + 1;

  const tickets: CommsTicket[] = ticketRows.map((r) => ({
    createdAt: str(r.linear_created_at),
    assignee: str(r.assignee_name),
    title: str(r.title),
    description: str(r.description),
    state: str(r.state_name),
    url: str(r.url),
  }));

  return { windowDays: w, messages: merged, tickets, byType, total, capped };
}
