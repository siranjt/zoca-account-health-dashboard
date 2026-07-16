# Retool → Dashboard data mapping

Derived from the exported Retool "Customer Dashboard" app (79 SQL queries).
The Retool app is **per-account** (every query filters `WHERE entity_id = {{select1.value}}`).
Our list view is **all-accounts**, so each query below is adapted to
`GROUP BY entity_id` over a reporting window and joined by `entity_id`.

All queries run against one Postgres warehouse (schemas: `entities`, `gbp`,
`website`, `reviews`, `local_seo`, `clients`, `chargebee`, `cx`, `media`,
`scheduling`, `mixpanelzocaappdata`, …) — the same DB Metabase connects to.

## Headline finding — the health score is a TABLE, not a formula

The entire Health Score tab is:

```sql
SELECT * FROM cx.health_score WHERE entity_id = {{ select1.value }}
```

So `cx.health_score` already stores, per account:
`score_engagement`, `score_value`, `score_product`, `composite_health`,
`health_tier`, `health_tier_reason`, `recommended_action`, `total_mrr`,
`active_subs`, `agents_paid`, and the `alert_*` flags.

Consequence: we **do not compute** the score or reverse-engineer weights.
The green/yellow/red marker = the `health_tier` column, read directly.
`SELECT * FROM cx.health_score` (no WHERE) is the **backbone** of the list view.

## Column → source mapping

| Dashboard column | Query | Schema.table | Notes |
|---|---|---|---|
| Business name / GBP title | q17, q45, q58 | `gbp.locations.title`, `cx.health_score.gbp_title` | |
| City / State | q02 | `entities.locations` | |
| Account Manager / Executive | q42 | `cx.am_mapping`, `cx.ae_mapping`, `entities.employees` | |
| 🟢🟡🔴 Health marker | **q58** | **`cx.health_score.health_tier`** | + composite/sub-scores/reason/alerts all in same table |
| Leads received | q06, q54, q61, q16 | `website.booking_enquiries` | `source='WEBSITE' AND is_test_lead=FALSE`, count in window |
| Reviews received | q05, q30, q04 | `reviews.reviews` | count in window |
| Photos uploaded | q59 | `gbp.scheduled_media` (`status='POSTED'`) | `photos_uploaded_on_gbp` |
| Profile clicks | q00, q45 | `gbp.metrics` | funnel `total_profile_clicks` |
| Website clicks | q00, q45 | `gbp.metrics` | funnel `website_clicks` |
| Book Online clicks | q00, q45 | `gbp.metrics` | funnel `unique_book_now_clicks` |
| Book Online active | q62, q71, q53 | `entities.product_entities`, `scheduling.onboarding`, `website.locations` | CTA/scheduling active flag |
| KW Top-3 % / Avg rank | q11, q35, q36, q37 | `local_seo.rank` | best/current rank, % in top 3 |
| KW impressions | q03, q55 | `gbp.keyword_impressions` | latest complete month |
| Recv→Open / Recv→Contact / Open→Contact (avg) | **q06** | `website.booking_enquiries` + `mixpanelzocaappdata.export` (event `Leads-View-Chat`) + `clients.communication_logs` (type in `SMS`,`CALL`) | see timing logic below |
| Other Zoca products active | q62, q78 | `entities.product_entities` (`is_active=true`), `cx.health_score.agents_paid` | Discovery = local SEO + website; others = Front Desk, Campaigns, Social, Ads |

## Lead-timing logic (from q06)

- **received** = `booking_enquiries.created_at` (source WEBSITE, `is_test_lead=FALSE`)
- **opened** = `MIN(time)` of Mixpanel event `Leads-View-Chat` where `lead_id = enquiry_id`
- **contacted** = `MIN(created_at)` in `clients.communication_logs` (`type IN ('SMS','CALL')`) where `enquiry_id` matches

Averages per account: `avg(opened-received)`, `avg(contacted-received)`,
`avg(contacted-opened)` over leads where the endpoints exist.

## Churned / test exclusion

- **Churned**: exclude where no active subscription. Sources: `cx.health_score.active_subs > 0`;
  chargebee `cancelled_at` (q75); active subs `status IN ('active','future')` (q29).
- **Test accounts**: `entities.entities.is_test` / `gbp.test_locations` (q17). **Test leads**: `booking_enquiries.is_test_lead=FALSE`.

## All-accounts rollup precedent (q78)

q78 (the ~44 KB "HubSpot custom fields" query) already assembles one row per
location across ALL accounts — CTEs include `leads_30d`, `app_metrics`,
`product_level_data`, `active_subscriptions`, `agent_level_summary`,
`review_automation_data`, comms (`last_incoming`/`last_outgoing`), payment
status, etc. It proves the per-account rollup pattern and is a reference for
the all-accounts joins.

## Implementation plan

Run ~8 all-accounts native SQL queries via Metabase `/api/dataset`, join by
`entity_id` in `src/lib/metabase.ts` → `getAccountsFromMetabase()`:

1. `cx.health_score` (all rows) — account list + health + mrr + active_subs + agents_paid
2. leads + timing (booking_enquiries + mixpanel + communication_logs)
3. reviews (reviews.reviews)
4. photos (gbp.scheduled_media)
5. gbp metrics (gbp.metrics) — profile/website/book-now clicks
6. rankings (local_seo.rank)
7. impressions (gbp.keyword_impressions)
8. products (entities.product_entities) + am/ae (cx.*_mapping)

Filter out churned + test in the base query; window defaults to 30 days.
