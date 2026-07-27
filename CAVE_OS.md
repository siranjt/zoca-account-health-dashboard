# CAVE//OS — Zoca Account Health Dashboard

> Complete build documentation. CAVE//OS is an internal, SSO-gated account-health
> platform for Zoca's Customer Success / Finance / CX teams, wrapping the live
> Zoca data warehouse (Aurora via Metabase), Chargebee billing, Linear tickets,
> Google Business Profile, Gmail/CallHippo/Fireflies communications, and an
> Anthropic-powered analyst ("Alfred") behind one dual-persona (Batman / Bruce
> Wayne) interface.

- **Repo:** `github.com/siranjt/zoca-account-health-dashboard`
- **Local:** `~/zoca-account-health-dashboard`
- **Prod:** `https://zoca-account-health-dashboard.vercel.app` (auto-deploys on push to `main`)
- **Framework:** Next.js 14.2 (App Router) · React 18 · TypeScript · Tailwind

---

## 1. What it is

A read-only "single pane of glass" over every Zoca customer account. For each
account it fuses **health scoring, GBP/SEO metrics, leads & reviews funnels,
billing, support tickets, communication history, and change logs** into an
overview table + a per-account "Customer Dashboard" that mirrors the internal
Retool tool the team used before. On top of the data sits **Alfred**, an
LLM analyst that reasons over the live book through a tool-calling loop, can
drive the UI (open/filter), drafts outreach, and remembers past conversations.

Everything is **flag-gated**: when an integration's env var is absent the app
degrades gracefully (falls back to mock data or hides the feature) rather than
breaking.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14.2 App Router (server + client components, server actions, edge middleware) |
| Auth | NextAuth v5 / Auth.js beta — Google SSO, JWT sessions, role on token |
| Data warehouse | Zoca Aurora (Postgres) via **Metabase** `/api/dataset` (database 7) |
| Billing | Chargebee API (`zoca.chargebee.com`) |
| Tickets | Linear (via Metabase, "Beacon" logic) |
| App DB | **Neon** serverless Postgres (`@neondatabase/serverless`) — Alfred memory, activity log, Keeper |
| Charts | Hand-built SVG/Canvas (no chart lib) |
| Timezones | `tz-lookup` (lat/lng → IANA tz) |
| CSV | `papaparse` |
| Hosting | Vercel (Fluid Compute), cron via `vercel.json` |

Dependencies (runtime): `@neondatabase/serverless`, `next`, `next-auth`,
`papaparse`, `react`, `react-dom`, `tz-lookup`.

---

## 3. Architecture & data flow

```
Browser (client components)
   │  fetch /api/*
   ▼
Next.js route handlers / server components ──► src/lib/data.ts  (orchestration + caching)
                                                   │
        ┌──────────────────────────────┬──────────┴───────────┬─────────────────┐
        ▼                              ▼                      ▼                 ▼
   metabase.ts                    chargebee.ts            tickets.ts        neon.ts
 (Aurora via Metabase)          (Chargebee API)        (Linear/Metabase)  (Neon Postgres:
   masterSql + aux                billing detail          ticket counts     memory / activity /
   detail SQLs                                                              keeper facts)
```

### Caching (critical for perf)
- **Book payload** (`getAccountsPayload`) — all accounts + health/metrics, ~6s to
  build. Cached **per window** for **2 min** (`BOOK_TTL_MS`) with in-flight
  coalescing so N concurrent requests trigger one fetch. Only successful
  (non-mock) fetches are cached.
- **Account detail** (`getAccountDetail`) — the per-account time-series bundle.
  Cached **per (id, window)** for **2 min** with coalescing. (Added after a
  teammate reported slow account opens — it was previously the only un-cached
  leg.)
- **Last-touch map** (`getLastTouchMap`) — all-channel last communication per
  account. Current-state (window-independent), so cached on its **own 10-min TTL**
  shared across all windows, instead of re-running its ~6s scan per book fetch.
- **CC daily cohort** — ~5 min cache.

---

## 4. Authentication & access control

- **SSO:** Google via NextAuth v5. Middleware (`src/middleware.ts`, edge) gates the
  whole app: unauthenticated requests → `/signin`. Static assets (anything with a
  file extension), `/api/auth`, `/api/cron`, and `/signin` are exempt.
- **Legacy fallback:** if SSO isn't configured, an optional Basic-auth password
  gate (`DASHBOARD_PASSWORD`) can protect the app so it can ship pre-SSO.
- **Roster** lives entirely in the **`ACCESS_CONTROL`** env var as JSON (never in
  the repo):
  ```json
  {
    "admins":   ["success@zoca.com"],
    "managers": ["deepanwita.n@zoca.com", "akshay.ku@zoca.com"],
    "ams":      { "someone@zoca.com": "AM Display Name" }
  }
  ```
- **Roles:**
  - `admin` — sees everything + admin pages (Activity, Alfred usage).
  - `manager` — sees everything (all books).
  - `am` — **scoped**: only accounts on their own book (`scopeAccounts` filters by
    `accountManager === amName`). Alfred also only reasons over their book.

---

## 5. Dual-persona theme system

Two personas share one app, toggled by the theme switcher; `html.light` = Bruce
Wayne, dark = Batman.

- **Batman (dark):** deep-night palette, cyan accent, **swept-wing bat** emblem
  (`BatShield` / `BAT_PATH` in `WayneMark.tsx`), "CAVE//OS" branding, `GothamRain`
  ambient rain FX.
- **Bruce Wayne (light):** warm ivory + gold, **WAYNE ENTERPRISES W-shield**
  (`WayneShield`), serif type, `WayneShine` "Applied Sciences HUD" ambient FX
  (blueprint grid, node-network, orbit diagrams, rising data glyphs).
- **Alfred** has his own gold crest emblem (`AlfredMark`, transparent-keyed PNG in
  `/public/alfred/`).
- **Ambient FX toggle** (`RainToggle`) unifies 🌧 Rain / ✨ Shine; also
  `CalmToggle` / `DetectiveToggle` / `ThemeToggle` mood controls.
- **WelcomeSplash** — one-time post-sign-in "Welcome, <first name>" splash that
  matches the active persona (gold + W-shield in light, cyan + bat in dark), with
  a decode-in name animation.

---

## 6. Pages / routes

| Route | Purpose |
|---|---|
| `/` | Landing deck (`LandingDeck`) — cinematic dual-persona home + live launchpad |
| `/overview` | Main dashboard — the accounts table/board/map (`AccountsTable`) |
| `/account/[id]` | Per-account "Customer Dashboard" (`AccountDossier`) |
| `/trends` | Book-wide trends explorer (`TrendsExplorer`) |
| `/signin` | Theme-aware sign-in with persona switcher (`SignInCard`) |
| `/admin/activity` | Admin: activity log viewer (`ActivityLogViewer`) |
| `/admin/alfred` | Admin: Alfred usage analytics (`AlfredUsageViewer`) |

Global chrome: `CaveNav` (persona emblem, search ⌘K, mood toggles, `UserMenu`),
`AlfredChat` (docked assistant), `CommandPalette`, `Toaster`, `ActivityTracker`,
`ShortcutsHelp`, `WelcomeSplash`.

---

## 7. Overview dashboard (`AccountsTable`)

The heart of the app. Three view modes: **▤ Table · ▦ Board · 🗺 Map**.

### Window / timeframe selector
- Presets **7d / 30d / 90d / 180d**, a **custom** from/to range, and **Default**
  (all-time, floored at 2020-01-01 to avoid empty pre-launch buckets).
- The window drives all windowed metrics (leads, reviews, clicks, deltas) and the
  header tiles; snapshot data (rankings, current payment state, health) reflects
  current state.

### Header tiles & health summary
React to filters: total accounts, healthy/monitor/at-risk counts (clickable to
filter), leads-declining, MRR, etc.

### Filters & presets
Color (🟢🟡🔴), account-manager, search, and preset chips: **At-risk, Declining,
Overdue, Has tickets, Web app, Unverified GBP, No site, Multi-product, Pinned**.
"Clear filters" resets all.

### Columns (toggleable via ⚙ Columns)
Business (name + Discovery-Web badge), City/State, AM, **GBP Verified**
(Verified/Unverified badge), **Website Live**, **Timezone + local time**,
**Last touch** (see §12), Health dot, Composite, Leads, Reviews, Photos, Profile
clicks, Website clicks, Book-online, KW tracked, Top-3 %, Avg rank, Impressions,
Days-to-invoice, Days-overdue, Missed payments, Tenure, CC (web-app) L28 metrics,
Products. Numeric headers show distribution pop-overs; expandable rows reveal
metric detail cards with "Open detailed page →" and "Ask Alfred" actions.

### Board view
Kanban by health tier (At risk / Monitor / Healthy). **Entire card is clickable**
(navigates to the dossier with prefetch); ★ pins without navigating.

### Map view
`MapView` — geographic plot of accounts by lat/lng.

### Other
Pin-to-top, dense mode, **Save view**, **Leaderboards**, **Alerts**, **Activity**,
**Compare**, and **Export CSV** (respects the active window & filters). Row & board
navigation is client-side (`next/link`) with automatic prefetch.

---

## 8. Account detail (`AccountDossier`)

Mirrors the Retool "Customer Dashboard" order/vocabulary.

### Header
- **Type-to-search account switcher** (combobox) — filter the 800+ book by name or
  manager; ↓/↑/Enter/Esc, click-out; ‹ › prev/next arrows cycle the list.
- Identity block (name, Discovery-Web badge, city/state, AM, tenure, products),
  health tier badge, **✨ Ask Alfred** (prefills a full-briefing prompt).
- **Window selector**: 7d / 30d / 90d / 180d / **Default** (all-time). Labels and
  chart subtitles read "all-time" in Default mode.
- **KPI tiles**: Composite, MRR, Leads·<win>, Reviews·<win>, Open tickets, Due amount.

### Tabs
| Tab | Contents |
|---|---|
| **Profile & GBP** | Health breakdown, Profile clicks, Profile metrics (weekly), Search impressions, GBP photos (weekly change + total), GBP posts (cumulative + recent posts table) |
| **Funnel & Leads** | Complete funnel, Lead prediction/forecast, Lead response time, Leads vs Bookings, **Lead table** with per-column facet filters (Source / Status / UTM) + free-text search + CSV |
| **Communication** | Omni-channel Message History + **AI Assist** (see §9/§10) |
| **Changes Log** | Grouped change tables from `*_logs` tables (see §11) |
| **Rankings** | Keyword rankings table (60 tracked kw), rank trend |
| **Reviews** | Review count, avg rating, distribution, velocity, recent reviews |
| **Payments** | Chargebee billing detail — MRR, status, renewal, invoices, failed txns |
| **Scheduling & Support** | Onboarding milestones, support requests, app/scheduling metrics |
| **All Data (76)** | Runs every one of the 76 Retool queries live, with viewable SQL (`RetoolAllData`) |

All windowed charts honor the window with **auto-granularity** (day ≤31d, week
≤180d, month beyond) and gap-filled series. Snapshots stay current-state.

Windowed metrics re-fetch via `/api/account/[id]?window=<n>`; the detail bundle is
cached server-side per (id, window).

---

## 9. Alfred — the AI analyst (`/api/ask`, `AlfredChat`)

An Anthropic tool-calling loop (`ANTHROPIC_ASK_MODEL`, default `claude-sonnet-4-6`)
that reasons over the **live book snapshot** (fetched once per request, scoped to
the viewer's role).

### Behaviour
- **Reasoning:** plan → call tools → self-correct; grounds every figure strictly in
  tool results (never invents numbers/names/history); cites recency "as of DD/MM/YY".
- **Drive-the-UI:** may append `ACTION: {json}` to open an account or filter the
  overview; the client (`runAction`) executes it. Server resolves the account name
  → entityId against the full book.
- **Drafts, never sends:** can draft AM outreach, QBRs, churn-save plays, escalation
  notes — always labelled as a draft.
- **Guardrails:** time budget (~40s) forces a final synthesized answer; per-turn
  tool cap prevents "call X for all 831 accounts" explosions; model/tool timeouts;
  graceful recovery pass on model error.

### Tools
`book_summary`, `at_risk_accounts`, `account_health`, `account_detail`,
`accounts_by_manager`, `book_aggregate`, `explain_health`, `billing` (live
Chargebee), `customer_facts` (Keeper), `support_tickets`, `manager_tickets`,
`reviews_detail`, **`message_history`** (omni-channel comms — App Chat / Calls /
SMS / Email / Meetings, per-channel counts + recent snippets), `cohort_benchmark`,
`segment_analysis`, `movers`, `expansion_radar`, `revenue_at_risk`, `gather_360`
(one-shot dossier), `recall`, `remember`, `usage_stats`, `pin_focus`.

### Memory (Neon, `alfred.messages`)
Every conversation is logged to Neon (never to Slack) with the asker's identity,
tools used, tokens, latency — powering `recall`/`usage_stats` and the admin Alfred
page. Explicit "remember this" facts are saved and resurface in `customer_facts` /
`gather_360`.

---

## 10. Communication section & AI Assist

- **Message History** (`CommunicationTab` → `getComms`): omni-channel feed for one
  account — App Chat (`chat.messages`), CallHippo Calls (+ transcript) & SMS, Gmail
  email, Fireflies/demo/customer meetings — merged newest-first, windowed & capped.
  Each channel is a separate entity-scoped query run in parallel (the original
  monolithic Retool query seq-scanned 691K/821K/223K rows and timed out).
- **AI Assist** (`AiAssist`): pick a curated prompt (function → type → use-case from
  `/api/prompts`) or write your own instruction; runs over the account's comms via
  `/api/account/[id]/assist`. **Drafts only, never sends.**
- **Persistence:** the prompt + generated response are saved per account in
  `sessionStorage`, so switching tabs and returning no longer wipes the answer.

---

## 11. Changes Log (`ChangesTab`, `changes.ts`)

Grouped tables of recent changes across 6 `*_logs` sources (profile, sections,
website, etc.), with `updates_json` decoded to field / old → new. Windowed, capped
at the most-recent 800, "all-time" when the window is Default.

---

## 12. Last-touch computation (all-channel)

"Last touch" = the **maximum across every communication channel**, not just
HubSpot:

| Channel | Source |
|---|---|
| RM / App chat | Aurora `chat.messages` |
| Phone calls | CallHippo `calls` |
| SMS | CallHippo `messages` |
| Email (in + out) | Gmail `emails` |
| Meetings | Fireflies |
| Logged calls/emails | HubSpot `property_last_connected_date` |

- `lastTouchSql()` computes the per-entity MAX across chat/call/SMS/email/meeting
  book-wide; `newerTouch()` in `metabase.ts` then takes `MAX(that, HubSpot)`,
  normalised to `YYYY-MM-DD`.
- **Performance:** the naive OR-join over CallHippo/Gmail times out (>60s). This is
  ~6s book-wide via (1) **split hash equijoins** for the from/to phone match instead
  of an un-indexable `OR`, and (2) a **400-day cap** on each big-table scan (older
  touches can't be the newest; HubSpot still covers older contact).
- Cached on its own 10-min TTL (current-state, shared across windows); degrades to
  HubSpot-only on failure.

Entity mapping mirrors the Message-History card:
`entity_relationships → conversation_members / entities.phones / entities.emails →
source tables`.

---

## 13. Activity logging & Slack (`activity.ts`, `track.ts`)

- Every meaningful action (window changed, account opened, CSV exported, tab
  viewed, sign-in, Alfred asked, …) is tracked client-side (`track()` →
  `sendBeacon /api/track`) and written to Neon (`cave_activity_log`).
- Selected events also post to a Slack channel via `ACTIVITY_SLACK_WEBHOOK_URL`
  (fire-and-forget). **Alfred conversations post only** "X spoke to Alfred about
  *Account*" — **never the content** (content lives in Neon only). The account is
  taken from entities explicitly named in the question, not the pinned focus.
- Hourly digest cron: `/api/cron/activity-digest` (gated by `CRON_SECRET`, scheduled
  in `vercel.json`).

---

## 14. Admin pages

- **`/admin/activity`** — full activity log viewer (who did what, when), filterable.
- **`/admin/alfred`** — Alfred usage: summary cards, leaderboards (most-asked
  accounts/tools/people), conversation log, **CSV export**, **token→$ cost
  estimates** per person/day (PRICE map for opus/sonnet/haiku/fable), and a daily
  cost trend.

---

## 15. Health model (`health.ts`)

- The app uses Aurora's **`cx.health_score`** directly — no reverse-engineering:
  `composite_health_score` + `health_tier` come from the warehouse.
- `mapTier()` maps the tier label → tier + color:
  - `HEALTHY`/`THRIVING` → green
  - `MONITOR` → yellow
  - `CRITICAL` → red (critical)
  - AT-RISK / anything else → red (at_risk)
- For **mock** data only, `composite()` reproduces the pre-live formula:
  `0.4·engagement + 0.4·value + 0.2·product`, cutoffs healthy ≥80 / monitor ≥60.
- `primaryDriver()` (in the Alfred route) derives the root-cause driver from real
  fields (failed payments, GBP not surfacing, no reviews, weak search, low leads).

---

## 16. Key data definitions & gotchas

- **Entity id** is the join key everywhere; Chargebee ↔ entity via subscription
  custom field `cf_entity_id` (not just the Metabase CSV).
- **MRR:** `subscriptions.mrr` is Chargebee's normalized monthly value; per-product
  MRR is allocated by item share (`subscription_items.amount` is per-billing-period,
  NOT monthly). WIN, FrontDesk, and Lead-to-Booking are distinct products.
- **GBP Verified** = has Voice of Merchant. Google only sets the key to `'true'`
  when verified; unverified profiles omit it — so it's `COALESCE(..., false)` →
  "Unverified", never blank. Only entities with no GBP row stay unknown.
- **Website live** = GBP lists a website URL (Google's own data), plus an on-demand
  liveness check (`/api/website-check`). HubSpot's `is_website_live_on_gbp` was
  stale and is not trusted.
- **Book** is built from `cx.health_score` and **excludes churned accounts** — a
  cancelled-subscription account (e.g. all subs `cancelled`) has no health_score
  row and therefore does not appear.
- **Dates:** displayed dd/mm/yy; invoices/messages newest-first.

---

## 17. API routes

| Route | Purpose |
|---|---|
| `GET /api/accounts` | Book payload for a window (client index/linkify) |
| `GET /api/account/[id]` | Per-account detail bundle for a window |
| `GET /api/account/[id]/comms` | Omni-channel Message History |
| `GET /api/account/[id]/changes` | Changes Log |
| `POST /api/account/[id]/assist` | Run an AI Assist prompt over comms |
| `GET /api/account/[id]/queries` | All-Data (76 Retool queries) runner |
| `POST /api/ask` | Alfred reasoning loop |
| `GET /api/prompts` | AI Assist prompt catalog / prompt body |
| `GET /api/trends` | Book-wide trend series |
| `GET /api/website-check` | On-demand website liveness |
| `POST /api/track` | Activity ingestion (session-authenticated) |
| `GET /api/activity` · `/api/admin/activity` | Activity feeds |
| `GET /api/admin/alfred` | Alfred usage analytics (+ `?format=csv`) |
| `GET /api/snapshot` | Book snapshot |
| `/api/cron/activity-digest` | Hourly Slack digest (CRON_SECRET) |
| `/api/auth/[...nextauth]` | NextAuth handlers |

---

## 18. `src/lib` modules

| Module | Responsibility |
|---|---|
| `data.ts` | Orchestration + caching (book, detail, cc-daily); range resolution; mock fallback |
| `metabase.ts` | Aurora via Metabase `/api/dataset`; row mapping; `getLastTouchMap` cache |
| `queries.ts` | **Master file** — `masterSql`, `timingSql`, `trendsSql`, `lastTouchSql`, all detail SQLs, granularity helpers |
| `chargebee.ts` | Live billing detail per entity |
| `tickets.ts` | Linear ticket counts (account + manager), "Beacon" logic |
| `comms.ts` | Omni-channel comms feed + weekly comms activity |
| `changes.ts` | Change-log aggregation from `*_logs` |
| `insights.ts` | Reviews detail |
| `keeper.ts` | Bat Cave Memory ("Keeper") facts per entity |
| `memory.ts` | Alfred durable memory (Neon `alfred.messages`), recall, usage stats, focus |
| `activity.ts` | Activity log (Neon + Slack) |
| `neon.ts` | Neon Postgres client (`getSql`) |
| `access.ts` | ACCESS_CONTROL roster parsing, role resolution |
| `scope.ts` | Per-viewer account scoping |
| `health.ts` | Tier mapping + mock composite |
| `prompts.ts` / `aiassist.ts` | AI Assist prompt catalog & runner |
| `retool.ts` / `retoolQueries.ts` | The 76 Retool "All Data" queries |
| `snapshots.ts` | Book snapshots |
| `theme.ts` | Viz palette + theme tokens |
| `format.ts` | Number/date/duration/tenure formatters |
| `track.ts` | Client activity beacon |
| `mock.ts` | Mock accounts/detail for off-Metabase dev |
| `types.ts` | Shared types (`AccountRow`, `AccountDetail`, …) |

---

## 19. Environment variables

| Var | Purpose |
|---|---|
| `ACCESS_CONTROL` | JSON roster (admins/managers/ams) — **required for SSO** |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` (`NEXTAUTH_SECRET`) | Google SSO |
| `METABASE_BASE_URL` (`METABASE_URL`) / `METABASE_API_KEY` / `METABASE_DATABASE_ID` | Aurora access (db 7) |
| `METABASE_TICKETS_URL` / `METABASE_TICKETS_TIMEOUT_MS` | Linear tickets query |
| `CHARGEBEE_SITE` / `CHARGEBEE_API_KEY` | Live billing |
| `DATABASE_URL` (`POSTGRES_URL`) | Neon — memory / activity / keeper |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_ASK_MODEL` (`ANTHROPIC_MODEL`) | Alfred |
| `ACTIVITY_SLACK_WEBHOOK_URL` | Activity → Slack |
| `CRON_SECRET` | Guards the activity-digest cron |
| `DATA_SOURCE` / `METRICS_WINDOW_DAYS` | Data source toggle + default window |
| `DASHBOARD_PASSWORD` | Legacy Basic-auth gate (pre-SSO fallback) |

Absent integration vars → graceful degradation (mock data / hidden feature), never
a crash.

---

## 20. Deployment

- Push to `main` → Vercel auto-deploys production.
- `vercel.json` defines the activity-digest cron.
- Verify: build (`npm run build`) + `npx tsc --noEmit` are the pre-push gates;
  runtime health via Vercel runtime logs/errors.

---

## 21. Notable engineering decisions

- **No reverse-engineered health** — the warehouse owns the score.
- **Every windowed metric honors the filter**; snapshots stay current-state.
- **Caching everywhere** an expensive fetch would otherwise repeat (book, detail,
  last-touch) with in-flight coalescing.
- **Big-table queries are always entity-scoped + windowed + split into equijoins**
  to stay under Metabase's 60s statement timeout.
- **Graceful degradation** is a first principle — flags gate every integration.
- **Alfred is grounded** (tools only), **drafts-only**, and **content-private**
  (Slack shows who/what account, never the conversation).
