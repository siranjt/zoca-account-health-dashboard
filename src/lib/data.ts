// ===========================================================================
// Data provider — picks the source (mock vs metabase), always excludes churned.
// ===========================================================================

import { getAccountsFromMetabase } from "./metabase";
import { getMockAccounts } from "./mock";
import type { AccountsPayload, AccountRow } from "./types";

export const ALLOWED_WINDOWS = [7, 30, 90, 180];

export function getWindowDays(): number {
  const n = Number(process.env.METRICS_WINDOW_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** windowDaysOverride wins when it's one of the allowed values (from the UI toggle). */
export async function getAccountsPayload(windowDaysOverride?: number): Promise<AccountsPayload> {
  const windowDays =
    windowDaysOverride && ALLOWED_WINDOWS.includes(windowDaysOverride)
      ? windowDaysOverride
      : getWindowDays();
  const useMetabase = (process.env.DATA_SOURCE ?? "mock").toLowerCase() === "metabase";

  let source: "mock" | "metabase" = "mock";
  let accounts: AccountRow[];

  if (useMetabase) {
    try {
      accounts = await getAccountsFromMetabase(windowDays);
      source = "metabase";
    } catch (err) {
      // Fail safe: never crash the page — fall back to mock and log the reason.
      console.error("[data] Metabase fetch failed, using mock:", err);
      accounts = getMockAccounts();
    }
  } else {
    accounts = getMockAccounts();
  }

  // Churned accounts are already excluded at the source:
  //  - metabase: cx.health_score only contains active accounts
  //  - mock: getMockAccounts() returns active-only seeds

  return {
    generatedAt: new Date().toISOString(),
    source,
    windowDays,
    accounts,
  };
}
