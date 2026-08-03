import "server-only";
import { getComms } from "@/lib/comms";

// AI Assist — the Retool "LLM Response" widget. Takes a prompt/instruction,
// grounds it in the account's recent communication (from getComms) + Linear
// tickets, and calls Anthropic (same setup as /api/ask). Read-only: it only
// drafts/answers; it never sends or writes anything.

const MODEL = process.env.ANTHROPIC_ASK_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const TIMEOUT_MS = 290_000; // room for a full-length analysis (within the 300s route budget)
const CTX_MESSAGES = 120; // messages included as context (getComms caps at 600)
const CTX_BODY_CAP = 2000; // per-message chars in context

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

  // Analysis reads the account's FULL history, not just the page's window — a
  // handover or health read needs everything. getComms caps at 600 messages.
  const w = Math.min(3650, Math.max(opts.windowDays || 0, 365));
  const comms = await getComms(entityId, w).catch(() => null);
  const messages = comms?.messages ?? [];
  const tickets = comms?.tickets ?? [];

  const ctxMsgs = messages
    .slice(0, CTX_MESSAGES)
    .map((m) => `[${m.type}${m.sender ? " · " + m.sender : ""}${m.at ? " · " + m.at.slice(0, 16) : ""}]\n${(m.body || "").slice(0, CTX_BODY_CAP)}`)
    .join("\n\n---\n\n");
  const ctxTickets = tickets
    .slice(0, 80)
    .map((t) => `- [${t.state || "?"}] ${t.title || "?"}${t.assignee ? " (" + t.assignee + ")" : ""}${t.createdAt ? " · " + t.createdAt.slice(0, 10) : ""}${t.description ? "\n  " + t.description.slice(0, 700).replace(/\s+/g, " ") : ""}`)
    .join("\n");

  const system =
    "You are Alfred, a senior customer-success analyst for Zoca. You are given ONE account's communication history (app chat, calls, SMS, email, meeting transcripts) and its Linear tickets, plus an instruction. Produce work at the standard of a rigorous account handover: thorough, precise, and decision-ready.\n\n" +
    "Discipline (non-negotiable):\n" +
    "- Ground every statement strictly in the provided communication and tickets. Never invent a name, date, price, product, or commitment that is not present.\n" +
    "- Distinguish clearly between what was CLAIMED or promised and what is CONFIRMED. Call out promises, ambiguities, and contradictions explicitly (e.g. a capability described in an email that the tickets don't support; a name/spelling mismatch; a 'Done' ticket with blank required fields).\n" +
    "- When something the instruction needs is NOT in the context (billing, payment status, renewal dates, etc.), say so plainly and list it under 'requires verification' — never guess or fill the gap.\n" +
    "- Separate visibility, leads, and bookings. Never treat rankings as bookings, or a promise as a delivered fact.\n" +
    "- Extract the customer's own stated requests and expectations faithfully, preserving their priorities and wording where it matters.\n" +
    "- Surface risks to trust: off-brand execution, unapproved actions, inconsistent answers, overstated capabilities.\n\n" +
    "Format: clear section headers with COMPACT TABLES and terse bullet points as the default; use prose only where it genuinely adds meaning, and keep it tight.\n" +
    "Length discipline: a full analysis must be comprehensive in COVERAGE but economical in WORDS — the entire piece has to fit in a single response. Cut filler, hedging, and repetition; state each fact and flag once, densely. When the history is large, compress the wording — never drop a section or a material finding to save space. A quick question stays brief.\n" +
    "You only analyze and draft — you never send messages or take actions.";

  const userContent =
    `INSTRUCTION:\n${instruction}\n\n` +
    (opts.selectedBody ? `FOCUS MESSAGE (the user selected this):\n${opts.selectedBody.slice(0, 3000)}\n\n` : "") +
    `ACCOUNT COMMUNICATION — full history, ${comms?.total ?? 0} messages total, showing the ${Math.min(CTX_MESSAGES, messages.length)} most recent:\n${ctxMsgs || "(no messages found)"}\n\n` +
    `LINEAR TICKETS:\n${ctxTickets || "(none)"}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: "user", content: userContent }] }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const t = await r.text();
      return { response: "", usedMessages: messages.length, usedTickets: tickets.length, error: `LLM error ${r.status}: ${t.slice(0, 200)}` };
    }
    const j: any = await r.json();
    let text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    // Never cut silently: if the model hit the length limit, say so.
    if (j.stop_reason === "max_tokens") text += "\n\n---\n_⚠️ This analysis reached the length limit and was cut off. Re-run it, or ask for a specific remaining section (e.g. \"just the first-call agenda and final assessment\")._";
    return { response: text || "(the model returned no text)", usedMessages: Math.min(CTX_MESSAGES, messages.length), usedTickets: tickets.length };
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError" ? "The model took too long to respond. Try a shorter window or instruction." : String((e as Error)?.message || e).slice(0, 200);
    return { response: "", usedMessages: messages.length, usedTickets: tickets.length, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
