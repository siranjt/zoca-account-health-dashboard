# Account Health Platform — Operations Runbook

Operational reference for running, deploying, and handing off this service. Kept
short and current. If you change how the app is deployed or configured, update
this file in the same PR.

---

## 1. What this service is

An internal, SSO-gated web app that gives Zoca's CS/Finance/CX teams a single
view of every active customer account — health scoring, GBP/SEO metrics, leads &
reviews, billing, support tickets, communication history — plus an AI analyst
("Alfred") that answers questions over the live data and drafts outreach.

It is **read-only** over source systems (it never writes to Aurora, Chargebee,
Linear, or GBP). It holds and displays **customer PII** (call transcripts,
emails, billing). Treat it as a production system with PII.

---

## 2. Ownership & continuity

> **Action item (governance):** this repo currently lives under a personal
> GitHub namespace. It should be transferred to the **company org**, with at
> least **two people** able to deploy and manage secrets. Until then it is a
> single point of failure.

**Bus-factor checklist:**
- [ ] Transfer the GitHub repo to the company org (Settings → Transfer ownership).
- [ ] Transfer / share the Vercel project with a company team (not a personal account).
- [ ] Ensure ≥2 people have: GitHub admin, Vercel project access, and the ability to read/rotate env vars.
- [ ] Store the secret **values** in the company password manager (not only in Vercel).
- [ ] Name a primary and backup owner at the top of this file.

**Owners:** _primary: TBD · backup: TBD_ (fill in on transfer.)

---

## 3. Environments

| Env | Where | Auth behavior |
|---|---|---|
| **production** | Vercel prod (deploys on push to `main`) | SSO required; **fails closed** if SSO env is missing/invalid |
| **preview** | Vercel preview (per-PR) | Same fail-closed behavior as production |
| **local** | `npm run dev` | If SSO env absent and no `DASHBOARD_PASSWORD`, allowed through (dev only) |

---

## 4. Deploy

- **Deploy:** push/merge to `main` → Vercel auto-builds and promotes to production.
- **Pre-push gates (run locally):**
  ```bash
  npx tsc --noEmit      # types must pass
  npm run build         # production build must pass
  ```
- **Preview:** open a PR → Vercel posts a preview URL. Verify there before merge.

### Rollback
1. Vercel dashboard → the project → **Deployments**.
2. Find the last-known-good deployment → **⋯ → Promote to Production** (instant revert).
3. If the cause is code, also revert the commit on `main` so the next deploy is clean.

---

## 5. Environment variables

Secrets are **only** in Vercel env (and the company password manager) — never in
the repo. Absent *integration* vars degrade gracefully (mock data / hidden
feature). Absent *auth* vars **fail closed** (see §7).

| Var | Required? | Purpose |
|---|---|---|
| `ACCESS_CONTROL` | **Yes (auth)** | JSON roster: `{admins:[], managers:[], ams:{email:"Name"}}` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | **Yes (auth)** | Google SSO OAuth client |
| `AUTH_SECRET` (`NEXTAUTH_SECRET`) | **Yes (auth)** | NextAuth session signing |
| `METABASE_BASE_URL` (`METABASE_URL`) | Yes (data) | Metabase base for Aurora `/api/dataset` |
| `METABASE_API_KEY` | Yes (data) | Metabase API key (server-only) |
| `METABASE_DATABASE_ID` | Yes (data) | Aurora database id (7) |
| `METABASE_TICKETS_URL` / `METABASE_TICKETS_TIMEOUT_MS` | Optional | Linear ticket source + timeout |
| `CHARGEBEE_SITE` / `CHARGEBEE_API_KEY` | Optional | Live billing tab |
| `DATABASE_URL` (`POSTGRES_URL`) | Optional | Neon — Alfred memory, activity log, Keeper, impact readout |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_ASK_MODEL` | Optional | Alfred analyst |
| `ACTIVITY_SLACK_WEBHOOK_URL` | Optional | Activity → Slack |
| `CRON_SECRET` | Optional | Guards `/api/cron/activity-digest` |
| `DASHBOARD_PASSWORD` | Optional | Legacy Basic-auth gate (only used when SSO is off) |
| `RESEND_API_KEY` / `DIGEST_FROM` | Optional | AM digest **email** (Resend). `DIGEST_FROM` must be a Resend-verified sender, e.g. `Account Health <alerts@yourdomain>` |
| `SLACK_BOT_TOKEN` | Optional | AM digest **Slack** (DM per AM). Bot scopes: `chat:write`, `users:read.email`, `im:write`. Resolves email→id automatically |
| `DIGEST_SLACK_CHANNEL` | Optional | Channel id for the manager roll-up post (bot must be invited). Requires `SLACK_BOT_TOKEN` |
| `DIGEST_TOP_N` | Optional | Accounts per AM digest (default 10). Tune against click-through; fewer usually converts better |
| `APP_BASE_URL` | Optional | Absolute base for digest links (defaults to the prod URL) |
| `DIGEST_SECRET` | Optional | HMAC key for digest click links (falls back to `AUTH_SECRET`) |
| `DATA_SOURCE` / `METRICS_WINDOW_DAYS` | Optional | Data-source toggle + default window |

**Rotating a secret:** update it in Vercel (all envs) and in the password
manager, then redeploy (Vercel → Redeploy, or push an empty commit).

---

## 6. Access control (add / remove users)

The roster is the `ACCESS_CONTROL` env var (JSON). Roles:
- `admins` — full access + admin pages (Impact / Activity / Alfred usage).
- `managers` — full access to all books.
- `ams` — scoped to their own book only (`email → "Account Manager Name"`; the
  name must match `accountManager` in the data exactly).

```json
{
  "admins":   ["success@zoca.com"],
  "managers": ["deepanwita.n@zoca.com", "akshay.ku@zoca.com"],
  "ams":      { "someone@zoca.com": "Some One" }
}
```

> ⚠️ **Paste carefully.** `ACCESS_CONTROL` must be valid JSON. If it fails to
> parse, `ssoConfigured()` flips to false and the app **fails closed** (503 in
> prod) — nobody gets in until it's fixed. Common breakers: smart quotes,
> trailing characters, a stray comma. Validate the JSON before saving, then
> redeploy.

---

## 7. Security notes

- **Fail-closed auth.** When SSO isn't fully configured (any of Google creds /
  `AUTH_SECRET` / a valid `ACCESS_CONTROL`), the app does **not** silently open.
  On production/preview it hard-blocks (503) unless an explicit
  `DASHBOARD_PASSWORD` gate is set. `src/middleware.ts`.
- **No secrets in the repo.** All keys are `process.env`; the Metabase API key is
  server-only and never reaches the browser.
- **PII.** The app displays customer call transcripts, emails, and billing. Access
  is role-scoped; AMs see only their own book. Don't add features that export or
  forward PII without review.
- **Alfred privacy.** Alfred conversations are stored in Neon only; Slack shows
  "X spoke to Alfred about <account>" — never the content.

---

## 8. Monitoring & incident response

- **Logs / errors:** Vercel dashboard → project → **Logs** (runtime) and the
  runtime-errors view. Alfred traces are greppable by `[alfred:trace]`.
- **Symptom → first check:**
  | Symptom | Likely cause | First check |
  |---|---|---|
  | Everyone gets 503 | `ACCESS_CONTROL` invalid or SSO env missing | Validate `ACCESS_CONTROL` JSON; confirm auth vars set |
  | "No data" everywhere | Metabase down / key expired | Metabase reachable? key valid? (app falls back to mock) |
  | Billing tab empty | Chargebee key/site | `CHARGEBEE_*` set & valid |
  | Alfred "Comms failed" | Anthropic key / timeout | `ANTHROPIC_API_KEY`; Vercel logs for `/api/ask` |
  | Impact/Activity empty | `DATABASE_URL` missing | Neon connection string set |
- **Data staleness:** the book is cached ~2 min per window; account detail ~2 min;
  last-touch ~10 min. A change in source data appears after the relevant cache TTL.

---

## 9. Known cleanup items (de-personalization)

Low priority, but for a company-owned tool:
- Personal greeting overrides for `siranjith.t@*` in `WelcomeSplash.tsx` and
  `UserMenu.tsx` — generalize or remove.
- Hardcoded public Metabase CSV URL in `src/lib/tickets.ts` — move to an env var.
- Internal theming (Batman/Bruce Wayne personas) is fine in-product; keep it out
  of any external/committee write-up (see the "Account Health Platform" overview).

---

## 10. Quick reference

```bash
# local dev
npm install
npm run dev

# pre-push gates
npx tsc --noEmit && npm run build

# deploy: push to main (Vercel auto-deploys)
git push origin main
```
