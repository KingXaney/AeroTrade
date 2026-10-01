// The one read behind "Luck or skill" on /portfolio. A plain server module (not 'use server');
// the page passes the account it already resolved, the holdings it already priced and whether
// the account holds any fill the learner placed (from the ledger it already read).
//
// Bounded, and no network. An account younger than ten sessions reads nothing. Otherwise: the
// latest stored close of each of the 40 large caps, SPY and the T-bill series inside the last
// month (one aggregate, getLatestBars), which fixes the window's end on the last session the
// whole pool has (completeSession); the account's last snapshot on or before it (one point
// read, skipped when the account has no fill of the learner's); then the two edge closes of
// the pool and SPY, the dividend rows between them (getHoldWindowBars — never the bars in
// between) and the T-bill points of the window. Those inputs depend only on the window and the
// stored data, so they are memoised per (start, end, the T-bill series' latest point) for the
// ET day: the end moves as soon as the morning's closes land, so a read taken before them is
// never pinned. The maths is lib/trading/learn/random-portfolios.ts. A failed read returns null and the
// page hides the panel rather than showing zeros.

import {BENCHMARK_SYMBOL} from "@/lib/constants";
import {createDayMemo, remember} from "@/lib/day-memo";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {RATE_SYMBOL} from "@/lib/prices/config";
import {getHoldWindowBars, getLatestBars, getRatePoints} from "@/lib/prices/store";
import {getLastSnapshotBetween} from "@/lib/trading/account";
import {RATE_MAX_STALENESS_DAYS} from "@/lib/income/accrual";
import {LARGE_CAPS} from "@/lib/strategies/universe";
import {getEasternDateString} from "@/lib/utils";
import {
    buildLuckView,
    completeSession,
    holdWindow,
    LUCK_MIN_SESSIONS,
    luckWindow,
    seedFrom,
    sessionOnOrBefore,
    sessionsBetween,
    type HoldWindow,
    type LuckView,
} from "@/lib/trading/learn/random-portfolios";

export type LuckRead = LuckView & {unpriced: number; holdings: number};

// How far back the latest-close lookup reaches. SPY is stored every night, so a SPY close older
// than this means the prices are what is missing.
const LATEST_LOOKBACK_DAYS = 31;

// A handful of windows a day: every account opened on the same date shares one entry.
const holdMemo = createDayMemo<HoldWindow>(64);

const readHoldWindow = async (start: string, end: string): Promise<HoldWindow> => {
    const [{bars, dividends}, rates] = await Promise.all([
        getHoldWindowBars([...LARGE_CAPS, BENCHMARK_SYMBOL], start, end),
        // The rate in force on `start` may be a point up to the staleness limit before it.
        getRatePoints({from: addCalendarDays(start, -RATE_MAX_STALENESS_DAYS), to: end}),
    ]);
    return holdWindow({bars, dividends, rates, from: start, to: end});
};

export const getLuckOrSkill = async ({accountId, inceptionAt, startingBalance, unpriced, holdings, ownFills}: {
    accountId: string;
    inceptionAt: number;
    startingBalance: number;
    unpriced: number;
    holdings: number;
    // Whether any fill in the account's current record was placed by the learner (source 'user').
    ownFills: boolean;
}): Promise<LuckRead | null> => {
    try {
        const today = getEasternDateString();
        const inceptionDate = getEasternDateString(new Date(inceptionAt));
        // A young account needs no read at all: it cannot have ten sessions behind it yet.
        const soFar = sessionsBetween(sessionOnOrBefore(inceptionDate), today);
        if (soFar < LUCK_MIN_SESSIONS) return {status: 'needs-days', sessions: soFar, unpriced, holdings};
        const latest = await getLatestBars([...LARGE_CAPS, BENCHMARK_SYMBOL, RATE_SYMBOL], {
            since: addCalendarDays(today, -LATEST_LOOKBACK_DAYS),
            onOrBefore: today,
        });
        const lastSession = completeSession({
            latest: new Map([...latest].map(([symbol, bar]) => [symbol, bar.date])),
            universe: LARGE_CAPS,
            benchmark: BENCHMARK_SYMBOL,
        });
        const lastSnapshot = ownFills && lastSession && lastSession >= inceptionDate
            ? await getLastSnapshotBetween(accountId, inceptionDate, lastSession)
            : null;
        const window = luckWindow({inceptionDate, lastSession, lastSnapshot, unpriced, ownFills});
        // Old enough, but no session since inception that SPY and the pool both have: the
        // prices are what is missing.
        if (!window) return {status: 'no-prices', sessions: soFar, unpriced, holdings};
        if (window.sessions < LUCK_MIN_SESSIONS) return {status: 'needs-days', sessions: window.sessions, unpriced, holdings};
        const rate = latest.get(RATE_SYMBOL);
        const key = `${window.start}|${window.end}|${rate ? `${rate.date}:${rate.close}` : '-'}`;
        const hold = await remember(holdMemo, key, today, () => readHoldWindow(window.start, window.end));
        const view = buildLuckView({window, hold, universe: LARGE_CAPS, seed: seedFrom(accountId, window.end), amount: startingBalance});
        return {...view, unpriced, holdings};
    } catch (error) {
        console.error('Luck or skill: read failed', error);
        return null;
    }
};
