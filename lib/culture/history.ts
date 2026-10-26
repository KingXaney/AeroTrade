// The daily run's Wikipedia plan (pure). A brand's attention surprise reads its last four weeks
// against the six months before them, so it needs half a year of stored views — which the daily
// lookback alone never builds. A brand whose stored series starts too late (or has none: a new
// catalog entry, a fresh database) is asked once for the whole backfill window instead of the
// lookback; listed owners first, since only they can be picked. The request count is the same
// either way: one per title.

import {
    ATTENTION_BASELINE_DAYS,
    ATTENTION_RECENT_DAYS,
    CULTURE_BACKFILL_YEARS,
    WIKI_DATA_START,
    WIKIPEDIA_DAILY_LOOKBACK_DAYS,
} from "@/lib/culture/config";
import {addCalendarDays} from "@/lib/dates";
import type {CultureBrand} from "@/lib/culture/types";

type Window = {from: string; to: string};

// The first day the live baseline reads: six months before the last four weeks.
const baselineFrom = (asOf: string): string => addCalendarDays(asOf, -(ATTENTION_RECENT_DAYS - 1) - ATTENTION_BASELINE_DAYS);

// Whether a brand's stored Wikipedia series (its first stored month, 'YYYY-MM') lacks the
// baseline window.
export const needsHistory = (firstMonth: string | undefined, asOf: string): boolean =>
    firstMonth === undefined || firstMonth > baselineFrom(asOf).slice(0, 7);

// The lookback: a late or failed day heals on the next run.
export const recentWindow = (today: string, asOf: string): Window =>
    ({from: addCalendarDays(today, -WIKIPEDIA_DAILY_LOOKBACK_DAYS), to: asOf});

// The backfill horizon: the backtest's five result years and its warm-up, never before the
// API's first day — the window the manual backfill asks for.
export const historyWindow = (today: string, asOf: string): Window => {
    const horizon = addCalendarDays(today, -Math.round(CULTURE_BACKFILL_YEARS * 365));
    return {from: horizon < WIKI_DATA_START ? WIKI_DATA_START : horizon, to: asOf};
};

export type WikipediaPlan = {history: string[]; recent: string[]};

export const planWikipediaFetch = (
    brands: readonly CultureBrand[],
    firstMonth: ReadonlyMap<string, string>,
    asOf: string,
): WikipediaPlan => {
    const lacking = brands.filter((brand) => needsHistory(firstMonth.get(brand.id), asOf));
    const lackingIds = new Set(lacking.map((brand) => brand.id));
    return {
        history: [...lacking.filter((brand) => brand.owner !== null), ...lacking.filter((brand) => brand.owner === null)].map((brand) => brand.id),
        recent: brands.filter((brand) => !lackingIds.has(brand.id)).map((brand) => brand.id),
    };
};
