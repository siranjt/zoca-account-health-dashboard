// ===========================================================================
// Domain types for the Account Health Dashboard.
// One `AccountRow` == one line in the list view.
// ===========================================================================

/** Zoca products an account can have active. "discovery" = local SEO + website. */
export type ZocaProduct =
  | "discovery"
  | "front_desk"
  | "campaigns"
  | "social"
  | "ads";

export const PRODUCT_LABELS: Record<ZocaProduct, string> = {
  discovery: "Discovery",
  front_desk: "Front Desk",
  campaigns: "Campaigns",
  social: "Social",
  ads: "Ads",
};

/** Health tier -> maps to the green / yellow / red marker in the list view. */
export type HealthTier = "healthy" | "monitor" | "at_risk";

export type HealthColor = "green" | "yellow" | "red";

export interface HealthScore {
  /** 0-100 sub-scores (from Retool: engagement / value / product). */
  engagement: number | null;
  value: number | null;
  product: number | null;
  /** composite = 0.4*engagement + 0.4*value + 0.2*product (confirmed from Retool). */
  composite: number | null;
  tier: HealthTier;
  color: HealthColor;
  /** which dimension is dragging the score (e.g. "Engagement"). */
  reason: string | null;
}

export interface AccountRow {
  // --- identity ---
  entityId: string; // location entity_id (Retool: Business Details)
  name: string; // GBP Title / business name
  city: string | null;
  state: string | null;
  accountManager: string | null;
  accountExecutive: string | null;

  // --- lifecycle (used to exclude churned) ---
  isChurned: boolean;
  cancelledDate: string | null;
  nextBillingDate: string | null;
  paidStatus: string | null;

  // --- health marker ---
  health: HealthScore;

  // --- core metrics (over the reporting window) ---
  leadsReceived: number; // excludes test leads
  reviewsReceived: number;
  photosUploaded: number; // Photos Uploaded on GBP
  profileClicks: number;
  websiteClicks: number;
  bookOnlineClicks: number | null; // null when booking CTA is not active
  bookOnlineActive: boolean;

  // --- SEO ---
  keywordsTracked: number;
  keywordsTop3Pct: number | null; // % of keywords ranking in top 3
  avgCurrentRank: number | null;
  keywordImpressions: number; // latest complete month

  // --- lead responsiveness (averages, in milliseconds; null if N/A) ---
  avgReceivedToOpenedMs: number | null;
  avgReceivedToContactedMs: number | null;
  avgOpenedToContactedMs: number | null;

  // --- cross-product context ---
  activeProducts: ZocaProduct[]; // includes discovery; "other agents" = the rest
}

export interface AccountsPayload {
  generatedAt: string;
  source: "mock" | "metabase";
  windowDays: number;
  accounts: AccountRow[];
}
