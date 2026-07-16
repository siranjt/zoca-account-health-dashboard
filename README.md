# Zoca — Account Health Dashboard

A list view of **all active (non-churned) Zoca accounts**, one row each, with a
🟢🟡🔴 health marker and the metrics AMs care about — leads, reviews, photos, GBP
clicks, "Book Online" clicks, keyword rankings & impressions, lead-response
times, and which **other Zoca products** are active on the account.

It's the inverse of the Retool *Customer Dashboard*: instead of one account
across many tabs, it's every account as a row, with one number pulled from each
tab into a column.

Built with **Next.js (App Router)** and deployed on **Vercel**. Data comes from
**Metabase** at request time via a server-side API key (never exposed to the
browser). Ships with realistic **sample data** so it runs and deploys before
Metabase is wired.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # optional; defaults to sample data
npm run dev                  # http://localhost:3000
```

With no env vars it serves sample data (one row uses the real Amenity Wax
numbers so you can verify the health math: Composite **66.81** → **Monitor**).

## Deploy (Vercel)

1. Push this repo to GitHub (see below).
2. In Vercel → **New Project** → import the repo → Deploy.
3. Add environment variables (Project → Settings → Environment Variables) — see
   `.env.example`. Leave `DATA_SOURCE=mock` for the first deploy; switch to
   `metabase` once the values are filled in.
4. **Protect it** — this shows customer data. Either set `DASHBOARD_PASSWORD`
   (a simple password gate) **or** turn on Vercel → Settings → **Deployment
   Protection** (recommended).

## Push to GitHub

```bash
git init
git add .
git commit -m "feat: account health dashboard scaffold"
git branch -M main
git remote add origin https://github.com/siranjt/zoca-account-health-dashboard.git
git push -u origin main
```

---

## Column → Retool source mapping

| Column | Retool tab → field |
|---|---|
| 🟢🟡🔴 Health | **Health Score** → Composite tier |
| Business (name, city, AM) | Business Details / header |
| Leads | GBP Metrics & Leads → Unique Leads *(test leads excluded)* |
| Reviews | Reviews → New Reviews |
| Photos | GBP Photos → Photos Uploaded on GBP |
| Profile clicks | Complete Funnel → Total profile clicks |
| Website clicks | Complete Funnel → Website clicks |
| Book Online | Complete Funnel → Unique book now clicks *(n/a if CTA inactive)* |
| KW Top-3 % | Ranking → % Keywords in Top 3 |
| Avg rank | Ranking → Avg Current Rank |
| KW impr. | Keyword Impressions → latest complete month |
| Recv→Open / Recv→Contact / Open→Contact | Lead Table timestamps: `Created at`, `Lead opened at`, `Lead contacted at` (averaged) |
| Products | Payments per-product amounts + Health Score "Agents paid" |

## Health score logic (`src/lib/health.ts`)

Confirmed from Retool:

```
Composite = 0.4·Engagement + 0.4·Value + 0.2·Product
```

(Amenity Wax: 0.4·28.57 + 0.4·88.46 + 0.2·100 = **66.81** ✓)

Tier → color (defaults, chosen so 66.81 = Monitor/yellow):
`≥80 Healthy (green)` · `≥60 Monitor (yellow)` · `<60 At risk (red)`.

> **Two things still to confirm from the Metabase card/SQL behind the Health
> Score tab** and then hard-code here:
> 1. how each sub-score (Engagement / Value / Product) is computed;
> 2. the exact composite → tier cutoffs.

## Wiring Metabase (`src/lib/metabase.ts`)

1. Set `METABASE_URL`, `METABASE_API_KEY`, `METABASE_DATABASE_ID`.
2. Set the `METABASE_CARD_*` ids to the saved Questions that power the Retool
   tabs (or leave them and use `queryNative` SQL instead).
3. Implement `getAccountsFromMetabase()` — join the cards by `entityId` per the
   mapping above, exclude churned + test leads, run each row through
   `buildHealth()`. Then set `DATA_SOURCE=metabase`.

If anything fails at runtime, the app logs the error and falls back to sample
data rather than crashing.

## Security notes

- The Metabase API key is **server-only** (`METABASE_*` env vars, used in
  `src/lib/metabase.ts` which is never imported by client code). It is never
  sent to the browser and never committed (`.env*` is gitignored).
- Add access protection before sharing the URL (password or Vercel protection).

## Project structure

```
src/
  app/
    page.tsx              list-view page (server component, live fetch)
    api/accounts/route.ts JSON API for the accounts payload
    layout.tsx, globals.css
  components/
    AccountsTable.tsx     search / filter / sort / columns (client)
    HealthDot.tsx         green/yellow/red marker + tooltip
  lib/
    types.ts              AccountRow + domain types
    health.ts             composite + tier + color
    metabase.ts           Metabase client + (TODO) live account builder
    mock.ts               realistic sample accounts
    data.ts               source selection + churned exclusion
    format.ts             number / duration formatting
  middleware.ts           optional password gate
```
