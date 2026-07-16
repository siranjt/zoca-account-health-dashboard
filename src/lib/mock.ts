// ===========================================================================
// Realistic sample data so the dashboard runs & deploys with NO Metabase access.
// Products use the real agent labels (Discovery / Loyalty / Social / Ads / WIN).
// Churned seeds are excluded here, so the list view never shows them.
// Swap to live data by setting DATA_SOURCE=metabase.
// ===========================================================================

import { buildHealth } from "./health";
import type { AccountDetail, AccountRow } from "./types";

function mkSpark(base: number, seed: string): number[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 12 }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    const f = 0.55 + ((h % 100) / 100) * 0.9;
    return Math.max(0, Math.round(base * f));
  });
}

const HOUR = 3_600_000;
const MIN = 60_000;

interface Seed {
  entityId: string; name: string; city: string; state: string; am: string;
  eng: number | null; val: number | null; prod: number | null;
  mrr: number; leads: number; reviews: number; photos: number;
  profileClicks: number; websiteClicks: number; bookOnline: number | null; bookActive: boolean;
  keywords: number; top3: number | null; avgRank: number | null; impressions: number;
  toOpened: number | null; toContacted: number | null; openedToContacted: number | null;
  products: string[]; churned?: boolean;
}

const SEEDS: Seed[] = [
  { entityId: "71031ed6", name: "Amenity Wax Spot & Spa", city: "Bronx", state: "NY", am: "Tanya Solanki",
    eng: 14.29, val: 85.71, prod: 100, mrr: 150, leads: 16, reviews: 1, photos: 15, profileClicks: 1109, websiteClicks: 37,
    bookOnline: 9, bookActive: true, keywords: 475, top3: 1.26, avgRank: 21.6, impressions: 725,
    toOpened: 40 * HOUR, toContacted: null, openedToContacted: null, products: ["Discovery"] },
  { entityId: "s2", name: "Luxe Nails & Brows", city: "Austin", state: "TX", am: "Priya Nair",
    eng: 82, val: 90, prod: 100, mrr: 320, leads: 41, reviews: 12, photos: 88, profileClicks: 1640, websiteClicks: 58,
    bookOnline: 22, bookActive: true, keywords: 210, top3: 34, avgRank: 6.4, impressions: 1240,
    toOpened: 12 * MIN, toContacted: 40 * MIN, openedToContacted: 28 * MIN, products: ["Discovery", "Loyalty", "Social"] },
  { entityId: "s3", name: "Serenity Med Spa", city: "Denver", state: "CO", am: "Priya Nair",
    eng: 61, val: 72, prod: 80, mrr: 249, leads: 23, reviews: 6, photos: 54, profileClicks: 910, websiteClicks: 31,
    bookOnline: 9, bookActive: true, keywords: 320, top3: 14, avgRank: 11.2, impressions: 760,
    toOpened: 55 * MIN, toContacted: 4 * HOUR, openedToContacted: 3 * HOUR, products: ["Discovery", "Ads"] },
  { entityId: "s4", name: "The Barber Room", city: "Chicago", state: "IL", am: "Aditya Rao",
    eng: 22, val: 40, prod: 60, mrr: 150, leads: 3, reviews: 0, photos: 12, profileClicks: 188, websiteClicks: 4,
    bookOnline: null, bookActive: false, keywords: 90, top3: 1, avgRank: 18.6, impressions: 120,
    toOpened: 6 * HOUR, toContacted: null, openedToContacted: null, products: ["Discovery"] },
  { entityId: "s5", name: "Glow Aesthetics", city: "Miami", state: "FL", am: "Aditya Rao",
    eng: 74, val: 85, prod: 100, mrr: 448, leads: 33, reviews: 9, photos: 120, profileClicks: 1720, websiteClicks: 61,
    bookOnline: 18, bookActive: true, keywords: 260, top3: 28, avgRank: 7.1, impressions: 1520,
    toOpened: 20 * MIN, toContacted: 1 * HOUR, openedToContacted: 40 * MIN, products: ["Discovery", "Ads", "Social", "WIN"] },
  { entityId: "s6", name: "Pure Skin Studio", city: "Seattle", state: "WA", am: "Priya Nair",
    eng: 48, val: 66, prod: 80, mrr: 249, leads: 15, reviews: 3, photos: 47, profileClicks: 690, websiteClicks: 19,
    bookOnline: 6, bookActive: true, keywords: 180, top3: 9, avgRank: 12.8, impressions: 540,
    toOpened: 90 * MIN, toContacted: 6 * HOUR, openedToContacted: 4 * HOUR, products: ["Discovery", "Loyalty"] },
  { entityId: "s7", name: "Bella Hair Lounge", city: "Phoenix", state: "AZ", am: "Aditya Rao",
    eng: 90, val: 94, prod: 100, mrr: 399, leads: 52, reviews: 17, photos: 140, profileClicks: 1910, websiteClicks: 77,
    bookOnline: 31, bookActive: true, keywords: 300, top3: 41, avgRank: 5.2, impressions: 1980,
    toOpened: 8 * MIN, toContacted: 25 * MIN, openedToContacted: 17 * MIN, products: ["Discovery", "Social"] },
  { entityId: "s8", name: "Zen Wellness Bar", city: "Portland", state: "OR", am: "Meera Joshi",
    eng: 35, val: 58, prod: 60, mrr: 150, leads: 8, reviews: 1, photos: 33, profileClicks: 475, websiteClicks: 11,
    bookOnline: 2, bookActive: true, keywords: 140, top3: 4, avgRank: 15.9, impressions: 330,
    toOpened: 3 * HOUR, toContacted: 12 * HOUR, openedToContacted: 9 * HOUR, products: ["Discovery"] },
  { entityId: "s9", name: "Radiance Brow Studio", city: "San Diego", state: "CA", am: "Meera Joshi",
    eng: 67, val: 78, prod: 100, mrr: 299, leads: 27, reviews: 7, photos: 71, profileClicks: 1205, websiteClicks: 38,
    bookOnline: 12, bookActive: true, keywords: 240, top3: 22, avgRank: 8.9, impressions: 980,
    toOpened: 30 * MIN, toContacted: 2 * HOUR, openedToContacted: 90 * MIN, products: ["Discovery", "WIN"] },
  { entityId: "s10", name: "Velvet Lash Bar", city: "Nashville", state: "TN", am: "Aditya Rao",
    eng: 19, val: 33, prod: 40, mrr: 150, leads: 2, reviews: 0, photos: 8, profileClicks: 162, websiteClicks: 2,
    bookOnline: null, bookActive: false, keywords: 70, top3: 0, avgRank: 19.4, impressions: 60,
    toOpened: 10 * HOUR, toContacted: null, openedToContacted: null, products: ["Discovery"] },
  { entityId: "s11", name: "Opal Skincare", city: "Boston", state: "MA", am: "Priya Nair",
    eng: 78, val: 88, prod: 100, mrr: 520, leads: 36, reviews: 11, photos: 96, profileClicks: 1680, websiteClicks: 52,
    bookOnline: 19, bookActive: true, keywords: 280, top3: 31, avgRank: 6.8, impressions: 1410,
    toOpened: 15 * MIN, toContacted: 50 * MIN, openedToContacted: 35 * MIN, products: ["Discovery", "Loyalty", "Ads", "Social"] },
  { entityId: "s12", name: "Coastal Cuts", city: "Charleston", state: "SC", am: "Meera Joshi",
    eng: 54, val: 69, prod: 80, mrr: 249, leads: 18, reviews: 4, photos: 58, profileClicks: 940, websiteClicks: 24,
    bookOnline: 7, bookActive: true, keywords: 200, top3: 12, avgRank: 10.6, impressions: 690,
    toOpened: 70 * MIN, toContacted: 5 * HOUR, openedToContacted: 3 * HOUR, products: ["Discovery", "Ads"] },
  // churned — excluded from the list view
  { entityId: "c1", name: "Old Town Spa (churned)", city: "Dallas", state: "TX", am: "Aditya Rao",
    eng: 12, val: 20, prod: 0, mrr: 0, leads: 0, reviews: 0, photos: 3, profileClicks: 10, websiteClicks: 0,
    bookOnline: null, bookActive: false, keywords: 40, top3: 0, avgRank: 20, impressions: 0,
    toOpened: null, toContacted: null, openedToContacted: null, products: [], churned: true },
];

function toRow(s: Seed): AccountRow {
  return {
    entityId: s.entityId, name: s.name, city: s.city, state: s.state, accountManager: s.am,
    health: buildHealth(s.eng, s.val, s.prod), mrr: s.mrr,
    leadsReceived: s.leads, reviewsReceived: s.reviews, photosUploaded: s.photos,
    profileClicks: s.profileClicks, websiteClicks: s.websiteClicks,
    bookOnlineClicks: s.bookOnline, bookOnlineActive: s.bookActive,
    keywordsTracked: s.keywords, keywordsTop3Pct: s.top3, avgCurrentRank: s.avgRank,
    keywordImpressions: s.impressions,
    avgReceivedToOpenedMs: s.toOpened, avgReceivedToContactedMs: s.toContacted,
    avgOpenedToContactedMs: s.openedToContacted, activeProducts: s.products,
    leadsDelta: { cur: s.leads, prev: Math.round(s.leads * 0.8) },
    reviewsDelta: { cur: s.reviews, prev: Math.max(0, s.reviews - 1) },
    clicksDelta: { cur: s.profileClicks, prev: Math.round(s.profileClicks * 0.9) },
    sparkLeads: mkSpark(s.leads, s.entityId),
    sparkClicks: mkSpark(Math.round(s.profileClicks / 8), s.entityId + "c"),
    daysToInvoice: 30 - (s.leads % 30),
    daysOverdue: s.mrr === 0 ? 12 : null,
    failedPayments: s.leads % 3,
    tenureDays: 60 + s.leads * 5,
  };
}

export function getMockAccounts(): AccountRow[] {
  return SEEDS.filter((s) => !s.churned).map(toRow);
}

export function getMockAccountDetail(id: string): AccountDetail {
  const s = SEEDS.find((x) => x.entityId === id) ?? SEEDS[0];
  const pw = mkSpark(Math.round(s.profileClicks / 4), id);
  const ww = mkSpark(Math.round(s.websiteClicks / 4), id + "w");
  const cw = mkSpark(3, id + "call");
  const dw = mkSpark(15, id + "dir");
  const lw = mkSpark(Math.round(s.leads / 4), id + "lead");
  const profileWeekly = pw.map((v, i) => {
    const d = new Date(2026, 3, 5 + i * 7).toISOString().slice(0, 10);
    return {
      wk: d,
      profileClicks: v,
      websiteClicks: ww[i],
      callClicks: cw[i],
      directions: dw[i],
      leads: lw[i],
      totalInteractions: ww[i] + cw[i] + dw[i],
    };
  });
  const lr = mkSpark(Math.round(s.leads / 2), id + "m").map((v, i) => ({
    mon: `2026-${String(i + 1).padStart(2, "0")}`,
    leads: v,
    reviews: mkSpark(Math.max(1, Math.round(s.reviews / 3)), id + "rev")[i],
  }));
  const rankTrend = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(2026, 4, 1 + i * 14).toISOString().slice(0, 10);
    return {
      d,
      top3: s.top3,
      avgRank: (s.avgRank ?? 15) + Math.sin(i) * 1.5,
    };
  });
  return {
    entityId: id,
    profileWeekly,
    leadsReviews: lr,
    rankTrend,
    funnel: {
      enquiries: s.leads,
      opened: Math.round(s.leads * 0.4),
      contacted: Math.round(s.leads * 0.25),
      booked: Math.round(s.leads * 0.15),
    },
  };
}
