// The one read behind "Luck or skill" on /portfolio. A plain server module (not 'use server');
// the page passes the account it already resolved and the holdings it already priced.
//
// Bounded, and no network. An account younger than ten sessions reads nothing. Otherwise: the
// latest stored SPY session (one point read), the account's last snapshot on or before it (one
// point read), then the two edge closes of the 40 large caps and SPY plus the dividend rows
// between them (getHoldWindowBars — never the bars in between). Those
// edge inputs depend only on the window, so they are memoised per (start, end) for the ET day.
// The maths is lib/learn/random-portfolios.ts. A failed read returns null and the page hides
// the panel rather than showing zeros.

import {BENCHMARK_SYMBOL} from "@/lib/constants";
import {getHoldWindowBars, getLatestBarDate} from "@/lib/prices/store";
import {getLastSnapshotBetween} from "@/lib/trading/account";
import {LARGE_CAPS} from "@/lib/strategies/universe";
import {getEasternDateString} from "@/lib/utils";
import {
    buildLuckView,
    createDayMemo,
    holdInputs,
    LUCK_MIN_SESSIONS,
    luckWindow,
    seedFrom,
    sessionOnOrBefore,
    sessionsBetween,
    type HoldInput,
    type LuckView,
} from "@/lib/learn/random-portfolios";

export type LuckRead = LuckView & {unpriced: number; holdings: number};

// A handful of windows a day: every account opened on the same date shares one entry.
const inputsMemo = createDayMemo<Map<string, HoldInput>>(64);

const holdInputsFor = async (start: string, end: string, today: string): Promise<Map<string, HoldInput>> => {
    const key = `${start}|${end}`;
    const cached = inputsMemo.get(key, today);
    if (cached) return cached;
    const {bars, dividends} = await getHoldWindowBars([...LARGE_CAPS, BENCHMARK_SYMBOL], start, end);
    const inputs = holdInputs(bars, dividends, start, end);
    inputsMemo.set(key, today, inputs);
    return inputs;
};

export const getLuckOrSkill = async ({accountId, inceptionAt, startingBalance, unpriced, holdings}: {
    accountId: string;
    inceptionAt: number;
    startingBalance: number;
    unpriced: number;
    holdings: number;
}): Promise<LuckRead | null> => {
    try {
        const today = getEasternDateString();
        const inceptionDate = getEasternDateString(new Date(inceptionAt));
        // A young account needs no read at all: it cannot have ten sessions behind it yet.
        const soFar = sessionsBetween(sessionOnOrBefore(inceptionDate), today);
        if (soFar < LUCK_MIN_SESSIONS) return {status: 'needs-days', sessions: soFar, unpriced, holdings};
        const lastSession = await getLatestBarDate(BENCHMARK_SYMBOL, today);
        const lastSnapshot = lastSession && lastSession >= inceptionDate
            ? await getLastSnapshotBetween(accountId, inceptionDate, lastSession)
            : null;
        const window = luckWindow({inceptionDate, lastSession, lastSnapshot, unpriced});
        // Old enough, but no SPY bar stored since inception: the prices are what is missing.
        if (!window) return {status: 'no-prices', sessions: soFar, unpriced, holdings};
        if (window.sessions < LUCK_MIN_SESSIONS) return {status: 'needs-days', sessions: window.sessions, unpriced, holdings};
        const inputs = await holdInputsFor(window.start, window.end, today);
        const view = buildLuckView({window, inputs, universe: LARGE_CAPS, seed: seedFrom(accountId, window.end), amount: startingBalance});
        return {...view, unpriced, holdings};
    } catch (error) {
        console.error('Luck or skill: read failed', error);
        return null;
    }
};
