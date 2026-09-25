// What a paper account earns while it waits: interest on idle cash at the 13-week T-bill rate
// and the real dividends on what it holds — the way a brokerage account behaves.
//
// Pure, and the ONLY implementation of the accrual convention. The nightly income job, the
// back-credit of existing accounts and the strategy simulator all walk days through the same
// clock, which is what keeps a strategy's live record and its backtest from drifting apart.
//
// The convention, one calendar day d at a time:
//   open(d)   — dividends with ex-date d are fixed on the holdings at the END of d−1: a buy on
//               the ex-date is not entitled, a sell on it is. They are paid on d + pay lag.
//   trades    — that day's fills move cash and holdings.
//   close(d)  — interest on the END-of-day cash of d, plus any dividend whose pay date is d.
// Rows dated d become cash at the start of d+1 (the job runs at 00:05 ET), so anything that
// looks at an account on day s — a snapshot, a strategy decision — sees every row dated < s.

import {DIVIDEND_PAY_LAG_DAYS} from "@/lib/prices/config";
import {addCalendarDays, eachCalendarDay} from "@/lib/prices/calendar-days";
import type {CoverageRange} from "@/lib/prices/coverage";

// Real sweep accounts pay somewhat below T-bills; one named number, not a hidden fudge.
export const CASH_YIELD_SPREAD = 0.0025;
// ^IRX forward-fills across weekends and bond holidays; beyond this the rate is not "the rate".
export const RATE_MAX_STALENESS_DAYS = 7;
// A symbol Yahoo has failed to serve for this long stops holding its account's income back.
export const SYMBOL_RELEASE_DAYS = 30;
const DAYS_PER_YEAR = 365;

export type RatePoint = {date: string; discountPct: number};
export type DividendPoint = {symbol: string; exDate: string; perShare: number};
export type IncomeTrade = {date: string; symbol: string; side: 'buy' | 'sell'; quantity: number; total: number};

export type IncomeRow = {
    kind: 'interest' | 'dividend';
    date: string;             // the day it accrued (interest) or is paid (dividend); cash at the start of the next day
    symbol: string;           // '' for interest
    amount: number;
    apy?: number;             // interest
    exDate?: string;          // dividend
    perShare?: number;        // dividend
    quantity?: number;        // dividend: shares entitled
};

// ^IRX is quoted as a discount yield, which understates what a holder earns. Convert to the
// bond-equivalent yield of a 13-week (91-day) bill before anything else touches it.
export const bondEquivalentYield = (discountPct: number): number => {
    const d = discountPct / 100;
    if (!(d > 0)) return 0;
    return (DAYS_PER_YEAR * d) / (360 - 91 * d);
};

export const apyFromDiscount = (discountPct: number, spread = CASH_YIELD_SPREAD): number =>
    Math.max(0, bondEquivalentYield(discountPct) - spread);

// Daily compounding: three one-day credits equal one three-day credit, so a missed night
// and a weekend cost nothing.
export const dailyFactor = (apy: number): number => (1 + apy) ** (1 / DAYS_PER_YEAR) - 1;

export type RateLookup = (date: string) => RatePoint | null;

// The latest point on or before a date — never after, so nothing is paid at a rate that
// was not yet known.
export const makeRateLookup = (points: readonly RatePoint[]): RateLookup => {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    return (date) => {
        let lo = 0;
        let hi = sorted.length - 1;
        let found: RatePoint | null = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (sorted[mid].date <= date) {
                found = sorted[mid];
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return found;
    };
};

export const dividendsByExDate = (points: readonly DividendPoint[]): Map<string, DividendPoint[]> => {
    const map = new Map<string, DividendPoint[]>();
    for (const point of points) {
        if (!(point.perShare > 0)) continue;
        const list = map.get(point.exDate) ?? [];
        list.push(point);
        map.set(point.exDate, list);
    }
    return map;
};

export const payDateFor = (exDate: string): string => addCalendarDays(exDate, DIVIDEND_PAY_LAG_DAYS);

export type IncomeClock = {
    open: (date: string, holdings: ReadonlyMap<string, number>) => void;
    close: (date: string, cash: number) => IncomeRow[];
};

export const createIncomeClock = ({rateOn, dividends}: {rateOn: RateLookup; dividends: ReadonlyMap<string, readonly DividendPoint[]>}): IncomeClock => {
    const scheduled = new Map<string, IncomeRow[]>();
    return {
        open: (date, holdings) => {
            for (const point of dividends.get(date) ?? []) {
                const quantity = holdings.get(point.symbol) ?? 0;
                if (quantity <= 0) continue;
                const pay = payDateFor(date);
                const list = scheduled.get(pay) ?? [];
                list.push({kind: 'dividend', date: pay, symbol: point.symbol, amount: quantity * point.perShare, exDate: date, perShare: point.perShare, quantity});
                scheduled.set(pay, list);
            }
        },
        close: (date, cash) => {
            const rows: IncomeRow[] = [];
            const rate = rateOn(date);
            if (rate !== null && cash > 0) {
                const apy = apyFromDiscount(rate.discountPct);
                const amount = cash * dailyFactor(apy);
                if (amount > 0) rows.push({kind: 'interest', date, symbol: '', amount, apy});
            }
            rows.push(...(scheduled.get(date) ?? []));
            scheduled.delete(date);
            return rows;
        },
    };
};

export const tradeCashEffect = (trade: IncomeTrade): number => (trade.side === 'sell' ? trade.total : -trade.total);

export type ReplayInput = {
    from: string;
    to: string;
    startCash: number;
    startHoldings: ReadonlyMap<string, number>;
    trades: readonly IncomeTrade[];
    clock: IncomeClock;
    // What was actually credited for rows dated `date`, once paid. History must move cash by
    // what the account really received, not by what would be computed from today's data.
    credited?: (date: string) => number | undefined;
};

export type ReplayResult = {
    rows: IncomeRow[];
    // End-of-day state of `to`; rows dated `to` are not in `cash` yet (they land at the next open).
    cash: number;
    holdings: Map<string, number>;
};

export const replayIncome = ({from, to, startCash, startHoldings, trades, clock, credited}: ReplayInput): ReplayResult => {
    const tradesByDate = new Map<string, IncomeTrade[]>();
    for (const trade of trades) {
        const list = tradesByDate.get(trade.date) ?? [];
        list.push(trade);
        tradesByDate.set(trade.date, list);
    }
    let cash = startCash;
    const holdings = new Map(startHoldings);
    const rows: IncomeRow[] = [];
    let due = 0;
    for (const day of eachCalendarDay(from, to)) {
        cash += due;
        clock.open(day, holdings);
        for (const trade of tradesByDate.get(day) ?? []) {
            cash += tradeCashEffect(trade);
            holdings.set(trade.symbol, (holdings.get(trade.symbol) ?? 0) + (trade.side === 'buy' ? trade.quantity : -trade.quantity));
        }
        const closed = clock.close(day, cash);
        rows.push(...closed);
        due = credited?.(day) ?? closed.reduce((sum, row) => sum + row.amount, 0);
    }
    return {rows, cash, holdings};
};

// ---------------------------------------------------------------------------
// Reconciliation and readiness — what the job checks before it writes anything
// ---------------------------------------------------------------------------

const CASH_TOLERANCE = 0.01;
const QUANTITY_TOLERANCE = 1e-9;

// An account's cash and positions must be exactly its starting balance, plus every trade,
// plus every credit it has already received. If they are not, some history is missing — and
// crediting interest on a reconstruction that is wrong would compound the error, so the
// account is skipped and reported instead.
export const reconcile = ({startingBalance, cash, positions, trades, creditedTotal}: {
    startingBalance: number;
    cash: number;
    positions: readonly {symbol: string; quantity: number}[];
    trades: readonly IncomeTrade[];
    creditedTotal: number;
}): {ok: true} | {ok: false; reason: string} => {
    const expectedCash = startingBalance + creditedTotal + trades.reduce((sum, trade) => sum + tradeCashEffect(trade), 0);
    if (Math.abs(expectedCash - cash) > CASH_TOLERANCE) {
        return {ok: false, reason: `cash ${cash.toFixed(2)} ≠ ${expectedCash.toFixed(2)} rebuilt from trades`};
    }
    const expected = new Map<string, number>();
    for (const trade of trades) expected.set(trade.symbol, (expected.get(trade.symbol) ?? 0) + (trade.side === 'buy' ? trade.quantity : -trade.quantity));
    const held = new Map(positions.map((p) => [p.symbol.toUpperCase(), p.quantity]));
    for (const symbol of new Set([...expected.keys(), ...held.keys()])) {
        if (Math.abs((expected.get(symbol) ?? 0) - (held.get(symbol) ?? 0)) > QUANTITY_TOLERANCE) {
            return {ok: false, reason: `${symbol} position ${held.get(symbol) ?? 0} ≠ ${expected.get(symbol) ?? 0} rebuilt from trades`};
        }
    }
    return {ok: true};
};

export type HoldingSpan = {symbol: string; firstHeld: string; lastHeld: string | null};

// The first and last day each symbol was held at a close; lastHeld is null while still held.
// One span per symbol (a sell-and-rebuy stays one span) — conservative for readiness.
export const holdingSpans = (trades: readonly IncomeTrade[]): HoldingSpan[] => {
    const quantity = new Map<string, number>();
    const spans = new Map<string, HoldingSpan>();
    const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    for (const trade of ordered) {
        const next = (quantity.get(trade.symbol) ?? 0) + (trade.side === 'buy' ? trade.quantity : -trade.quantity);
        quantity.set(trade.symbol, next);
        const span = spans.get(trade.symbol);
        if (span === undefined) spans.set(trade.symbol, {symbol: trade.symbol, firstHeld: trade.date, lastHeld: next > 0 ? null : trade.date});
        else span.lastHeld = next > 0 ? null : trade.date;
    }
    return [...spans.values()];
};

// The furthest day income may be credited through without inventing a zero: every day needs
// a T-bill rate no older than RATE_MAX_STALENESS_DAYS, and every dividend that could be paid
// in the window needs its symbol's dividends covered on its ex-date. Missing data holds the
// watermark back — it never turns into a permanent zero. Null when nothing is ready.
export const readyThrough = ({start, end, rateOn, spans, coverage, released}: {
    start: string;
    end: string;
    rateOn: RateLookup;
    spans: readonly HoldingSpan[];
    coverage: (symbol: string) => CoverageRange | null;
    released: ReadonlySet<string>;
}): string | null => {
    let ready = end;
    for (const day of eachCalendarDay(start, end)) {
        const rate = rateOn(day);
        if (rate === null || rate.date < addCalendarDays(day, -RATE_MAX_STALENESS_DAYS)) {
            ready = addCalendarDays(day, -1);
            break;
        }
    }
    for (const span of spans) {
        if (released.has(span.symbol)) continue;
        // Ex-dates that can pay inside [start, ready]: entitled at the end of e−1, paid at e + lag.
        const firstExDate = maxDate(addCalendarDays(start, -DIVIDEND_PAY_LAG_DAYS), addCalendarDays(span.firstHeld, 1));
        const lastExDate = minDate(addCalendarDays(ready, -DIVIDEND_PAY_LAG_DAYS), span.lastHeld === null ? end : addCalendarDays(span.lastHeld, 1));
        if (firstExDate > lastExDate) continue;
        const range = coverage(span.symbol);
        if (range === null || range.from > firstExDate) {
            ready = minDate(ready, addCalendarDays(firstExDate, DIVIDEND_PAY_LAG_DAYS - 1));
        } else if (range.through < lastExDate) {
            ready = minDate(ready, addCalendarDays(range.through, DIVIDEND_PAY_LAG_DAYS));
        }
    }
    return ready >= start ? ready : null;
};

const minDate = (a: string, b: string): string => (a < b ? a : b);
const maxDate = (a: string, b: string): string => (a > b ? a : b);
