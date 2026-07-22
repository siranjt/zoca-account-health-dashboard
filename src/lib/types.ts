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
  lat?: number | null;
  lng?: number | null;
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
  /** Discovery Web (new web-app product) is activated for this account
   *  (entities.preferences → discovery.web.isActive = 'true'). */
  webAppActive: boolean;

  keywordsTracked: number | null;
  keywordsTop3Pct: number | null;
  avgCurrentRank: number | null;
  keywordImpressions: number;

  // --- payments / lifecycle ---
  daysToInvoice: number | null; // days until next invoice generated (negative = overdue cycle)
  daysOverdue: number | null; // days the oldest unpaid invoice has been overdue
  failedPayments: number; // count of failed payment attempts (all time)
  tenureDays: number | null; // days since onboarding (how long with Zoca)

  // --- support (Linear tickets, joined by entity_id — Beacon parity) ---
  openTickets: number; // ACTIVE Linear tickets (state Todo/In Progress/In Review)
  closedTicketsWindow: number; // Linear tickets closed (Done) within the selected window

  avgReceivedToOpenedMs: number | null;
  avgReceivedToContactedMs: number | null;
  avgOpenedToContactedMs: number | null;

  /** display labels of active products, incl. "Discovery" */
  activeProducts: string[];

  // --- trend cues (current vs previous window + 12-week sparklines) ---
  leadsDelta?: Delta;
  reviewsDelta?: Delta;
  clicksDelta?: Delta;
  sparkLeads?: number[];
  sparkClicks?: number[];
}

/** current-period value vs the immediately-preceding period. */
export interface Delta {
  cur: number;
  prev: number;
}

/** Lazy-loaded per-account time series for the expanded detail panel. */
export interface AccountDetail {
  entityId: string;
  profileWeekly: {
    wk: string;
    profileClicks: number;
    websiteClicks: number;
    callClicks: number;
    directions: number;
    leads: number;
    totalInteractions: number;
  }[];
  leadsReviews: { mon: string; leads: number; reviews: number }[];
  rankTrend: { d: string; top3: number | null; avgRank: number | null }[];
  funnel: { enquiries: number; opened: number; contacted: number; booked: number };
  payments?: PaymentDetail | null; // Chargebee billing for the payment charts
  // Extra Retool-derived charts (all optional — degrade to empty if a source fails)
  appUsage?: { wk: string; appOpen: number; leads: number; reviews: number; photos: number }[];
  bookings?: { label: string; leads: number; bookings: number }[];
  keywordRankings?: { keyword: string; avgRank: number; minRank: number; searchVolume: number | null }[];
  impressions?: { ym: string; impressions: number }[];
  reviewsDist?: { total: number; avg: number | null; last30: number; last90: number; dist: Record<string, number> } | null;
  comms?: { wk: string; sms: number; call: number }[];
  mediaCadence?: { wk: string; live: number }[];
  forecast?: { predicted: number | null; actual: number } | null;
  // Row-level records (Retool "Reviews List" / "Lead Table")
  reviewsList?: { reviewer: string | null; rating: number | null; platform: string | null; text: string | null; date: string | null }[];
  leadsList?: { date: string | null; source: string | null; service: string | null; status: string | null; price: number | null; currency: string | null; utm: string | null }[];
  // Native-tab widgets promoted from the Retool export
  posts?: { date: string | null; summary: string | null; event: string | null; offer: string | null; cta: string | null; topic: string | null; state: string | null }[];
  postsWeekly?: { wk: string; posts: number; cumsum: number }[];
  services?: { name: string | null; description: string | null; duration: number | null; price: number | null; category: string | null }[];
  requests?: { date: string | null; status: string | null; priority: string | null; requestType: string | null; details: string | null }[];
  csat?: { date: string | null; platform: string | null; formType: string | null; question: string | null; answer: string | null }[];
  onboarding?: { state: string | null; createdAt: string | null; bookingLinkAdded: boolean | null; leadPredictionViewed: boolean | null; winOnboardedDate: string | null } | null;
  schedulingStatus?: { schedulingProduct: string | null; websiteFlipped: string | null; callCtaEnabled: string | null } | null;
  totalBookings?: number | null;
  bookingsByStatus?: { status: string | null; count: number }[];
  bookingsByCreator?: { creatorType: string | null; count: number }[];
  wowTasks?: { wk: string; total: number; completed: number; cancelled: number; pending: number; resolutionPct: number | null }[];
  callbackActions?: { action: string | null; count: number }[];
  paymentLinks?: { missedPayment: string | null; paymentMethodUpdate: string | null } | null;
}

export interface PaymentInvoice {
  date: string | null;
  due_date: string | null;
  paid_at: string | null;
  total_usd: number;
  amount_paid_usd: number;
  amount_due_usd: number;
  status: string;
  paid: boolean;
  days_late: number | null;
}
export interface PaymentDetail {
  found: boolean;
  auto_collection: string | null;
  net_term_days: number | null;
  total_mrr_usd: number;
  active_subscription_count: number;
  total_paid_usd: number;
  unpaid_total_usd: number;
  failed_txn_count: number;
  on_time_rate: number | null;
  avg_days_late: number | null;
  invoices: PaymentInvoice[];
}

export interface AccountsPayload {
  generatedAt: string;
  source: "mock" | "metabase";
  windowDays: number;
  from: string; // ISO — start of the metrics window
  to: string; // ISO — end of the metrics window
  custom: boolean; // true when a custom date range is in effect
  accounts: AccountRow[];
}

/** "Other agents active" = products beyond the base Discovery product. */
export function otherProducts(a: AccountRow): string[] {
  return a.activeProducts.filter((p) => p !== BASE_PRODUCT);
}
