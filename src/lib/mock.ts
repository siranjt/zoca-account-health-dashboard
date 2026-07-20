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

// approx [lat, lng] for the mock cities so the local map view has points
const MOCK_COORDS: Record<string, [number, number]> = {
  Bronx: [40.85, -73.87], Austin: [30.27, -97.74], Denver: [39.74, -104.99], Chicago: [41.88, -87.63],
  Miami: [25.76, -80.19], Seattle: [47.61, -122.33], Phoenix: [33.45, -112.07], Portland: [45.52, -122.68],
  "San Diego": [32.72, -117.16], Boston: [42.36, -71.06], Charleston: [32.78, -79.93], Dallas: [32.78, -96.8],
  Nashville: [36.16, -86.78],
};

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
    entityId: s.entityId, name: s.name, city: s.city, state: s.state,
    lat: MOCK_COORDS[s.city]?.[0] ?? null, lng: MOCK_COORDS[s.city]?.[1] ?? null,
    accountManager: s.am,
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
    openTickets: s.leads % 4,
    closedTicketsWindow: s.leads % 7,
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
  // Mock payment history — a few monthly invoices with varying punctuality.
  const amt = s.mrr || 199;
  const latePattern = [0, 2, 0, -1, 5, 12, 0, 3]; // days late per invoice (neg = early)
  const invoices = Array.from({ length: 8 }, (_, i) => {
    const inv = new Date(2025, 10 + i, 5);
    const due = new Date(inv); due.setDate(due.getDate() + 7);
    const isLast = i === 7;
    const late = latePattern[i];
    const unpaid = isLast && s.mrr === 0;
    const paidAt = unpaid ? null : new Date(due.getTime() + late * 86400000);
    return {
      date: inv.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      paid_at: paidAt ? paidAt.toISOString().slice(0, 10) : null,
      total_usd: amt, amount_paid_usd: unpaid ? 0 : amt, amount_due_usd: unpaid ? amt : 0,
      status: unpaid ? "payment_due" : "paid", paid: !unpaid,
      days_late: unpaid ? 12 : late,
    };
  });
  const paidInv = invoices.filter((i) => i.paid);
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
    payments: {
      found: true,
      auto_collection: s.leads % 3 === 0 ? "off" : "on",
      net_term_days: 0,
      total_mrr_usd: amt,
      active_subscription_count: s.mrr === 0 ? 0 : 1,
      total_paid_usd: paidInv.reduce((x, i) => x + i.amount_paid_usd, 0),
      unpaid_total_usd: invoices.filter((i) => !i.paid).reduce((x, i) => x + i.amount_due_usd, 0),
      failed_txn_count: s.leads % 4,
      on_time_rate: paidInv.length ? Math.round((paidInv.filter((i) => (i.days_late ?? 0) <= 0).length / paidInv.length) * 100) : null,
      avg_days_late: paidInv.length ? Math.round((paidInv.reduce((x, i) => x + (i.days_late ?? 0), 0) / paidInv.length) * 10) / 10 : null,
      invoices,
    },
    appUsage: mkSpark(20, id + "au").map((v, i) => ({ wk: new Date(2026, 3, 5 + i * 7).toISOString().slice(0, 10), appOpen: v, leads: Math.round(v * 0.5), reviews: Math.round(v * 0.2), photos: Math.round(v * 0.15) })),
    bookings: mkSpark(Math.max(2, Math.round(s.leads / 4)), id + "bk").map((v, i) => ({ label: new Date(2026, 3, 5 + i * 7).toISOString().slice(0, 10), leads: v, bookings: Math.round(v * 0.35) })),
    keywordRankings: [
      { keyword: "best salon near me", avgRank: Math.max(1, 20 - Math.round((s.top3 ?? 0) / 5)), minRank: 1, searchVolume: 480 },
      { keyword: `${s.name.split(" ")[0].toLowerCase()} services`, avgRank: 3, minRank: 1, searchVolume: 210 },
      { keyword: "walk in appointments", avgRank: 8, minRank: 4, searchVolume: 90 },
      { keyword: "spa deals", avgRank: 14, minRank: 9, searchVolume: 60 },
    ],
    impressions: mkSpark(Math.max(50, s.profileClicks), id + "im").map((v, i) => ({ ym: `2026-${String(i + 1).padStart(2, "0")}`, impressions: v * 20 })),
    reviewsDist: s.reviews ? { total: s.reviews + 40, avg: 4.7, last30: Math.round(s.reviews / 3), last90: s.reviews, dist: { "5": s.reviews + 30, "4": 6, "3": 2, "2": 1, "1": 1 } } : null,
    comms: mkSpark(Math.max(3, Math.round(s.leads / 6)), id + "cm").map((v, i) => ({ wk: new Date(2026, 4, 1 + i * 7).toISOString().slice(0, 10), sms: v, call: Math.round(v * 0.4) })),
    mediaCadence: (() => { let live = 3; return mkSpark(2, id + "md").map((v, i) => { live += v; return { wk: new Date(2026, 4, 1 + i * 7).toISOString().slice(0, 10), live }; }); })(),
    forecast: { predicted: Math.max(20, s.leads * 2), actual: s.leads * 6 },
    reviewsList: (() => {
      const authors = ["Melinda G", "Zipporah S", "Fareeha K", "J. Rivera", "Dana P", "Chris M", "Aisha N", "Tom B"];
      const texts = [
        "Great experience as always! The team is fantastic and always on time.",
        "First time getting a treatment here — such a relaxing experience, highly recommend.",
        "The best as always, I've been coming here for years and never disappointed.",
        "Booking was easy and the staff were super friendly. Will be back!",
        "Good service but the wait was a little long this visit.",
        "Absolutely love this place, clean and professional.",
      ];
      const plats = ["Google", "Fresha", "Google", "Yelp"];
      const n = Math.min(8, Math.max(3, Math.round((s.reviews || 3) / 4)));
      return Array.from({ length: n }, (_, i) => ({
        reviewer: authors[i % authors.length],
        rating: i % 7 === 0 ? 4 : 5,
        platform: plats[i % plats.length],
        text: texts[i % texts.length],
        date: new Date(2026, 6, 15 - i * 3).toISOString().slice(0, 10),
      }));
    })(),
    leadsList: (() => {
      const svcs = ["Full Body Massage", "Box Braids", "Lash Extensions", "Haircut & Style", null, "Facial"];
      const srcs = ["WEBSITE", "ZOCA_EMBED", "WEBSITE", "GBP"];
      const stats = ["UNMARKED", "BOOKED", "CONTACTED", "UNMARKED"];
      const n = Math.min(12, Math.max(4, s.leads));
      return Array.from({ length: n }, (_, i) => ({
        date: new Date(2026, 6, 17 - i).toISOString().slice(0, 10),
        source: srcs[i % srcs.length],
        service: svcs[i % svcs.length],
        status: stats[i % stats.length],
        price: i % 3 === 0 ? 249 : null,
        currency: i % 3 === 0 ? "USD" : null,
        utm: i % 4 === 0 ? "instagram" : null,
      }));
    })(),
    posts: (() => {
      const summaries = ["Book your summer glow-up now! ✨", "New lash styles just dropped", "20% off first visit this week", "Meet our newest stylist", "Holiday hours update"];
      const topics = ["STANDARD", "OFFER", "EVENT", "STANDARD", "STANDARD"];
      const n = Math.min(5, Math.max(2, Math.round((s.leads || 2) / 6)));
      return Array.from({ length: n }, (_, i) => ({
        date: new Date(2026, 6, 14 - i * 6).toISOString().slice(0, 10),
        summary: summaries[i % summaries.length],
        event: null,
        offer: i % 3 === 0 ? "20% off" : null,
        cta: i % 2 === 0 ? "BOOK" : "LEARN_MORE",
        topic: topics[i % topics.length],
        state: "LIVE",
      }));
    })(),
    postsWeekly: (() => { let c = 0; return mkSpark(1, id + "pw").map((v, i) => { c += v; return { wk: new Date(2026, 4, 1 + i * 7).toISOString().slice(0, 10), posts: v, cumsum: c }; }); })(),
    services: [
      { name: "Full Set Lashes", description: "Classic full-set lash extensions", duration: 120, price: 150, category: "Lashes" },
      { name: "Lash Fill", description: "2-3 week refill", duration: 60, price: 75, category: "Lashes" },
      { name: "Brow Lamination", description: "Brow shaping + lamination", duration: 45, price: 65, category: "Brows" },
      { name: "Full Body Massage", description: "60-min relaxation massage", duration: 60, price: 90, category: "Massage" },
    ].slice(0, Math.max(2, (s.leads % 4) + 1)),
    requests: (() => {
      const types = ["WEBSITE_EDIT", "GBP_SUPPORT", "SUBSCRIPTION_SUPPORT", "REVIEWS_SUPPORT"];
      const stats = ["OPEN", "IN_PROGRESS", "RESOLVED"];
      const pris = ["HIGH", "MEDIUM", "LOW"];
      const n = s.leads % 4;
      return Array.from({ length: n }, (_, i) => ({
        date: new Date(2026, 6, 16 - i * 2).toISOString().slice(0, 10),
        status: stats[i % stats.length],
        priority: pris[i % pris.length],
        requestType: types[i % types.length],
        details: "Customer requested an update to their profile / listing.",
      }));
    })(),
    csat: (() => {
      const n = s.reviews % 3;
      return Array.from({ length: n }, (_, i) => ({
        date: new Date(2026, 6, 12 - i * 5).toISOString().slice(0, 10),
        platform: "app",
        formType: "Post-onboarding CSAT",
        question: "How satisfied are you with Zoca so far?",
        answer: i % 2 === 0 ? "Very satisfied" : "Satisfied",
      }));
    })(),
    onboarding: {
      state: "COMPLETED",
      createdAt: "2026-01-15",
      bookingLinkAdded: true,
      leadPredictionViewed: s.leads % 2 === 0,
      winOnboardedDate: "2026-01-22",
    },
    schedulingStatus: {
      schedulingProduct: s.leads % 3 === 0 ? "Active" : "Not Active",
      websiteFlipped: s.leads % 2 === 0 ? "Yes" : "No",
      callCtaEnabled: "Yes",
    },
    totalBookings: s.leads * 2,
    bookingsByStatus: [
      { status: "COMPLETED", count: s.leads },
      { status: "CANCELLED", count: Math.round(s.leads / 4) },
      { status: "NO_SHOW", count: Math.round(s.leads / 8) },
    ].filter((b) => b.count > 0),
    bookingsByCreator: [
      { creatorType: "CUSTOMER", count: Math.round(s.leads * 1.2) },
      { creatorType: "STAFF", count: Math.round(s.leads * 0.6) },
      { creatorType: "AI_AGENT", count: Math.round(s.leads * 0.2) },
    ].filter((b) => b.count > 0),
    wowTasks: mkSpark(Math.max(2, Math.round(s.leads / 5)), id + "wow").map((v, i) => {
      const total = v + 1;
      const completed = Math.round(total * 0.7);
      const cancelled = Math.round(total * 0.1);
      const pending = total - completed - cancelled;
      return {
        wk: new Date(2026, 4, 1 + i * 7).toISOString().slice(0, 10),
        total,
        completed,
        cancelled,
        pending,
        resolutionPct: Math.round(((total - pending) / total) * 1000) / 10,
      };
    }),
    callbackActions: [
      { action: "RESCHEDULE", count: Math.max(1, s.leads % 5) },
      { action: "CONFIRM", count: Math.max(1, s.leads % 4) },
      { action: "CANCEL", count: Math.max(1, s.leads % 3) },
    ],
    paymentLinks: {
      missedPayment: `https://public.zoca.com/chargebee/missed/payment/${id}`,
      paymentMethodUpdate: `https://public.zoca.com/chargebee/update/payment/method/${id}`,
    },
  };
}
