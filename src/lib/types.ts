// ===========================================================================
// Domain types for the Account Health Dashboard.
// One `AccountRow` == one line in the list view.
// ===========================================================================

/** The base product every Discovery account has (local SEO + website). */
export const BASE_PRODUCT = "Discovery";

/** Map cx.health_score agent tokens -> display labels. */
export const AGENT_LABELS: Record<string, string> = {
  "discovery-agent": "Discovery",
  "loyalty-agent": "Loyalty",
  "social-agent": "Social",
  "ads-agent": "Ads",
  "win-agent": "WIN",
  domain: "Domain",
};

export function labelAgent(token: string): string {
  const t = token.trim().toLowerCase();
  return AGENT_LABELS[t] ?? t.replace(/-agent$/, "").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type HealthTier = "healthy" | "monitor" | "at_risk" | "critical";
export type HealthColor = "green" | "yellow" | "red";

export interface HealthScore {
  engagement: number | null;
  value: number | null;
  product: number | null;
  composite: number | null;
  tier: HealthTier;
  color: HealthColor;
  /** raw tier label from Metabase, e.g. "CRITICAL - DEAL BREAKER" */
  tierLabel: string;
  /** which dimension is dragging the score (e.g. "Engagement"). */
  reason: string | null;
  recommendedAction: string | null;
}

export interface AccountRow {
  entityId: string;
  name: string;
  city: string | null;
  state: string | null;
  accountManager: string | null;

  health: HealthScore;
  mrr: number | null;

  leadsReceived: number;
  reviewsReceived: number;
  photosUploaded: number;
  profileClicks: number;
  websiteClicks: number;
  bookOnlineClicks: number | null;
  bookOnlineActive: boolean;

  keywordsTracked: number | null;
  keywordsTop3Pct: number | null;
  avgCurrentRank: number | null;
  keywordImpressions: number;

  avgReceivedToOpenedMs: number | null;
  avgReceivedToContactedMs: number | null;
  avgOpenedToContactedMs: number | null;

  /** display labels of active products, incl. "Discovery" */
  activeProducts: string[];
}

export interface AccountsPayload {
  generatedAt: string;
  source: "mock" | "metabase";
  windowDays: number;
  accounts: AccountRow[];
}

/** "Other agents active" = products beyond the base Discovery product. */
export function otherProducts(a: AccountRow): string[] {
  return a.activeProducts.filter((p) => p !== BASE_PRODUCT);
}
