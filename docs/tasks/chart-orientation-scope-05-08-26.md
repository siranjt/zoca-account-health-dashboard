# Chart orientation scope — horizontal → vertical / funnel (05/08/26)

**Ask:** "Change the horizontal charts into funnels or vertical charts — people find horizontal hard to work with."

## Bottom line (recommendation first)
**Do not blanket-convert horizontal → vertical.** Most of these charts are horizontal for sound
reasons (long category labels, established convention). Verticalizing them rotates/truncates the
labels and makes them *harder*, not easier — the opposite of the goal. The real, evidence-backed
wins are narrower:

1. **Turn the enquiry→booked flow into a true funnel** — the one chart that is genuinely a funnel.
2. **Guarantee value-sorting** on the categorical bars (cheapest, biggest readability win).
3. **Optionally** verticalize only the 2–3 *short-label* charts — and only if the team names them
   as the actual pain.

## ui-ux-pro-max grounding (dataviz rules)
- **Compare-categories (bar):** `<20 categories → vertical bar` is the *default*, **BUT** long labels
  push to horizontal (labels don't fit under vertical bars). Non-negotiables: **always sort
  descending by value**, value label on every bar, offer a sort control.
- **Funnel:** use only for a **sequential, monotonically-decreasing** process of **3–8 stages**
  (conversion/drop-off). Non-sequential data → stay a bar. Show the conversion % *between* stages and
  highlight the biggest drop.

## Every categorical bar chart in the product (account detail — the daily-use surface)

| Chart | Tab | Cats | Label length | Now | Verdict | Effort |
|---|---|---|---|---|---|---|
| **FunnelChart** | Funnel & Leads | 4 (sequential) | short | horizontal bars | **→ true tapering funnel + drop-off %** — the headline opportunity | ~1–2h |
| **LeadSourcesBars** | Funnel & Leads | ≤12 | **long** ("Website / Direct", "SMS / Campaign") | horizontal | **Keep horizontal**; ensure **sorted desc by count** (source has no ORDER BY today) | ~30m (sort) |
| **KeywordRankingsChart** | Rankings | 8 | **very long** (keyword phrases, w-40 truncated) | horizontal | **Keep horizontal** — already sorted by rank (SQL `ORDER BY avg_rank ASC`) | none |
| **ReviewsDistChart** | Reviews | 5 (5★→1★) | tiny | horizontal | **Keep** (Amazon/Google star-dist convention is horizontal) — or verticalize if insisted | ~1h if converted |
| **HealthBars** | Profile & GBP | 3 (Engagement/Value/Product) | short | horizontal | Optional verticalize; reads cleanly as a scorecard now — lateral move | ~1h |
| **LeadForecastChart** | Funnel & Leads | 2 (Predicted/Actual) | medium | horizontal | Optional verticalize (2 columns) | ~45m |

**Time-series charts are already vertical/line and are out of scope** (LeadsReviewsChart,
RankTrendChart, MultiLineChart, PaymentTrendsChart, PaymentDetailsChart). The complaint is about the
*categorical* bars above.

**Not yet scoped:** `VoidCharts.tsx` (Rogues / missed-payment admin page) — admin-only, lower daily
use. Scope on request.

## Opportunities, ranked by value-to-effort

1. **FunnelChart → real funnel** *(HIGH · ~1–2h)* — directly answers "make it a funnel," and it's the
   one chart that textbook-qualifies. Tapering trapezoid, conversion % between stages, biggest-drop
   highlighted. Hand-built SVG (repo rule: no chart library).
2. **Sort LeadSources bars descending by count** *(HIGH · ~30m)* — the single cheapest readability win;
   ui-ux-pro-max's #1 bar rule. Keyword chart is already sensibly sorted.
3. **Verticalize the short-label charts** *(MED · ~1h each, only if named)* — ReviewsDist / HealthBars /
   LeadForecast *can* go vertical cleanly (≤5 short labels). But it's a lateral move, and ReviewsDist
   has strong horizontal convention. Do only the ones the team actually finds hard.
4. **Keep horizontal** *(no work)* — LeadSources, Keywords. Long labels; horizontal is correct. A
   forced vertical here would rotate/clip the labels — the exact "hard to work with" we're avoiding.

## Detail-page ("Open in detail") addendum
Scoped both the inline row-expand (`DetailPanel.tsx`) and the full page (`AccountDossier.tsx`).
**Every chart on the detail page is a shared `Charts.tsx` component already covered above** — the
funnel rebuild and Lead-Sources sort apply to both surfaces. The only detail-page-specific data
displays are **not charts**:
- Bookings by status / by creator / callback actions → `Row` = label/value **text rows** (no bars).
- Migration cards 5392/5393 → `Stat` tiles + a Metric/AM/All **table** (no bars).
- WOW tasks → line chart (time-series).

*Optional future enhancement (NOT a horizontal-chart fix):* the bookings/callbacks text tables could
become small bar charts for at-a-glance comparison — but that's **adding** viz, not reorienting it.

## Open questions (blocking precise scoping)
- **Which specific charts hurt?** "Horizontal is hard" is real but the fix diverges by label length —
  a long-label chart wants sort+labels, a short-label chart can go vertical. One or two named
  offenders lets me scope tightly instead of guessing across six.
- **Prior decision:** an earlier session ended with *"leave it horizontal."* Does this reverse that,
  or target different charts? Confirm before I touch the ones previously frozen.
