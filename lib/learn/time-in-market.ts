// Time in the market, on SPY: the same money owned three ways over one window the learner
// picks — all of it into SPY on the first day, the same amount in equal monthly deposits, or
// none of it (kept as cash). Pure and client-safe; the server read is time-in-market-read.ts.
//
// SPY here is the total-return index getBenchmarkIndex builds (dividends reinvested on their
// pay dates), so a way that holds SPY holds units of that index. Cash — the deposit waiting
// for the next session, the interest it earned — goes through replayIncome, the one clock
// every paper account, the income job and the strategy simulator use (invariant 11). A day
// that holds cash and has no usable T-bill rate makes the way null, never zero; a day that
// holds no cash needs no rate.

import {z} from "zod";
import {addCalendarDays, eachCalendarDay} from "@/lib/prices/calendar-days";
import {STRATEGY_BACKFILL_CALENDAR_DAYS} from "@/lib/prices/config";
import type {IndexPoint} from "@/lib/prices/total-return";
import type {StrategyId} from "@/lib/strategies/types";
import {toCents} from "@/lib/trading/bridge";
import {
    createIncomeClock,
    makeRateLookup,
    replayIncome,
    usableRate,
    type Deposit,
    type IncomeClock,
    type IncomeTrade,
    type RateLookup,
    type RatePoint,
} from "@/lib/trading/income";

// The one page that carries the lesson: owning SPY and doing nothing is itself a strategy.
export const TIME_IN_MARKET_STRATEGY: StrategyId = 'buy-and-hold-spy';

// The money each way puts in. A round number, not the learner's balance: this is a lesson
// about SPY's path, not a mirror of the account.
export const TIME_IN_MARKET_AMOUNT = 10_000;
// A window holds at least three monthly deposits, so the monthly way is never one deposit.
export const MIN_WINDOW_DAYS = 91;
// As far back as the strategies keep SPY's daily bars.
export const MAX_LOOKBACK_DAYS = STRATEGY_BACKFILL_CALENDAR_DAYS;
// With no paper account to date the window from, it starts a year back.
export const FALLBACK_LOOKBACK_DAYS = 365;
// "Why the start date matters": eight starts, a quarter apart, all to the same end.
export const TABLE_ROWS = 8;
export const TABLE_STEP_MONTHS = 3;

const HOLDING = 'SPY';

export type WayKey = 'lumpSum' | 'dollarCostAverage' | 'cashOnly';
export const WAY_KEYS: readonly WayKey[] = ['lumpSum', 'dollarCostAverage', 'cashOnly'];

export type DateWindow = {start: string; end: string};
// End-of-day value on one session (cash, interest accrued that day, and units × the index)
// beside the dollars deposited so far.
export type WayPoint = {date: string; value: number; contributed: number};
export type WaySeries = {points: WayPoint[]; deposits: Deposit[]};

// ---- the start date ---------------------------------------------------------------------

const isCalendarDate = (value: string): boolean => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

// The page's ?from=. Zod v4 runs .refine after a failed .max, so the refinement checks the
// whole shape itself rather than trusting the step before it.
const START_PARAM = z.string().max(10).refine(isCalendarDate);

export type StartSource = 'requested' | 'inception' | 'fallback';
export type ResolvedStart = {
    from: string;
    source: StartSource;
    // A typed date that fell outside [floor, ceiling] and was moved to the nearer end.
    outOfRange: string | null;
    floor: string;
    ceiling: string;
};

const clampDate = (date: string, floor: string, ceiling: string): string => (date < floor ? floor : date > ceiling ? ceiling : date);

// A valid ?from= inside the range as asked, or moved to the nearer end; anything else starts
// on the learner's first account's inception date, clamped the same way (a young account
// still gets MIN_WINDOW_DAYS), or a year back with no account at all.
export const resolveStart = ({requested, inception, today}: {requested: unknown; inception: string | null; today: string}): ResolvedStart => {
    const floor = addCalendarDays(today, -MAX_LOOKBACK_DAYS);
    const ceiling = addCalendarDays(today, -MIN_WINDOW_DAYS);
    const parsed = START_PARAM.safeParse(requested);
    if (parsed.success) {
        const from = clampDate(parsed.data, floor, ceiling);
        return {from, source: 'requested', outOfRange: from === parsed.data ? null : parsed.data, floor, ceiling};
    }
    const wanted = inception ?? addCalendarDays(today, -FALLBACK_LOOKBACK_DAYS);
    return {from: clampDate(wanted, floor, ceiling), source: inception ? 'inception' : 'fallback', outOfRange: null, floor, ceiling};
};

// ---- the schedule -------------------------------------------------------------------------

// The same day of the month `months` later (or earlier), on the month's last day when it is
// shorter: Jan 31 → Feb 28 → Mar 31, always counted from the original day.
export const addMonths = (date: string, months: number): string => {
    const [y, m, d] = date.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))).toISOString().slice(0, 10);
};

// One deposit a month from `start` through `end`, the amount split into whole cents that add
// back to it exactly (the first deposits take the leftover cents).
export const monthlyDeposits = (start: string, end: string, amount: number): Deposit[] => {
    const dates: string[] = [];
    for (let k = 0, date = start; date <= end; k += 1, date = addMonths(start, k)) dates.push(date);
    if (dates.length === 0) return [];
    const total = toCents(amount);
    const base = Math.floor(total / dates.length);
    const extra = total - base * dates.length;
    return dates.map((date, i) => ({date, amount: (base + (i < extra ? 1 : 0)) / 100}));
};

// ---- the three ways -------------------------------------------------------------------------

const sessionsIn = (index: readonly IndexPoint[], {start, end}: DateWindow): IndexPoint[] =>
    index.filter((point) => point.date >= start && point.date <= end);

// The one walk behind all three. Deposits land in cash; with `invest`, each buys units of the
// index at the first session on or after it, so a deposit made on a weekend waits — and earns —
// until Monday. The clock is watched, not changed: a close that holds cash on a day with no
// usable rate (the income job's own staleness rule) voids the way. Each session's value is then
// rebuilt from the same deposits, buys and credited rows the clock walked.
const own = (index: readonly IndexPoint[], window: DateWindow, deposits: readonly Deposit[], rateOn: RateLookup, invest: boolean): WaySeries | null => {
    const sessions = sessionsIn(index, window);
    if (sessions.length === 0) return null;
    const trades: IncomeTrade[] = [];
    if (invest) {
        for (const deposit of deposits) {
            const session = sessions.find((point) => point.date >= deposit.date);
            if (session === undefined || !(session.value > 0)) return null;
            trades.push({date: session.date, symbol: HOLDING, side: 'buy', quantity: deposit.amount / session.value, total: deposit.amount});
        }
    }
    const clock = createIncomeClock({rateOn, dividends: new Map()});
    let unpriced = false;
    const watched: IncomeClock = {
        open: clock.open,
        close: (date, cash) => {
            if (cash > 0 && usableRate(rateOn(date), date) === null) unpriced = true;
            return clock.close(date, cash);
        },
    };
    const {rows} = replayIncome({from: window.start, to: window.end, startCash: 0, startHoldings: new Map(), trades, deposits, clock: watched});
    if (unpriced) return null;

    const cashIn = new Map<string, number>();
    const unitsIn = new Map<string, number>();
    const paidIn = new Map<string, number>();
    const bump = (map: Map<string, number>, date: string, amount: number) => map.set(date, (map.get(date) ?? 0) + amount);
    for (const deposit of deposits) {
        bump(cashIn, deposit.date, deposit.amount);
        bump(paidIn, deposit.date, deposit.amount);
    }
    for (const trade of trades) {
        bump(cashIn, trade.date, -trade.total);
        bump(unitsIn, trade.date, trade.quantity);
    }
    // A row dated d is owed at d's close and cash at d+1's open; as value it counts on d.
    for (const row of rows) bump(cashIn, row.date, row.amount);
    const indexOn = new Map(sessions.map((point) => [point.date, point.value]));
    let cash = 0;
    let units = 0;
    let contributed = 0;
    const points: WayPoint[] = [];
    for (const day of eachCalendarDay(window.start, window.end)) {
        cash += cashIn.get(day) ?? 0;
        units += unitsIn.get(day) ?? 0;
        contributed += paidIn.get(day) ?? 0;
        const value = indexOn.get(day);
        if (value !== undefined) points.push({date: day, value: cash + units * value, contributed});
    }
    return {points, deposits: [...deposits]};
};

// The whole amount into SPY at the first session of the window.
export const lumpSum = (index: readonly IndexPoint[], window: DateWindow, amount: number, rateOn: RateLookup): WaySeries | null =>
    own(index, window, [{date: window.start, amount}], rateOn, true);

// The same amount in equal monthly deposits across the window, each into SPY when it arrives.
export const dollarCostAverage = (index: readonly IndexPoint[], window: DateWindow, amount: number, rateOn: RateLookup): WaySeries | null =>
    own(index, window, monthlyDeposits(window.start, window.end, amount), rateOn, true);

// The whole amount kept as cash: replayIncome with no trades, valued on SPY's sessions.
export const cashOnly = (index: readonly IndexPoint[], window: DateWindow, amount: number, rateOn: RateLookup): WaySeries | null =>
    own(index, window, [{date: window.start, amount}], rateOn, false);

// ---- reading a way --------------------------------------------------------------------------

// A run of sessions whose value, to the cent, sat below the dollars deposited so far. Not the
// drawdown (a fall from a peak): a way can be off its high and still above what went in.
export type UnderwaterSpan = {from: string; to: string; sessions: number; ongoing: boolean; deepestPct: number};

export const underwaterSpans = (points: readonly WayPoint[]): UnderwaterSpan[] => {
    const spans: UnderwaterSpan[] = [];
    let current: UnderwaterSpan | null = null;
    points.forEach((point, i) => {
        if (toCents(point.value) < toCents(point.contributed)) {
            const pct = (point.value / point.contributed - 1) * 100;
            if (current === null) current = {from: point.date, to: point.date, sessions: 1, ongoing: false, deepestPct: pct};
            else current = {...current, to: point.date, sessions: current.sessions + 1, deepestPct: Math.min(current.deepestPct, pct)};
            if (i === points.length - 1) current = {...current, ongoing: true};
        } else if (current !== null) {
            spans.push(current);
            current = null;
        }
    });
    if (current !== null) spans.push(current);
    return spans;
};

// Whole cents, so what the tiles print adds up: end − put in = change, to the cent.
export type WaySummary = {
    contributedCents: number;
    endCents: number;
    changeCents: number;
    deposits: number;
    sessions: number;
    underwaterSessions: number;
    longest: UnderwaterSpan | null;
};

export const summarizeWay = (series: WaySeries | null): WaySummary | null => {
    const last = series?.points[series.points.length - 1];
    if (!series || last === undefined) return null;
    const spans = underwaterSpans(series.points);
    const longest = spans.reduce<UnderwaterSpan | null>((best, span) => (best === null || span.sessions > best.sessions ? span : best), null);
    const contributedCents = toCents(last.contributed);
    const endCents = toCents(last.value);
    return {
        contributedCents, endCents, changeCents: endCents - contributedCents,
        deposits: series.deposits.length, sessions: series.points.length,
        underwaterSessions: spans.reduce((sum, span) => sum + span.sessions, 0), longest,
    };
};

// The change as a share of what was put in, from the same cents the tiles print.
export const changePct = (summary: WaySummary | null): number | null =>
    summary && summary.contributedCents > 0 ? summary.changeCents / summary.contributedCents * 100 : null;

// ---- why the start date matters -------------------------------------------------------------

export type StartRow = {start: string; ways: Record<WayKey, number | null>};

// Quarter steps back from today, from the same day of the month.
export const tableStarts = (today: string, rows = TABLE_ROWS, stepMonths = TABLE_STEP_MONTHS): string[] =>
    Array.from({length: rows}, (_, k) => addMonths(today, -stepMonths * (k + 1)));

const threeWays = (index: readonly IndexPoint[], window: DateWindow, amount: number, rateOn: RateLookup): Record<WayKey, WaySeries | null> => ({
    lumpSum: lumpSum(index, window, amount, rateOn),
    dollarCostAverage: dollarCostAverage(index, window, amount, rateOn),
    cashOnly: cashOnly(index, window, amount, rateOn),
});

// The same amount and the same end date, from each start the stored history reaches (a start
// before the first stored session is left out, never shortened). Each row starts at the first
// session on or after its date, which is also where the row's link lands.
export const startDateTable = (index: readonly IndexPoint[], rateOn: RateLookup, starts: readonly string[], amount: number): StartRow[] => {
    const first = index[0]?.date;
    const end = index[index.length - 1]?.date;
    if (first === undefined || end === undefined) return [];
    const rows: StartRow[] = [];
    for (const start of starts) {
        if (start < first) continue;
        const session = index.find((point) => point.date >= start);
        if (session === undefined || session.date >= end || rows.some((row) => row.start === session.date)) continue;
        const ways = threeWays(index, {start: session.date, end}, amount, rateOn);
        rows.push({
            start: session.date,
            ways: {
                lumpSum: changePct(summarizeWay(ways.lumpSum)),
                dollarCostAverage: changePct(summarizeWay(ways.dollarCostAverage)),
                cashOnly: changePct(summarizeWay(ways.cashOnly)),
            },
        });
    }
    return rows;
};

// ---- the panel's view -----------------------------------------------------------------------

export type ChartLine = {key: WayKey; values: number[]};

export type TimeInMarketView = {
    status: 'ok' | 'no-history';
    amount: number;
    resolved: ResolvedStart;
    // The window actually walked: the first stored session on or after resolved.from, to the last.
    start: string;
    end: string;
    sessions: number;
    // How many monthly deposits the window holds, priced or not.
    deposits: number;
    ways: Record<WayKey, WaySummary | null>;
    // The first day of the window with no usable T-bill rate, when that voided the cash way.
    rateGap: string | null;
    // Growth of each dollar contributed (value ÷ dollars deposited so far), one value per
    // session; a way that could not be priced has no line.
    chart: {dates: string[]; lines: ChartLine[]};
    table: StartRow[];
};

const firstRateGap = (rateOn: RateLookup, {start, end}: DateWindow): string | null =>
    eachCalendarDay(start, end).find((day) => usableRate(rateOn(day), day) === null) ?? null;

const PER_DOLLAR_DECIMALS = 1e6;

export const buildTimeInMarket = ({index, rates, resolved, amount, starts}: {
    index: readonly IndexPoint[];
    rates: readonly RatePoint[];
    resolved: ResolvedStart;
    amount: number;
    starts: readonly string[];
}): TimeInMarketView => {
    const rateOn = makeRateLookup(rates);
    const sessions = index.filter((point) => point.date >= resolved.from);
    const table = startDateTable(index, rateOn, starts, amount);
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    if (sessions.length < 2 || first === undefined || last === undefined) {
        return {
            status: 'no-history', amount, resolved, start: first?.date ?? resolved.from, end: last?.date ?? resolved.from, sessions: sessions.length, deposits: 0,
            ways: {lumpSum: null, dollarCostAverage: null, cashOnly: null}, rateGap: null, chart: {dates: [], lines: []}, table,
        };
    }
    const window = {start: first.date, end: last.date};
    const series = threeWays(index, window, amount, rateOn);
    const lines = WAY_KEYS.flatMap((key): ChartLine[] => {
        const way = series[key];
        return way ? [{key, values: way.points.map((p) => Math.round(p.value / p.contributed * PER_DOLLAR_DECIMALS) / PER_DOLLAR_DECIMALS)}] : [];
    });
    return {
        status: 'ok', amount, resolved, start: window.start, end: window.end, sessions: sessions.length,
        deposits: monthlyDeposits(window.start, window.end, amount).length,
        ways: {lumpSum: summarizeWay(series.lumpSum), dollarCostAverage: summarizeWay(series.dollarCostAverage), cashOnly: summarizeWay(series.cashOnly)},
        rateGap: series.cashOnly === null ? firstRateGap(rateOn, window) : null,
        chart: {dates: sessions.map((point) => point.date), lines},
        table,
    };
};
