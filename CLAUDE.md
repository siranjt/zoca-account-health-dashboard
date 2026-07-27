# CAVE//OS — Account Health Platform

Internal, SSO-gated account-health platform for Customer Success / Finance / CX.
Read-only single pane of glass over ~831 accounts, replacing the team's previous
Retool dashboard.

**Full architecture: [`docs/CAVE_OS.md`](docs/CAVE_OS.md) — read it before any
non-trivial change.** This file is the operating brief; that file is the map.

## Stack

Next.js 14.2 App Router · React 18 · TypeScript · Tailwind · NextAuth v5 (Google SSO)
· Aurora via Metabase · Chargebee · Linear · Neon (app DB) · Vercel.

Data flow: route handlers → `src/lib/data.ts` (orchestration + caching) →
`metabase.ts` / `chargebee.ts` / `tickets.ts` / `neon.ts`.

## Hard rules

Violating any of these breaks production or breaks trust. No exceptions without
an explicit decision recorded in `docs/`.

1. **Alfred drafts, never sends.** Outreach, QBRs, escalation notes — all labelled
   drafts. No send path is to be added.
2. **Alfred is grounded.** Every figure comes from a tool result. Never infer,
   never fill a gap with a plausible number, never invent an account name or a date.
3. **Conversation content never leaves Neon.** Slack gets "X spoke to Alfred about
   *Account*" and nothing more. No message bodies, no customer PII, in any webhook,
   log line, or error report.
4. **Health is not computed here.** `cx.health_score` from the warehouse is the
   source of truth. `composite()` exists for mock data only. Do not reverse-engineer
   a score.
5. **Big-table queries must be entity-scoped, windowed, and split into equijoins.**
   Metabase has a 60s statement timeout and the comms tables are 200K–800K rows.
   An `OR` join across CallHippo/Gmail will time out. See §12 of `CAVE_OS.md`.
6. **Graceful degradation is a first principle.** A missing integration env var
   hides the feature or falls back to mock — it never crashes the app.
   *Exception: auth. Never degrade an auth path silently.*
7. **Entity id is the join key everywhere.** Chargebee joins via the subscription
   custom field `cf_entity_id`.
8. **Windowed metrics honor the window; snapshots stay current-state.** Do not mix.

## Before pushing

```bash
npm run build
npx tsc --noEmit
```

Both must pass. Push to `main` auto-deploys production on Vercel — there is no
staging gate. Treat every push as a production release.

## Data definitions that have bitten us

- **MRR** — `subscriptions.mrr` is Chargebee's normalized monthly value.
  `subscription_items.amount` is per-billing-period, **not** monthly.
- **GBP Verified** — Google only sets the key when verified; unverified profiles
  omit it. Always `COALESCE(..., false)`.
- **Website live** — from GBP's own data. HubSpot's `is_website_live_on_gbp` is
  stale and is not trusted.
- **The book excludes churned accounts** — no `cx.health_score` row, no appearance.
- **Last touch** is the max across *all* channels (chat, calls, SMS, email,
  meetings, HubSpot), not HubSpot alone.

## Current objective

**Not features. Evidence.** The platform is built; what it lacks is a record of
what it changed. Work in this order:

1. **Impact readout over `cave_activity_log`** — the Neon activity table already
   holds every account opened, window changed, export, and sign-in, by user, with
   timestamps. Surface: distinct monthly users, accounts reviewed, adoption by AM,
   Alfred usage. No new instrumentation needed; the data is already being written.
2. **Cost-to-serve** — the revenue side is wired (MRR, overdue, missed payments);
   there is no cost side, so the platform can show an account is unhealthy but not
   that it is unprofitable. *Blocked on whether delivery time/cost per client is
   tracked upstream.*
3. **Ownership and handover** — repo under the company org, runbook written,
   a second person able to deploy.

Specs for individual pieces of work live in `docs/tasks/`.

## Conventions

- Dates display `dd/mm/yy`. Invoices and messages newest-first.
- Charts are hand-built SVG/Canvas. Do not add a chart library.
- Every expensive fetch is cached with in-flight coalescing (book 2min,
  detail 2min, last-touch 10min, CC daily 5min). Preserve this when refactoring.
