// Luck or skill: where the learner's return lands among random portfolios held over the same
// days. Pure — the server read (lib/trading/learn/luck-store.ts) hands in the two edge closes per symbol,
// the dividend rows between them, the T-bill points and the account's last snapshot.
//
// The comparison is built to be fair and reproducible:
//   - the sample is seeded (account + window end), so a reload shows the same thousand;
//   - each portfolio is five names drawn from the strategies' large-cap universe, bought in
//     equal dollar amounts at the close of the window's first session, in whole shares (the
//     remainder stays as cash), and held to the close of its last;
//   - it earns what a paper account holding it would (invariant 11), on the one clock in
//     lib/income/accrual.ts: a dividend is owed to the shares held the evening before its
//     ex-date and paid DIVIDEND_PAY_LAG_DAYS later, and cash — the remainder, then each paid
//     dividend — earns the T-bill rate. Like the learner's snapshot, the value on the last day
//     holds the income rows dated before it (replayIncome's cash), so a dividend whose pay date
//     is not yet behind the last day is not counted, for the portfolios and SPY alike;
//   - the learner's return is a stored snapshot's, never a live value built on a missing
//     quote, and the portfolios end on that snapshot's date (luckWindow).
// The universe was chosen in 2026, so the sample carries survivorship bias; the panel's
// definitions (the survivorship-bias entry) say so.

import {isTradingDay, previousTradingDay} from "@/lib/prices/market-hours";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {fnv1a} from "@/lib/learn/quiz";
import {
    createIncomeClock,
    dividendsByExDate,
    makeRateLookup,
    replayIncome,
    usableRate,
    type DividendPoint,
    type RatePoint,
} from "@/lib/income/accrual";

export const LUCK_SAMPLE_COUNT = 1000;
export const LUCK_PORTFOLIO_SIZE = 5;
// Fewer sessions than this and the spread of a thousand portfolios is mostly one day's noise.
export const LUCK_MIN_SESSIONS = 10;
// At least half the forty large caps must have both edge closes stored, or the "random"
// portfolios would be drawn from a handful of names.
export const LUCK_MIN_POOL = 20;
export const LUCK_HISTOGRAM_BINS = 24;
// A large cap whose latest stored close is more than this many days behind SPY's is not being
// served (the price provider has failed it all week): it leaves the pool rather than holding
// every window back.
export const LUCK_STALE_DAYS = 7;

// ---- seeded randomness ----------------------------------------------------------------------

// A small, well-mixed 32-bit generator: the same seed always yields the same stream in [0, 1).
export const mulberry32 = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const seedFrom = (accountId: string, date: string): number => fnv1a(`${accountId}|${date}`);

// `count` portfolios of `size` distinct names each (a partial Fisher–Yates per portfolio). The
// pool is sorted first, so the draw depends on the seed and the names, never on read order.
export const samplePortfolios = (
    pool: readonly string[],
    {count, size, random}: {count: number; size: number; random: () => number},
): string[][] => {
    const names = [...new Set(pool)].sort();
    if (names.length < size || size <= 0) return [];
    const out: string[][] = [];
    for (let n = 0; n < count; n += 1) {
        const deck = [...names];
        for (let i = 0; i < size; i += 1) {
            const j = i + Math.floor(random() * (deck.length - i));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        out.push(deck.slice(0, size));
    }
    return out;
};

// ---- holding over the window ----------------------------------------------------------------

export type EdgeBar = {symbol: string; date: string; close: number};
// incomePerShare: the cash one share bought at the window's first close has brought in by its
// last day — its dividends, paid on their pay dates, and the interest they have earned since.
export type HoldInput = {symbol: string; startClose: number; endClose: number; incomePerShare: number};
// cashGrowth: what one dollar of cash left at the first close is worth on the last day.
export type HoldWindow = {inputs: Map<string, HoldInput>; cashGrowth: number};

// Everything the clock does is linear in cash and shares — interest is cash × a daily factor,
// a dividend is shares × its amount — so one walk per symbol (one share, no cash) and one for
// a dollar of cash give every portfolio's income exactly: remainder × cashGrowth plus shares ×
// incomePerShare, the same number a replay of that portfolio gives (the test holds them equal).
// A day with no usable rate (the income job's own staleness rule) earns nothing, as the
// learner's account is not credited for it either until a rate arrives.
const incomeWalk = (from: string, to: string, rates: readonly RatePoint[], dividends: readonly DividendPoint[]) => {
    const lookup = makeRateLookup(rates);
    const clock = () => createIncomeClock({rateOn: (date) => usableRate(lookup(date), date), dividends: dividendsByExDate(dividends)});
    return {
        cashGrowth: replayIncome({from, to, startCash: 1, startHoldings: new Map(), trades: [], clock: clock()}).cash,
        // Bought at `from`'s close (a zero-cost buy, so no cash moves): not holding the evening
        // before an ex-date of `from` itself, holding for every later one.
        perShare: (symbol: string): number => replayIncome({
            from, to, startCash: 0, startHoldings: new Map(), clock: clock(),
            trades: [{date: from, symbol, side: 'buy', quantity: 1, total: 0}],
        }).cash,
    };
};

// Symbol → its close on `from` and on `to` (both required, both positive) and what one share
// held between them earned. A symbol missing either close is left out.
export const holdWindow = ({bars, dividends, rates, from, to}: {
    bars: readonly EdgeBar[];
    dividends: readonly DividendPoint[];
    rates: readonly RatePoint[];
    from: string;
    to: string;
}): HoldWindow => {
    const starts = new Map<string, number>();
    const ends = new Map<string, number>();
    for (const bar of bars) {
        if (!(bar.close > 0)) continue;
        if (bar.date === from) starts.set(bar.symbol, bar.close);
        if (bar.date === to) ends.set(bar.symbol, bar.close);
    }
    const walk = incomeWalk(from, to, rates, dividends);
    const inputs = new Map<string, HoldInput>();
    for (const symbol of [...starts.keys()].sort()) {
        const startClose = starts.get(symbol);
        const endClose = ends.get(symbol);
        if (startClose === undefined || endClose === undefined) continue;
        inputs.set(symbol, {symbol, startClose, endClose, incomePerShare: walk.perShare(symbol)});
    }
    return {inputs, cashGrowth: walk.cashGrowth};
};

// cash: the remainder the whole-share rule left at the first close.
export type HoldResult = {endValue: number; cash: number; returnPct: number};

// Equal dollar slices, whole shares, the remainder as cash; each share brings its income, the
// remainder grows by the window's cash factor. Null when a name has no prices (the caller
// draws only from names that do).
export const holdReturn = (symbols: readonly string[], hold: HoldWindow, amount: number): HoldResult | null => {
    if (symbols.length === 0 || !(amount > 0)) return null;
    const slice = amount / symbols.length;
    let spent = 0;
    let endHoldings = 0;
    for (const symbol of symbols) {
        const input = hold.inputs.get(symbol);
        if (!input) return null;
        // The epsilon keeps an exact fit (20,000 / 100) from flooring to 199 on a float wobble.
        const shares = Math.floor(slice / input.startClose + 1e-9);
        spent += shares * input.startClose;
        endHoldings += shares * (input.endClose + input.incomePerShare);
    }
    const cash = amount - spent;
    const endValue = cash * hold.cashGrowth + endHoldings;
    return {endValue, cash, returnPct: (endValue / amount - 1) * 100};
};

// ---- where a value lands --------------------------------------------------------------------

// How many of the (ascending) values sit strictly below `value`, and that share as a whole
// percentage rounded DOWN — "landed above 62%" is never an overstatement.
export const percentileRank = (sortedAsc: readonly number[], value: number): {below: number; pct: number} => {
    let lo = 0;
    let hi = sortedAsc.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedAsc[mid] < value) lo = mid + 1;
        else hi = mid;
    }
    return {below: lo, pct: sortedAsc.length > 0 ? Math.floor((lo / sortedAsc.length) * 100) : 0};
};

export const medianOf = (sortedAsc: readonly number[]): number | null => {
    const n = sortedAsc.length;
    if (n === 0) return null;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
};

export type Histogram = {min: number; max: number; binWidth: number; counts: number[]};

// Equal-width bins over the values; the span also covers `include` (the markers), so a marker
// outside the sample still sits on the axis. A span of zero is widened by half a point each way.
export const histogram = (values: readonly number[], bins = LUCK_HISTOGRAM_BINS, include: readonly number[] = []): Histogram => {
    const all = [...values, ...include].filter(Number.isFinite);
    let min = all.length > 0 ? Math.min(...all) : 0;
    let max = all.length > 0 ? Math.max(...all) : 0;
    if (max - min < 1e-9) {
        min -= 0.5;
        max += 0.5;
    }
    const binWidth = (max - min) / bins;
    const counts = new Array<number>(bins).fill(0);
    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        counts[Math.min(bins - 1, Math.max(0, Math.floor((value - min) / binWidth)))] += 1;
    }
    return {min, max, binWidth, counts};
};

// ---- the window -----------------------------------------------------------------------------

export const sessionOnOrBefore = (date: string): string => (isTradingDay(date) ? date : previousTradingDay(date));

// NYSE sessions after `from` and through `to`: the days a portfolio bought at the `from` close
// is exposed to.
export const sessionsBetween = (from: string, to: string): number => {
    let count = 0;
    for (let day = addCalendarDays(from, 1); day <= to; day = addCalendarDays(day, 1)) {
        if (isTradingDay(day)) count += 1;
    }
    return count;
};

// The last session SPY and every large cap still being served have a stored close for: the
// window's end. SPY (and every held name) is topped up at 00:05 ET each night by the income job,
// the rest of the large caps only by the 09:35 weekday strategies job, in chunks — so SPY's own
// latest bar would end the window on a day most of the pool has no close for yet, and the sample
// would be drawn from whichever names happened to be stored. Null without SPY, or with fewer
// than LUCK_MIN_POOL names being served.
export const completeSession = ({latest, universe, benchmark}: {
    latest: ReadonlyMap<string, string>;
    universe: readonly string[];
    benchmark: string;
}): string | null => {
    const spy = latest.get(benchmark);
    if (spy === undefined) return null;
    const floor = addCalendarDays(spy, -LUCK_STALE_DAYS);
    const served = universe.flatMap((symbol) => {
        const date = latest.get(symbol);
        return date !== undefined && date >= floor ? [date] : [];
    });
    if (served.length < LUCK_MIN_POOL) return null;
    return served.reduce((end, date) => (date < end ? date : end), spy);
};

export type SnapshotReading = {date: string; totalValue: number; startingBalance: number};

// Why the learner's marker is not drawn: a holding with no quote and no snapshot on the last
// session, no snapshot at all, or an account none of whose fills the learner placed (the AI
// Navigator's account, or one never traded) — its return is a rule's, not "your return".
export type LuckWithheld = 'unpriced' | 'no-snapshot' | 'not-yours';

export type LuckWindow = {
    start: string;          // the session whose close the portfolios buy at
    end: string;            // the session whose close they are valued at
    sessions: number;
    yoursPct: number | null;
    withheld: LuckWithheld | null;
};

// The one rule for the window. It starts at the close of the account's inception date (the
// session before, for a weekend or holiday inception) — the base the performance chart puts
// SPY on. It ends on the last snapshot's date, the learner's return read from that snapshot:
//   - a snapshot on the latest stored session → end there;
//   - no snapshot that day and a holding with no quote → the account's value since cannot be
//     known (a live value would be at cost, and the snapshot job skips such an account), so the
//     portfolios run to the latest session and the learner's marker is withheld;
//   - no snapshot that day, everything priced → end on the last snapshot's date;
//   - no snapshot at all → the latest session, marker withheld;
//   - no fill in the account placed by the learner → the latest session, marker withheld: the
//     same scope as Trading habits, which counts the learner's own fills only.
// `lastSnapshot` is the account's latest snapshot dated from inception through `lastSession`.
export const luckWindow = ({inceptionDate, lastSession, lastSnapshot, unpriced, ownFills}: {
    inceptionDate: string;
    lastSession: string | null;
    lastSnapshot: SnapshotReading | null;
    unpriced: number;
    ownFills: boolean;
}): LuckWindow | null => {
    if (lastSession === null || lastSession < inceptionDate) return null;
    const start = sessionOnOrBefore(inceptionDate);
    const reading = (snapshot: SnapshotReading): number | null =>
        (snapshot.startingBalance > 0 ? (snapshot.totalValue / snapshot.startingBalance - 1) * 100 : null);
    const at = (end: string, yoursPct: number | null, withheld: LuckWithheld | null): LuckWindow =>
        ({start, end, sessions: sessionsBetween(start, end), yoursPct, withheld: yoursPct === null ? (withheld ?? 'no-snapshot') : null});

    if (!ownFills) return at(lastSession, null, 'not-yours');
    if (lastSnapshot && lastSnapshot.date === lastSession) return at(lastSession, reading(lastSnapshot), null);
    if (unpriced > 0) return at(lastSession, null, 'unpriced');
    if (lastSnapshot) return at(sessionOnOrBefore(lastSnapshot.date), reading(lastSnapshot), null);
    return at(lastSession, null, 'no-snapshot');
};

// ---- the view -------------------------------------------------------------------------------

export type LuckReady = {
    status: 'ready';
    start: string;
    end: string;
    sessions: number;
    count: number;
    size: number;
    pool: number;                 // names the sample was drawn from
    spyPct: number | null;
    medianPct: number;
    yours: {pct: number; below: number; rankPct: number} | null;
    withheld: LuckWithheld | null;
    histogram: Histogram;
};

export type LuckView =
    | {status: 'needs-days'; sessions: number}
    | {status: 'no-prices'; sessions: number}
    | LuckReady;

export const buildLuckView = ({window, hold, universe, seed, amount, benchmark = 'SPY', count = LUCK_SAMPLE_COUNT, size = LUCK_PORTFOLIO_SIZE}: {
    window: LuckWindow;
    hold: HoldWindow;
    universe: readonly string[];
    seed: number;
    amount: number;
    benchmark?: string;
    count?: number;
    size?: number;
}): LuckView => {
    if (window.sessions < LUCK_MIN_SESSIONS) return {status: 'needs-days', sessions: window.sessions};
    const pool = universe.filter((symbol) => hold.inputs.has(symbol));
    if (pool.length < Math.max(LUCK_MIN_POOL, size)) return {status: 'no-prices', sessions: window.sessions};

    const returns = samplePortfolios(pool, {count, size, random: mulberry32(seed)})
        .map((portfolio) => holdReturn(portfolio, hold, amount)?.returnPct)
        .filter((pct): pct is number => pct !== undefined)
        .sort((a, b) => a - b);
    const medianPct = medianOf(returns);
    if (medianPct === null) return {status: 'no-prices', sessions: window.sessions};
    const spyPct = holdReturn([benchmark], hold, amount)?.returnPct ?? null;
    const yours = window.yoursPct === null ? null : {pct: window.yoursPct, ...(({below, pct}) => ({below, rankPct: pct}))(percentileRank(returns, window.yoursPct))};
    const markers = [medianPct, spyPct, yours?.pct].filter((x): x is number => typeof x === 'number');
    return {
        status: 'ready',
        start: window.start,
        end: window.end,
        sessions: window.sessions,
        count: returns.length,
        size,
        pool: pool.length,
        spyPct,
        medianPct,
        yours,
        withheld: window.withheld,
        histogram: histogram(returns, LUCK_HISTOGRAM_BINS, markers),
    };
};
