# Scheduling — the corrected numbers

**04/08/26.** Supersedes every earlier figure in this session, including the July-only pitch numbers.

Two separate questions, two separate answers. They are not one funnel and must never be presented as one.

---

## A. THE PITCH — all months, account level, evidenced by call transcripts

Window **01/11/25 – 04/08/26**. One row per account, dated by its **first** recorded pitch.

| Stage | Accounts |
|---|---|
| Accounts with a recorded pitch | 173 |
| …already live on scheduling when pitched (excluded — that is support, not a pitch) | −25 |
| **PITCHED** | **148** |
| …onboarded after the pitch | **31 (21%)** |
| …reached scheduling enabled | **23 (16%)** |
| …taking bookings | **23 (16%)** |
| …still booking in last 30 days | 22 |
| **Never onboarded** | **117 (79%)** |

Output from the 31 that converted: **1,584 earned bookings · 407 customer-made · $194,994 processed.**

### By pitch month — and why the month matters

| First pitched | Pitched | Onboarded | Enabled | Booking | Conv. | Median days pitch → onboard |
|---|---|---|---|---|---|---|
| Nov 25 | 2 | 0 | 0 | 0 | 0% | — |
| Dec 25 | 10 | 1 | 0 | 1 | 10% | 182 |
| Jan 26 | 14 | 4 | 4 | 3 | 29% | 181 |
| Feb 26 | 15 | 6 | 4 | 5 | 40% | 125 |
| Mar 26 | 18 | 4 | 4 | 4 | 22% | 37 |
| Apr 26 | 18 | 5 | 3 | 3 | 28% | 92 |
| May 26 | 7 | 2 | 2 | 1 | 29% | 72 |
| Jun 26 | 22 | 4 | 3 | 3 | 18% | 26 |
| Jul 26 | 41 | 5 | 3 | 3 | 12% | 2 |
| Aug 26 | 1 | 0 | 0 | 0 | 0% | — |

**Scheduling does not convert on the call.** Lag from pitch to onboarding: **min 1 day, median 35, max 190.** Sixteen of the 31 conversions took more than 30 days.

**Recent months are therefore understated, not failing.** July's 12% is not a worse pitch — it is a cohort that has not had time to convert. Judge a pitch month only after ~90 days.

**This corrects the earlier July-only analysis.** That window reported 63 pitched / 13 onboarded and structurally could only capture conversions landing inside the same month. With a 35-day median lag, most conversions fall outside it. July shows 41 here rather than 63 because accounts first pitched in an earlier month are now attributed to that earlier month, where they belong.

---

## B. THE ADOPTION — since launch 30/01/26

The same data at three units. All three are true; they answer different questions.

### Unit 1 — Location (what `scheduling.onboarding` counts)

| | |
|---|---|
| Locations entered setup | **444** |
| Enabled (config flag) | 368 |
| Operationally live (≥1 earned booking) | 286 |
| Live in last 30 days | 147 |

### Unit 2 — Billed account (Chargebee customer) — **the real "account"**

| | All mapped | Active only |
|---|---|---|
| **Accounts** | **258** | **142** |
| Enabled (≥1 location) | 210 | 116 |
| Operationally live | 168 | 106 |
| **Live in last 30 days** | **124** | **100 (70%)** |
| Earned bookings | 8,387 | 7,527 |
| Customer-made bookings | 4,063 | 3,613 |
| Payments post-launch | $284,458 | $269,393 |

### Unit 3 — Whole platform

| | |
|---|---|
| Earned bookings since launch | **9,605** |
| Customer-made bookings | **4,627** |
| Payments processed post-launch | **$328,021** across 139 entities |

---

## What was wrong, and why

**1. The pitch window was too narrow.** A single month cannot measure a motion whose median conversion lag is 35 days. Corrected to a full pitch register with first-pitch dates.

**2. "444" was never a pitch number.** `scheduling.onboarding` is the setup flow — self-serve, AM-assisted or bulk. Verified genuine, not auto-provisioned: 448 rows across **448 distinct seconds**, **91 distinct creators**, and **zero** rows unmodified since creation.

**3. 174 of 444 locations (39%) have no billing link** and cannot be attributed to any account. That, not multi-location rollup, is why 444 locations reduce to 258 accounts.

**4. There is no brand key in the data.** `scheduling.onboarding.entity_id` yields 446 distinct values across 448 rows — effectively one per location. Only **3 accounts** hold more than one location. The apparent "Saxena × 37" clustering is **name similarity in GBP**, not a shared parent entity. A brand-level rollup cannot be produced from this data.

**5. Payments were counted all-time.** $646,104 includes $318,083 created before launch, back to 15/07/2024. Post-launch is **$328,021**.

**6. Bookings had the same defect.** `migration_source IS NULL` does not mean "earned on Zoca" — 33 entities had history imported untagged. Corrected from 23,019 to **9,605**.

---

## Safe to quote

> Scheduling has been pitched to **148 accounts** since Nov 2025. **31 onboarded, 23 are taking bookings**, and conversion takes a **median of 35 days** — so recent pitch months are still maturing. Platform-wide since launch it has processed **9,605 bookings (4,627 booked by end customers) and $328,021 in payments** across 139 accounts.

## Do not quote

- **$645,568** — half is pre-launch history
- **23,019 bookings** — inflated ~2.4× by untagged imports
- **63 pitched / 13 onboarded** — July-only, structurally biased against slow conversions
- **444 as accounts** — locations; the account figure is 258 mapped / 142 active
- **Square in 269 calls** — only 101 are genuine product context
- Objection Themes counts as per-account figures — those calls carry no account attribution

## Coverage limits

Pitches are counted only where a call attendee's email matches a Chargebee customer (~53% of external emails). **148 is a floor.** Prospects who are not yet customers are excluded. Conversion attribution is temporal (onboarding after pitch), not causal.

## Still unverified

Objection theme topic counts (directional only) · migration-source table (hardcoded from v1) · business names (89% coverage, four-source fallback).
