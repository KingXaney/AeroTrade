// The one read behind "Time in the market" on the buy-and-hold page. A plain server module
// (not 'use server'); the page passes the session's userId and its raw ?from=.
//
// Bounded, and no network: the learner's accounts through the read-only account read (never
// the lazy-create path), and — in the same round trip — the latest stored SPY close and T-bill
// point (one small aggregate, getLatestBars), which stamp the data. SPY's closes and dividends
// and the stored ^IRX points, from a week before the earliest date the window or the start-date
// table reaches (MAX_LOOKBACK_DAYS back at most, plus that week), and the table built on them
// depend on no learner, so they are memoised per (that date, the stamp) for the ET day: a close
// or a rate stored later moves the stamp and is read, and nothing is pinned. The maths is
// lib/strategies/learn/time-in-market.ts. A failed read returns null and the page hides the panel rather
// than showing zeros.

import {createDayMemo, remember} from "@/lib/day-memo";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {RATE_SYMBOL, BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {getBarsForSymbols, getLatestBars, getRatePoints} from "@/lib/prices/store";
import {readAccountsForUser} from "@/lib/trading/account";
import {makeRateLookup, RATE_MAX_STALENESS_DAYS, type RatePoint} from "@/lib/income/accrual";
import {getEasternDateString} from "@/lib/utils";
import {
    buildTimeInMarket,
    resolveStart,
    startDateTable,
    tableStarts,
    TIME_IN_MARKET_AMOUNT,
    type SpyHistory,
    type StartRow,
    type TimeInMarketView,
} from "@/lib/strategies/learn/time-in-market";

export type TimeInMarketRead = TimeInMarketView & {inception: string | null};

// How far back the stamp's lookup reaches; SPY and ^IRX are both stored every night.
const STAMP_LOOKBACK_DAYS = 31;
// A start on a weekend or a holiday opens on the next session. Read from a week before the
// earliest start, so a stored close on or before it is in hand and startDateTable can tell the
// history reaching a start from the history beginning after it (it drops only the latter).
const START_READ_PAD_DAYS = 7;

type History = {spy: SpyHistory; rates: RatePoint[]; table: StartRow[]};

// One entry per start date the window reaches back to — most learners share the table's.
const historyMemo = createDayMemo<History>(16);

const readHistory = async (from: string, today: string, starts: readonly string[]): Promise<History> => {
    const [bars, rates] = await Promise.all([
        getBarsForSymbols([BENCHMARK_SYMBOL], {from, to: today}),
        // The rate in force on `from` may be a point up to the staleness limit before it.
        getRatePoints({from: addCalendarDays(from, -RATE_MAX_STALENESS_DAYS), to: today}),
    ]);
    const spyBars = bars.get(BENCHMARK_SYMBOL) ?? [];
    const spy: SpyHistory = {
        closes: spyBars.map((bar) => ({date: bar.date, value: bar.close})),
        // Only ex-dates inside the window can pay a holder who bought on or after `from`.
        dividends: spyBars.flatMap((bar) => (typeof bar.dividend === 'number' && bar.dividend > 0
            ? [{symbol: BENCHMARK_SYMBOL, exDate: bar.date, perShare: bar.dividend}]
            : [])),
    };
    return {spy, rates, table: startDateTable(spy, makeRateLookup(rates), starts, TIME_IN_MARKET_AMOUNT)};
};

export const getTimeInMarket = async (userId: string, requested: unknown): Promise<TimeInMarketRead | null> => {
    try {
        const today = getEasternDateString();
        const [accounts, latest] = await Promise.all([
            readAccountsForUser(userId),
            getLatestBars([BENCHMARK_SYMBOL, RATE_SYMBOL], {since: addCalendarDays(today, -STAMP_LOOKBACK_DAYS), onOrBefore: today}),
        ]);
        // The current epoch of the oldest account: inceptionAt, else createdAt for accounts from
        // before inceptionAt existed (as the income and trade reads date an epoch).
        const inception = accounts
            .map((account) => getEasternDateString(new Date(account.inceptionAt || account.createdAt)))
            .reduce<string | null>((earliest, date) => (earliest === null || date < earliest ? date : earliest), null);
        const resolved = resolveStart({requested, inception, today});
        const starts = tableStarts(today);
        const from = addCalendarDays([resolved.from, ...starts].reduce((a, b) => (a < b ? a : b)), -START_READ_PAD_DAYS);
        const stamp = [BENCHMARK_SYMBOL, RATE_SYMBOL].map((symbol) => {
            const bar = latest.get(symbol);
            return bar ? `${bar.date}:${bar.close}` : '-';
        }).join('|');
        const history = await remember(historyMemo, `${from}|${stamp}`, today, () => readHistory(from, today, starts));
        const view = buildTimeInMarket({spy: history.spy, rates: history.rates, resolved, amount: TIME_IN_MARKET_AMOUNT, table: history.table});
        return {...view, inception};
    } catch (error) {
        console.error('Time in the market: read failed', error);
        return null;
    }
};
