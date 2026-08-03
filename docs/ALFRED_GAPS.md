# Alfred — capability gap analysis & fix log

*Source: `alfred-conversations-30d.csv` — 165 conversations, 13 users, 30 days
(to 03/08/26). This doc is the running record; add a dated row to the log at the
bottom each time Alfred's abilities are revised.*

## Method

Alfred logs every turn with the question, reply, tools used, latency, tokens and
status. **Status was `ok` for 100% of turns** — so Alfred rarely *errors*; where
he slacks is **answer quality**: weak replies, false "I can't", and expensive
tool loops that force the user to re-ask. Signals mined: replies matching a
capability-gap phrase ("I don't have…", "unable to…"), same-tool loops (≥4 calls
in one turn), and back-to-back re-asks by the same user.

## Findings (ranked by measured pain)

### 1. Tickets are 28% of all questions — and the biggest source of pain
- **47 of 165 questions (28%) are about tickets; 46 of those slice by
  type/status** ("how many finance / website / retention / active / closed
  tickets").
- **Root cause A — vocabulary mismatch.** The Linear ticket data only has
  `ticket_classification` ∈ {Churn Ticket, Retention Risk Alert, Subscription
  Support Ticket, paid_user_offboarding, Subscription_Cancellation}. There is
  **no "finance" or "website" ticket type.** Users asked for those; Alfred
  flailed instead of saying "we don't classify tickets that way — here are the
  types we do have." One reply literally said *"I don't have a tool that
  categorises or filters support tickets by type"* — **false**: `support_tickets`
  returns every classification in one call.
- **Root cause B — missing book-wide aggregate.** The worst tool-thrashing
  (`manager_tickets` called **10–11× in one turn**, ~30–33s latency) was all
  *"across the whole book, which AM has the most tickets"* — Alfred correctly
  looping once per manager because **no single tool rolls ticket load up across
  the whole book by manager.**

### 2. False "I can't" on abilities Alfred actually has
- *"I don't have a built-in write-to-memory tool"* — **false**, the `remember`
  tool exists. Prompt-confidence gap.
- The ticket-categorisation refusal above (support_tickets does it).

### 3. Working as designed (NOT bugs — leave alone)
- *"Send an email to the owner… right now"* → Alfred refuses, drafts only. This
  is the hard rule (Alfred drafts, never sends). Correct.

### 4. Re-ask storm (37 back-to-back re-asks)
- Largely a symptom of #1 — users re-phrasing ticket questions 5–8× trying to
  get the slice they want. Fixing #1 should collapse most of these.

## Fixes applied

- **F1 (prompt):** Teach Alfred the exact ticket taxonomy that exists; instruct
  him to answer "finance/website" ticket asks by naming the real classifications
  rather than looping or refusing; reaffirm that `support_tickets`/`manager_tickets`
  return ALL classifications in ONE call; reaffirm he has `remember`.
- **F2 (new tool `book_tickets_by_manager`):** one call → per-AM active/closed
  ticket counts by classification across the whole book. Kills the 10–11× loop.

- **F3 (prompt):** hard rule against the intermittent memory refusal. The SAME
  "remember that…" question was asked twice — once Alfred used `remember` and
  saved correctly, once he claimed *"I don't have a built-in write-to-memory
  tool"* and told the user to log it in Keeper/HubSpot instead. Inconsistency,
  not a missing tool. Prompt now: MUST call `remember` on explicit save
  requests; NEVER claim the capability doesn't exist; if a save fails, say the
  save failed (not that the tool is absent).

## Not done (candidates for next iteration — needs a decision)
- **"Website tickets" as a real category** — would need a product/technical
  Linear team synced with a topic field. Today that taxonomy doesn't exist in
  the data; Alfred should say so (F1), not fabricate.
- **Meeting-link tool** — only 1 question in 30d; low priority. The data now
  exists (HubSpot check-in URL) but Alfred has no tool for it.

## Update log
| Date | Change | Why |
|---|---|---|
| 03/08/26 | Initial analysis; F1 + F2 applied | 28% ticket questions, worst thrashing + false "I can't" |
| 03/08/26 | F3 applied | Intermittent false "no memory tool" refusal (same Q answered both ways) |
