# Perf Tier 2 — persist the book cache across Vercel instances (scope, 05/08/26)

> **DECISION (05/08/26): Option C chosen and implemented** — Neon L2 cache, for reliability over
> the ~2 MB `unstable_cache` cliff in Option A. Two-tier read in `src/lib/data.ts`:
> in-memory L1 → `alfred.book_cache` (Neon) L2 → live Metabase. Coalescing + role-scoping unchanged;
> fail-safe (any Neon error falls through to the live fetch). 120s TTL preserved.

**Problem:** clicking Overview / Open-in-detail intermittently takes a few seconds. Tier 1
(`loading.tsx` skeletons, shipped `745f502`) makes the *click* respond instantly, but the
*content* can still lag. This scopes the fix for the real latency.

## Root cause (confirmed in code)
- `/overview` and `/account/[id]` both `await getAccountsPayload()` — the full ~800-account book
  from Metabase (`getAccountsFromMetabase`, ~6s).
- It's cached only in an **in-memory `Map`** (`bookCache`, `BOOK_TTL_MS = 120s`, keyed by window)
  in `src/lib/data.ts`. On Vercel this lives inside one warm serverless instance; **cold instances
  start empty and re-fetch the 6s book.** That's the intermittent lag.
- `/account/[id]` fetches the whole heavy book just to find **one** account row + build the light
  picker `{entityId, name, aka, color, am}`.

## What already exists (and why it's not enough)
- `snapshots.ts` → `alfred.book_daily` (Neon): **one row/day**, lightweight `accounts_json`
  (`i,n,c,k,m,t,o,a`). Great for the trend/activity diff and for the **picker**, but daily +
  8 fields ≠ the windowed, ~40-field book the overview renders. Not a live overview fast path.
- The book is **viewer-independent** (scoped after fetch) → a shared cache is correctness-safe.
- Freshness target: **120s** staleness is already the accepted design (BOOK_TTL_MS).

## Options

### Option A — wrap the fetch in Next `unstable_cache` (simplest)
Wrap `getAccountsFromMetabase` in `unstable_cache([...], { revalidate: 120, tags: ["book"] })`,
keyed by window. Keep the in-memory `Map` as L1; `unstable_cache` is the persisted L2 (survives
instances, Vercel-managed).
- **Effort:** ~1–2h. **Risk:** low. **Rollback:** remove the wrapper.
- **Caveat — MUST measure first:** Vercel's data-cache entry limit is ~2 MB. Estimated book
  payload ≈ 1–1.8 MB/window (800 accts × ~40 fields incl. 2×12 sparklines + deltas). Likely fits
  *per window*, but it's close. **Blocker: log `JSON.stringify(payload).length` in prod for each
  window before committing to A.** If any window > ~2 MB, use Option C.

### Option C — Neon L2 cache (robust, size-agnostic) — RECOMMENDED if A doesn't fit
New table `alfred.book_cache(window text primary key, payload jsonb, at timestamptz)`.
`getAccountsPayload`: L1 Map → **L2 Neon** (fresh if `now-at < 120s`) → Metabase (then write both).
- **Effort:** ~3–4h. **Risk:** low-moderate (new table, one write per refresh). **Rollback:** skip the
  L2 read.
- Neon jsonb has no 2 MB limit; read ~50–100 ms vs 6s Metabase. Uses existing Neon infra
  (`getSql`, `neonUrl`). Coalescing (`bookInflight`) still prevents stampede on refresh.

### Option B — decouple account-open from the heavy book (optional add-on)
`/account/[id]` picker ← `alfred.book_daily` (fast Neon read; already has `{i,n,c,a}` + color).
Account-row header KPIs ← either A/C's cached book or a single-account query. Makes "Open in
detail" independent of the full-book fetch entirely.
- **Effort:** ~1–2h. **Risk:** low. Only worth doing if A/C alone don't make account-opens snappy
  (with A/C the book is already fast, so B may be unnecessary).

## Recommendation
1. **Measure the payload size in prod** (one log line) — this decides A vs C.
2. If ≤ ~1.5 MB/window → **Option A** (cheapest, Vercel-native).
3. If larger → **Option C** (Neon L2).
4. Hold **Option B** unless account-opens still feel heavy after A/C.
5. Same pattern later applies to `detailCache` (per-account, smaller) if detail opens still lag —
   secondary, not in this pass.

## Non-negotiables when implementing
- Preserve in-flight coalescing (no stampede when the cache refreshes).
- Cache the **full** book only; keep role-scoping *after* the cache read.
- Never cache the mock/fallback payload (existing `cacheable=false` on Metabase error stays).
- 120s freshness unchanged. `npm run build` + `tsc` before push (prod deploys on push to main).

## Open question for Siranjith
Confirm 120s staleness is acceptable to the team for the overview (it's the current behavior, just
made reliable). If they want fresher, we shorten the TTL — at the cost of more Metabase hits.
