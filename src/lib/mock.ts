// ===========================================================================
// Realistic sample data so the dashboard runs & deploys with NO Metabase access.
// The first row (Amenity Wax Spot & Spa) uses the real numbers seen in Retool
// so you can eyeball that the health math matches (Composite 66.81 = MONITOR).
// Swap this out for live Metabase data by setting DATA_SOURCE=metabase.
// ===========================================================================

import { buildHealth } from "./health";
import type { AccountRow, ZocaProduct } from "./types";

const HOUR = 3_600_000;
const MIN = 60_000;

interface Seed {
  entityId: string;
  name: string;
  city: string;
  state: string;
  am: string;
  ae: string;
  eng: number | null;
  val: number | null;
  prod: number | null;
  leads: number;
  reviews: number;
  photos: number;
  profileClicks: number;
  websiteClicks: number;
  bookOnline: number | null;
  bookActive: boolean;
  keywords: number;
  top3: number | null;
  avgRank: number | null;
  impressions: number;
  toOpened: number | null;
  toContacted: number | null;
  openedToContacted: number | null;
  products: ZocaProduct[];
  churned?: boolean;
  cancelled?: string | null;
  nextBilling?: string | null;
  paid?: string;
}

const SEEDS: Seed[] = [
  {
    entityId: "71031ed6-149b-4398-9244-5b90c7a565ff",
    name: "Amenity Wax Spot & Spa",
    city: "Bronx", state: "NY", am: "Tanya Solanki", ae: "Chandan Gowda",
    eng: 28.57, val: 88.46, prod: 100, // real Retool numbers -> composite 66.81
    leads: 14, reviews: 4, photos: 15, profileClicks: 306, websiteClicks: 13,
    bookOnline: 4, bookActive: true, keywords: 475, top3: 2.95, avgRank: 16.1,
    impressions: 210, toOpened: 45 * MIN, toContacted: 3 * HOUR, openedToContacted: 2 * HOUR + 15 * MIN,
    products: ["discovery"], nextBilling: "2026-07-31", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0001", name: "Luxe Nails & Brows", city: "Austin", state: "TX",
    am: "Priya Nair", ae: "Rahul Sharma", eng: 82, val: 90, prod: 100,
    leads: 41, reviews: 12, photos: 88, profileClicks: 640, websiteClicks: 58,
    bookOnline: 22, bookActive: true, keywords: 210, top3: 34, avgRank: 6.4,
    impressions: 1240, toOpened: 12 * MIN, toContacted: 40 * MIN, openedToContacted: 28 * MIN,
    products: ["discovery", "front_desk", "social"], nextBilling: "2026-08-05", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0002", name: "Serenity Med Spa", city: "Denver", state: "CO",
    am: "Priya Nair", ae: "Rahul Sharma", eng: 61, val: 72, prod: 80,
    leads: 23, reviews: 6, photos: 54, profileClicks: 410, websiteClicks: 31,
    bookOnline: 9, bookActive: true, keywords: 320, top3: 14, avgRank: 11.2,
    impressions: 760, toOpened: 55 * MIN, toContacted: 4 * HOUR, openedToContacted: 3 * HOUR,
    products: ["discovery", "ads"], nextBilling: "2026-07-28", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0003", name: "The Barber Room", city: "Chicago", state: "IL",
    am: "Aditya Rao", ae: "Meera Joshi", eng: 22, val: 40, prod: 60,
    leads: 3, reviews: 0, photos: 12, profileClicks: 88, websiteClicks: 4,
    bookOnline: null, bookActive: false, keywords: 90, top3: 1, avgRank: 18.6,
    impressions: 120, toOpened: 6 * HOUR, toContacted: null, openedToContacted: null,
    products: ["discovery"], nextBilling: "2026-07-20", paid: "Payment due",
  },
  {
    entityId: "a1b2c3d4-0004", name: "Glow Aesthetics", city: "Miami", state: "FL",
    am: "Aditya Rao", ae: "Meera Joshi", eng: 74, val: 85, prod: 100,
    leads: 33, reviews: 9, photos: 120, profileClicks: 720, websiteClicks: 61,
    bookOnline: 18, bookActive: true, keywords: 260, top3: 28, avgRank: 7.1,
    impressions: 1520, toOpened: 20 * MIN, toContacted: 1 * HOUR, openedToContacted: 40 * MIN,
    products: ["discovery", "campaigns", "social", "ads"], nextBilling: "2026-08-11", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0005", name: "Pure Skin Studio", city: "Seattle", state: "WA",
    am: "Priya Nair", ae: "Chandan Gowda", eng: 48, val: 66, prod: 80,
    leads: 15, reviews: 3, photos: 47, profileClicks: 290, websiteClicks: 19,
    bookOnline: 6, bookActive: true, keywords: 180, top3: 9, avgRank: 12.8,
    impressions: 540, toOpened: 90 * MIN, toContacted: 6 * HOUR, openedToContacted: 4 * HOUR + 30 * MIN,
    products: ["discovery", "front_desk"], nextBilling: "2026-07-25", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0006", name: "Bella Hair Lounge", city: "Phoenix", state: "AZ",
    am: "Aditya Rao", ae: "Rahul Sharma", eng: 90, val: 94, prod: 100,
    leads: 52, reviews: 17, photos: 140, profileClicks: 910, websiteClicks: 77,
    bookOnline: 31, bookActive: true, keywords: 300, top3: 41, avgRank: 5.2,
    impressions: 1980, toOpened: 8 * MIN, toContacted: 25 * MIN, openedToContacted: 17 * MIN,
    products: ["discovery", "social"], nextBilling: "2026-08-02", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0007", name: "Zen Wellness Bar", city: "Portland", state: "OR",
    am: "Meera Joshi", ae: "Chandan Gowda", eng: 35, val: 58, prod: 60,
    leads: 8, reviews: 1, photos: 33, profileClicks: 175, websiteClicks: 11,
    bookOnline: 2, bookActive: true, keywords: 140, top3: 4, avgRank: 15.9,
    impressions: 330, toOpened: 3 * HOUR, toContacted: 12 * HOUR, openedToContacted: 9 * HOUR,
    products: ["discovery"], nextBilling: "2026-07-22", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0008", name: "Radiance Brow Studio", city: "San Diego", state: "CA",
    am: "Meera Joshi", ae: "Rahul Sharma", eng: 67, val: 78, prod: 100,
    leads: 27, reviews: 7, photos: 71, profileClicks: 505, websiteClicks: 38,
    bookOnline: 12, bookActive: true, keywords: 240, top3: 22, avgRank: 8.9,
    impressions: 980, toOpened: 30 * MIN, toContacted: 2 * HOUR, openedToContacted: 90 * MIN,
    products: ["discovery", "campaigns"], nextBilling: "2026-08-09", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0009", name: "Velvet Lash Bar", city: "Nashville", state: "TN",
    am: "Aditya Rao", ae: "Meera Joshi", eng: 19, val: 33, prod: 40,
    leads: 2, reviews: 0, photos: 8, profileClicks: 62, websiteClicks: 2,
    bookOnline: null, bookActive: false, keywords: 70, top3: 0, avgRank: 19.4,
    impressions: 60, toOpened: 10 * HOUR, toContacted: null, openedToContacted: null,
    products: ["discovery"], nextBilling: "2026-07-19", paid: "Payment due",
  },
  {
    entityId: "a1b2c3d4-0010", name: "Opal Skincare", city: "Boston", state: "MA",
    am: "Priya Nair", ae: "Chandan Gowda", eng: 78, val: 88, prod: 100,
    leads: 36, reviews: 11, photos: 96, profileClicks: 680, websiteClicks: 52,
    bookOnline: 19, bookActive: true, keywords: 280, top3: 31, avgRank: 6.8,
    impressions: 1410, toOpened: 15 * MIN, toContacted: 50 * MIN, openedToContacted: 35 * MIN,
    products: ["discovery", "front_desk", "campaigns", "social"], nextBilling: "2026-08-14", paid: "Paid",
  },
  {
    entityId: "a1b2c3d4-0011", name: "Coastal Cuts", city: "Charleston", state: "SC",
    am: "Meera Joshi", ae: "Rahul Sharma", eng: 54, val: 69, prod: 80,
    leads: 18, reviews: 4, photos: 58, profileClicks: 340, websiteClicks: 24,
    bookOnline: 7, bookActive: true, keywords: 200, top3: 12, avgRank: 10.6,
    impressions: 690, toOpened: 70 * MIN, toContacted: 5 * HOUR, openedToContacted: 3 * HOUR + 40 * MIN,
    products: ["discovery", "ads"], nextBilling: "2026-07-30", paid: "Paid",
  },
  // ---- churned accounts: MUST be filtered out of the list view ----
  {
    entityId: "a1b2c3d4-9001", name: "Old Town Spa (churned)", city: "Dallas", state: "TX",
    am: "Aditya Rao", ae: "Meera Joshi", eng: 12, val: 20, prod: 0,
    leads: 0, reviews: 0, photos: 3, profileClicks: 10, websiteClicks: 0,
    bookOnline: null, bookActive: false, keywords: 40, top3: 0, avgRank: 20,
    impressions: 0, toOpened: null, toContacted: null, openedToContacted: null,
    products: [], churned: true, cancelled: "2026-05-14", paid: "Cancelled",
  },
  {
    entityId: "a1b2c3d4-9002", name: "Sunset Beauty (churned)", city: "Reno", state: "NV",
    am: "Priya Nair", ae: "Rahul Sharma", eng: 30, val: 45, prod: 20,
    leads: 1, reviews: 0, photos: 20, profileClicks: 40, websiteClicks: 3,
    bookOnline: null, bookActive: false, keywords: 80, top3: 1, avgRank: 18,
    impressions: 15, toOpened: null, toContacted: null, openedToContacted: null,
    products: [], churned: true, cancelled: "2026-06-02", paid: "Cancelled",
  },
];

function toRow(s: Seed): AccountRow {
  return {
    entityId: s.entityId,
    name: s.name,
    city: s.city,
    state: s.state,
    accountManager: s.am,
    accountExecutive: s.ae,
    isChurned: !!s.churned,
    cancelledDate: s.cancelled ?? null,
    nextBillingDate: s.nextBilling ?? null,
    paidStatus: s.paid ?? null,
    health: buildHealth(s.eng, s.val, s.prod),
    leadsReceived: s.leads,
    reviewsReceived: s.reviews,
    photosUploaded: s.photos,
    profileClicks: s.profileClicks,
    websiteClicks: s.websiteClicks,
    bookOnlineClicks: s.bookOnline,
    bookOnlineActive: s.bookActive,
    keywordsTracked: s.keywords,
    keywordsTop3Pct: s.top3,
    avgCurrentRank: s.avgRank,
    keywordImpressions: s.impressions,
    avgReceivedToOpenedMs: s.toOpened,
    avgReceivedToContactedMs: s.toContacted,
    avgOpenedToContactedMs: s.openedToContacted,
    activeProducts: s.products,
  };
}

export function getMockAccounts(): AccountRow[] {
  return SEEDS.map(toRow);
}
