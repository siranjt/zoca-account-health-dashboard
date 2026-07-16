// ===========================================================================
// Health-score logic — replicated from the Retool "Health Score" tab.
//
// CONFIRMED from Retool (Amenity Wax Spot & Spa):
//   Engagement 28.57, Value 88.46, Product 100  ->  Composite 66.81, tier MONITOR
//   0.4*28.57 + 0.4*88.46 + 0.2*100 = 66.812  ✓ (weights 0.4 / 0.4 / 0.2)
//
// STILL TO CONFIRM (from the Metabase card/SQL behind that tab):
//   1. How each sub-score (engagement / value / product) is computed.
//   2. The exact composite -> tier cutoffs.
// The thresholds below are sensible defaults chosen so 66.81 lands in MONITOR
// (yellow), matching Retool. Adjust TIER_CUTOFFS once the SQL is available.
// ===========================================================================

import type { HealthColor, HealthScore, HealthTier } from "./types";

export const HEALTH_WEIGHTS = { engagement: 0.4, value: 0.4, product: 0.2 };

/** composite >= healthy => green; >= monitor => yellow; else red. */
export const TIER_CUTOFFS = { healthy: 80, monitor: 60 };

const TIER_COLOR: Record<HealthTier, HealthColor> = {
  healthy: "green",
  monitor: "yellow",
  at_risk: "red",
};

export const TIER_LABEL: Record<HealthTier, string> = {
  healthy: "Healthy",
  monitor: "Monitor",
  at_risk: "At risk",
};

export function composite(
  engagement: number | null,
  value: number | null,
  product: number | null
): number | null {
  if (engagement == null || value == null || product == null) return null;
  return (
    HEALTH_WEIGHTS.engagement * engagement +
    HEALTH_WEIGHTS.value * value +
    HEALTH_WEIGHTS.product * product
  );
}

export function tierFor(compositeScore: number | null): HealthTier {
  if (compositeScore == null) return "at_risk";
  if (compositeScore >= TIER_CUTOFFS.healthy) return "healthy";
  if (compositeScore >= TIER_CUTOFFS.monitor) return "monitor";
  return "at_risk";
}

/**
 * Pick the dimension dragging the score down (matches Retool's "Health tier
 * reason", e.g. "Engagement"). Returns null when everything is healthy.
 */
export function weakestDimension(
  engagement: number | null,
  value: number | null,
  product: number | null
): string | null {
  const dims: Array<[string, number | null]> = [
    ["Engagement", engagement],
    ["Value", value],
    ["Product", product],
  ];
  const present = dims.filter(([, v]) => v != null) as Array<[string, number]>;
  if (present.length === 0) return null;
  present.sort((a, b) => a[1] - b[1]);
  const [name, score] = present[0];
  return score < TIER_CUTOFFS.healthy ? name : null;
}

export function buildHealth(
  engagement: number | null,
  value: number | null,
  product: number | null
): HealthScore {
  const c = composite(engagement, value, product);
  const tier = tierFor(c);
  return {
    engagement,
    value,
    product,
    composite: c,
    tier,
    color: TIER_COLOR[tier],
    reason: weakestDimension(engagement, value, product),
  };
}
