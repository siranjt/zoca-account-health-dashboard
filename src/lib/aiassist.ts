import "server-only";
import { getComms } from "@/lib/comms";

// AI Assist — the Retool "LLM Response" widget. Takes a prompt/instruction,
// grounds it in the account's recent communication (from getComms) + Linear
// tickets, and calls Anthropic (same setup as /api/ask). Read-only: it only
// drafts/answers; it never sends or writes anything.

const MODEL = process.env.ANTHROPIC_ASK_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const TIMEOUT_MS = 55_000;
const CTX_MESSAGES = 40; // recent messages included as context
const CTX_BODY_CAP = 1200; // per-message chars in context

export interface AssistResult {
  response: string;
  usedMessages: number;
  usedTickets: number;
  error?: string;
}

export async function runAssist(
  entityId: string,
  opts: { instruction: string; windowDays: number; selectedBody?: string | null }
): Promise<AssistResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { response: "", usedMessages: 0, usedTickets: 0, error: "ANTHROPIC_API_KEY not configured in Vercel." };
  const instruction = (opts.instruction || "").trim();
  if (!instruction) return { response: "", usedMessages: 0, usedTickets: 0, error: "No prompt/instruction provided." };

  const comms = await getComms(entityId, opts.windowDays).catch(() => null);
  const messages = comms?.messages ?? [];
  const tickets = comms?.tickets ?? [];

  const ctxMsgs = messages
    .slice(0, CTX_MESSAGES)
    .map((m) => `[${m.type}${m.sender ? " · " + m.sender : ""}${m.at ? " · " + m.at.slice(0, 16) : ""}]\n${(m.body || "").slice(0, CTX_BODY_CAP)}`)
    .join("\n\n---\n\n");
  const ctxTickets = tickets
    .slice(0, 20)
    .map((t) => `- [${t.state || "?"}] ${t.title || "?"}${t.assignee ? " (" + t.assignee + ")" : ""}${t.description ? ": " + t.description.slice(0, 200) : ""}`)
    .join("\n");

  const system =
    "You are Alfred, a communication assistant for Zoca's customer-success and finance team. " +
    "You are given ONE account's recent communication history (app chat, calls, SMS, email, and meeting transcripts) and its Linear tickets. " +
    "Follow the user's instruction precisely. Ground every statement strictly in the provided context — never invent facts, names, dates, or commitments that aren't present. " +
    "Be concise, specific, and skimmable. If the context lacks what the instruction needs, say so plainly. " +
    "You only draft and analyze — you never send messages or take actions.";

  const userContent =
    `INSTRUCTION:\n${instruction}\n\n` +
    (opts.selectedBody ? `FOCUS MESSAGE (the user selected this):\n${opts.selectedBody.slice(0, 3000)}\n\n` : "") +
    `ACCOUNT COMMUNICATION — last ${comms?.windowDays ?? opts.windowDays}d, ${comms?.total ?? 0} messages total, showing ${Math.min(CTX_MESSAGES, messages.length)} most recent:\n${ctxMsgs || "(no messages in this window)"}\n\n` +
    `LINEAR TICKETS:\n${ctxTickets || "(none)"}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1600, system, messages: [{ role: "user", content: userContent }] }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const t = await r.text();
      return { response: "", usedMessages: messages.length, usedTickets: tickets.length, error: `LLM error ${r.status}: ${t.slice(0, 200)}` };
    }
    const j: any = await r.json();
    const text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    return { response: text || "(the model returned no text)", usedMessages: Math.min(CTX_MESSAGES, messages.length), usedTickets: tickets.length };
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError" ? "The model took too long to respond. Try a shorter window or instruction." : String((e as Error)?.message || e).slice(0, 200);
    return { response: "", usedMessages: messages.length, usedTickets: tickets.length, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
