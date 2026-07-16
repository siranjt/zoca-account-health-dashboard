// ===========================================================================
// Health-score handling.
//
// LIVE (Metabase): the score is a PRE-COMPUTED table `cx.health_score`. We read
// score_engagement / score_value_realization / score_product_stability /
// composite_health_score / health_tier directly — no formula, no reverse-eng.
// `mapTier()` turns the tier label into the green/yellow/red marker.
//
// MOCK: `buildHealth()` reproduces the composite the app used before live data
// (0.4*eng + 0.4*value + 0.2*product), confirmed against Retool.
// ===========================================================================

import type { HealthColor, HealthScore, HealthTier } from "./types";

export const HEALTH_WEIGHTS = { engagement: 0.4, value: 0.4, product: 0.2 };
export const TIER_CUTOFFS = { healthy: 80, monitor: 60 };

export const TIER_LABEL: Record<HealthTier, string> = {
  healthy: "Healthy",
  monitor: "Monitor",
  at_risk: "At risk",
  critical: "Critical",
};

/** Map a cx.health_score.health_tier label -> tier + green/yellow/red color. */
export function mapTier(label: string): { tier: HealthTier; color: HealthColor } {
  const L = (label || "").toUpperCase();
  if (L.startsWith("HEALTHY") || L.startsWith("THRIVING")) return { tier: "healthy", color: "green" };
  if (L.startsWith("MONITOR")) return { tier: "monitor", color: "yellow" };
  if (L.startsWith("CRITICAL")) return { tier: "critical", color: "red" };
  return { tier: "at_risk", color: "red" }; // AT-RISK and anything else
}

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

function tierFor(c: number | null): HealthTier {
  if (c == null) return "at_risk";
  if (c >= TIER_CUTOFFS.healthy) return "healthy";
  if (c >= TIER_CUTOFFS.monitor) return "monitor";
  return "at_risk";
}

const TIER_COLOR: Record<HealthTier, HealthColor> = {
  healthy: "green",
  monitor: "yellow",
  at_risk: "red",
  critical: "red",
};

function weakestDimension(
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
  if (!present.length) return null;
  present.sort((a, b) => a[1] - b[1]);
  const [name, score] = present[0];
  return score < TIER_CUTOFFS.healthy ? name : null;
}

/** MOCK path — compute the score locally. */
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
    tierLabel: TIER_LABEL[tier],
    reason: weakestDimension(engagement, value, product),
    recommendedAction: null,
  };
}
