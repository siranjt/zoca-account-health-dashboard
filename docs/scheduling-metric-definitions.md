# Scheduling metrics — definitions contract

**Version 2, 03/08/26.** Written before the v2 workbook was built, after a QC audit found five defects in v1. Every term below has exactly one meaning across every sheet. If a sheet needs a different population, it gets a **different label**.

As-of date for all trailing-window tests: **03/08/26**. Launch date: **30/01/26**.

---

## Grain

| Term | Definition | Count |
|---|---|---|
| **Location** | One row per `scheduling.onboarding.location_entity_id`. The unit of the adoption funnel. | 444 |
| **Account** | A distinct entity behind a Chargebee customer, via `chargebee.entity_customer_mappings`. Multi-location businesses collapse to one. | — |

Do not use "account" and "location" interchangeably. 444 locations map to only 270 Chargebee customers of any status and 156 active ones.

Chargebee holds 2,026 customer records against 1,799 distinct emails — **89 emails map to multiple records**. Any count keyed on `customer_id` over-counts businesses. Always resolve to `entity_id` before counting accounts.

## Bookings — the definition that broke v1

`migration_source IS NULL` does **not** mean "earned on Zoca". 33 entities had historical bookings imported with no `migration_source` tag.

| Term | Definition | Count |
|---|---|---|
| **Earned booking** | `migration_source IS NULL` **AND** `created_at >= 30/01/26` **AND** `created_at <= as-of` | **9,601** |
| Pre-launch untagged | `migration_source IS NULL` AND `created_at < 30/01/26` — imported history masquerading as organic | 13,266 |
| Future-dated | `created_at > as-of` — impossible creation dates, excluded everywhere | 173 |
| Tagged migration | `migration_source IS NOT NULL` — Square, Vagaro, Fresha, Booksy, GlossGenius, Acuity, Setmore, GoDaddy | 47,427 |
| **Customer-made booking** | Earned booking **AND** `created_by_type IN ('EC','CLIENT')`. The figure that proves the product works. Zero pre-launch contamination. | **4,352** |
| Staff-made | Earned booking AND `created_by_type = 'SP'` | — |

**"Native bookings" is retired as a term.** It meant `migration_source IS NULL` and was inflated ~2.4×.

## Activation states

`is_scheduling_enabled` is a **configuration flag and it is unreliable** — 7 locations took real bookings while flagged FALSE (all 7 also `is_onboarding_completed = FALSE`). Two distinct concepts, two distinct labels:

| Term | Definition | Use for |
|---|---|---|
| **Enabled (flag)** | `is_scheduling_enabled = TRUE` | Setup progress only |
| **Operationally live** | ≥1 **earned** booking, regardless of flag | Whether the product is actually in use |
| **Live in last 30d** | Most recent **earned** booking `>= as-of − 30 days` | Retention. Future-dated rows cannot qualify. |
| **Dormant** | Operationally live at some point, but not in the last 30 days | The core finding |

## Pitch — July 2026

| Term | Definition |
|---|---|
| **Call→account attribution** | Emails extracted from `sales.fireflies_meeting.participants` by regex (field is sometimes a JSON array, sometimes comma-separated; a `::jsonb` cast errors). Internal domains dropped: `zoca.com`, `timelyai.com`, `zoca.ai`. Joined to `chargebee.customers.email`, then resolved to `entity_id`. |
| **Offer** | Transcript contains Zoca offering *its own* scheduling. **All `our`-patterns require a word boundary (`\mour`)** — without it, `our booking platform` matches inside "y‑our booking platform", counting reps discussing the customer's *existing* system. That defect produced a 55% false-positive rate in v1. |
| **Pitched** | Offer made **AND** the account was not already live on Zoca scheduling before that call. Offer language to an existing user is support, not a pitch. |
| **Converted** | Pitched **AND** subsequently reached enabled. Attribution is temporal (onboarding created after the call), not causal. |

## Coverage limits — always stated alongside the number

- Only accounts whose attendee email matches a Chargebee customer are counted. Roughly half of external emails match. **The pitch count is a floor.**
- Prospects (emails matching no customer) are excluded — they are new-business pitches, not upsells.
- Call transcripts carry no usable `entity_id` (1.9% populated); attribution is via participant email and cannot be perfect.

## Verification rule

Every headline number must be computed **two independent ways** and reconciled before publication. A formula that evaluates cleanly is not a formula that is right. Checking only the output of a filter cannot reveal what the filter wrongly included — v1 failed exactly there.

## v1 → v2 corrections

| Metric | v1 | v2 | Cause |
|---|---|---|---|
| Accounts pitched (July) | 98 | **63** | Missing word boundary; customer-record counting |
| Reached enabled | 15 | **8** | Same |
| Native/earned bookings | 23,019 | **9,601** | Untagged pre-launch history |
| Live in 30 days | 147 | **145** | Future-dated `created_at` |
| Customer-made bookings | 4,352 | **4,352** | Unaffected |
| Payments processed | $645,568 | **$645,568** | Unaffected |
