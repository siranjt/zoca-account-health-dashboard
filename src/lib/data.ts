// ===========================================================================
// Data provider — picks the source (mock vs metabase), resolves the metrics
// window (preset OR custom from/to date range), always excludes churned.
// ===========================================================================

import { getAccountsFromMetabase, getAccountDetailFromMetabase } from "./metabase";
import { getMockAccounts, getMockAccountDetail } from "./mock";
import type { AccountDetail, AccountsPayload, AccountRow } from "./types";

export const ALLOWED_WINDOWS = [7, 30, 90, 180];
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function useMetabase(): boolean {
  return (process.env.DATA_SOURCE ?? "mock").toLowerCase() === "metabase";
}

export function getWindowDays(): number {
  const n = Number(process.env.METRICS_WINDOW_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export interface RangeInput {
  window?: number;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

interface ResolvedRange {
  from: string;
  to: string;
  days: number;
  custom: boolean;
  windowDays: number;
}

function resolveRange(input?: RangeInput): ResolvedRange {
  // Custom from/to range wins when both are valid dates.
  if (input?.from && input?.to && DATE_RE.test(input.from) && DATE_RE.test(input.to) && input.from <= input.to) {
    const fromDate = new Date(`${input.from}T00:00:00.000Z`);
    const toExcl = new Date(`${input.to}T00:00:00.000Z`);
    toExcl.setUTCDate(toExcl.getUTCDate() + 1); // inclusive end date
    const days = Math.max(1, Math.round((toExcl.getTime() - fromDate.getTime()) / DAY));
    return { from: fromDate.toISOString(), to: toExcl.toISOString(), days, custom: true, windowDays: days };
  }
  // Preset "last N days".
  const w = input?.window && ALLOWED_WINDOWS.includes(input.window) ? input.window : getWindowDays();
  const now = new Date();
  return {
    from: new Date(now.getTime() - w * DAY).toISOString(),
    to: now.toISOString(),
    days: w,
    custom: false,
    windowDays: w,
  };
}

export async function getAccountsPayload(input?: RangeInput): Promise<AccountsPayload> {
  const r = resolveRange(input);
  let source: "mock" | "metabase" = "mock";
  let accounts: AccountRow[];

  if (useMetabase()) {
    try {
      accounts = await getAccountsFromMetabase({ from: r.from, to: r.to, days: r.days });
      source = "metabase";
    } catch (err) {
      console.error("[data] Metabase fetch failed, using mock:", err);
      accounts = getMockAccounts();
    }
  } else {
    accounts = getMockAccounts();
  }

  return {
    generatedAt: new Date().toISOString(),
    source,
    windowDays: r.windowDays,
    from: r.from,
    to: r.to,
    custom: r.custom,
    accounts,
  };
}

export async function getAccountDetail(id: string, windowDaysOverride?: number): Promise<AccountDetail> {
  const windowDays = windowDaysOverride && windowDaysOverride > 0 ? windowDaysOverride : getWindowDays();
  if (useMetabase()) {
    try {
      return await getAccountDetailFromMetabase(id, windowDays);
    } catch (err) {
      console.error("[data] account detail fetch failed, using mock:", err);
    }
  }
  return getMockAccountDetail(id);
}
