// The one read behind "Time in the market" on the buy-and-hold page. A plain server module
// (not 'use server'); the page passes the session's userId and its raw ?from=.
//
// Bounded, and no network: the learner's accounts through the read-only account read (never
// the lazy-create path), then one SPY total-return index through getBenchmarkIndex — the same
// builder every "vs SPY" uses, no second one — and the stored ^IRX points, both from the
// earliest date the window or the start-date table reaches (at most MAX_LOOKBACK_DAYS back).
// The maths is lib/learn/time-in-market.ts. A failed read returns null and the page hides
// the panel rather than showing zeros.

import {getBenchmarkIndex} from "@/lib/prices/benchmark-store";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {getRatePoints} from "@/lib/prices/store";
import {readAccountsForUser} from "@/lib/trading/account";
import {RATE_MAX_STALENESS_DAYS} from "@/lib/trading/income";
import {getEasternDateString} from "@/lib/utils";
import {buildTimeInMarket, resolveStart, tableStarts, TIME_IN_MARKET_AMOUNT, type TimeInMarketView} from "@/lib/learn/time-in-market";

export type TimeInMarketRead = TimeInMarketView & {inception: string | null};

export const getTimeInMarket = async (userId: string, requested: unknown): Promise<TimeInMarketRead | null> => {
    try {
        const today = getEasternDateString();
        const accounts = await readAccountsForUser(userId);
        // The current epoch of the oldest account: inceptionAt, else createdAt for accounts from
        // before inceptionAt existed (as the income and trade reads date an epoch).
        const inception = accounts
            .map((account) => getEasternDateString(new Date(account.inceptionAt || account.createdAt)))
            .reduce<string | null>((earliest, date) => (earliest === null || date < earliest ? date : earliest), null);
        const resolved = resolveStart({requested, inception, today});
        const starts = tableStarts(today);
        const from = [resolved.from, ...starts].reduce((a, b) => (a < b ? a : b));
        const [benchmark, rates] = await Promise.all([
            getBenchmarkIndex(from),
            // The rate in force on `from` may be a point up to the staleness limit before it.
            getRatePoints({from: addCalendarDays(from, -RATE_MAX_STALENESS_DAYS), to: today}),
        ]);
        const view = buildTimeInMarket({index: benchmark.points, rates, resolved, amount: TIME_IN_MARKET_AMOUNT, starts});
        return {...view, inception};
    } catch (error) {
        console.error('Time in the market: read failed', error);
        return null;
    }
};
