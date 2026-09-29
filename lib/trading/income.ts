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
import {easternParts, previousTradingDay} from "@/lib/prices/market-hours";
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

// What the clock credits on `cash` over `days` nights at one constant APY with nothing traded:
// each night's interest joins the next day's cash, so it compounds. The order ticket's
// "earning ≈$x/month" is this; a parity test holds it to replayIncome's rows.
export const interestOverDays = (cash: number, apy: number, days: number): number =>
    cash > 0 && apy > 0 && days > 0 ? cash * ((1 + dailyFactor(apy)) ** days - 1) : 0;

export type RateLookup = (date: string) => RatePoint | null;

// The rate that counts on `date`: the latest point no older than RATE_MAX_STALENESS_DAYS, else
// none. The one staleness rule — readyThrough holds the income watermark with it, and the APY
// the Income panel and the order ticket quote (account.getCashApy) goes blank with it, so a
// rate the job would not credit at is never quoted as today's rate either.
export const usableRate = <P extends {date: string}>(point: P | null, date: string): P | null =>
    point !== null && point.date >= addCalendarDays(date, -RATE_MAX_STALENESS_DAYS) ? point : null;

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
        if (usableRate(rateOn(day), day) === null) {
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

// ---------------------------------------------------------------------------
// The job's one-line summary — what the Brain status strip shows
// ---------------------------------------------------------------------------

type OutcomeLike = {accountId: string; status: string; amount?: number; reason?: string};

// Credited accounts and dollars first; then anything that did not credit, named, so a
// skipped account (history that does not reconcile) is visible instead of silently unpaid.
export const describeIncomeRun = (outcomes: readonly OutcomeLike[], through: string): string => {
    const credited = outcomes.filter((o) => o.status === 'credited');
    const amount = credited.reduce((sum, o) => sum + (o.amount ?? 0), 0);
    const parts = [`Income through ${through}: ${credited.length} account(s) credited $${amount.toFixed(2)}`];
    const current = outcomes.filter((o) => o.status === 'current').length;
    if (current > 0) parts.push(`${current} already current`);
    for (const status of ['waiting', 'skipped', 'raced', 'error']) {
        const hit = outcomes.filter((o) => o.status === status);
        if (hit.length === 0) continue;
        const named = hit.slice(0, 3).map((o) => `${o.accountId.slice(-6)}${o.reason ? ` (${o.reason})` : ''}`).join('; ');
        parts.push(`${hit.length} ${status}: ${named}${hit.length > 3 ? ` +${hit.length - 3} more` : ''}`);
    }
    return parts.join(' · ');
};

// ---------------------------------------------------------------------------
// What the Income panel shows
// ---------------------------------------------------------------------------

// The APY whose daily factor is `rate` — dailyFactor's inverse.
export const apyForDailyRate = (rate: number): number => (1 + rate) ** DAYS_PER_YEAR - 1;

export type IncomeMonth = {
    month: string;
    amount: number;
    days: number;
    averageApy: number | null;
    // The month's average end-of-day cash, rebuilt from its own rows: each day's interest is
    // that day's cash × dailyFactor(that day's APY), so the cash is the amount ÷ the factor.
    // Null when a row was stored without its rate.
    averageCash: number | null;
    // The one APY that, credited daily on every dollar-day of the month, gives exactly the
    // month's interest: the day's own APY when the rate held all month, otherwise the days'
    // rates weighted by the cash that earned them. averageCash × dailyFactor(this) × days is
    // the stored sum; a plain average of the days' APYs is not, once cash and rate both move.
    cashWeightedApy: number | null;
    minApy: number | null;
    maxApy: number | null;
};

export type IncomeActivity = {
    // Interest is credited every calendar day; thirty near-identical rows a month is noise, so
    // it is shown one line per month.
    interestByMonth: IncomeMonth[];
    // Dividends are events worth seeing one by one.
    dividends: {date: string; exDate: string | null; symbol: string; quantity: number | null; perShare: number | null; amount: number}[];
};

type MonthTotals = {amount: number; days: number; apySum: number; apyDays: number; cashDays: number; rebuilt: boolean; minApy: number; maxApy: number};

export const groupIncomeActivity = (
    rows: readonly {kind: 'interest' | 'dividend'; date: string; symbol: string; amount: number; apy?: number; exDate?: string; perShare?: number; quantity?: number}[],
    {months = 12, dividends = 20}: {months?: number; dividends?: number} = {},
): IncomeActivity => {
    const byMonth = new Map<string, MonthTotals>();
    for (const row of rows) {
        if (row.kind !== 'interest') continue;
        const month = row.date.slice(0, 7);
        const entry = byMonth.get(month) ?? {amount: 0, days: 0, apySum: 0, apyDays: 0, cashDays: 0, rebuilt: true, minApy: Infinity, maxApy: -Infinity};
        entry.amount += row.amount;
        entry.days += 1;
        if (typeof row.apy === 'number') {
            entry.apySum += row.apy;
            entry.apyDays += 1;
            entry.minApy = Math.min(entry.minApy, row.apy);
            entry.maxApy = Math.max(entry.maxApy, row.apy);
        }
        const factor = typeof row.apy === 'number' ? dailyFactor(row.apy) : 0;
        if (factor > 0) entry.cashDays += row.amount / factor;
        else entry.rebuilt = false;
        byMonth.set(month, entry);
    }
    return {
        interestByMonth: [...byMonth.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, months)
            .map(([month, e]) => {
                const rebuilt = e.rebuilt && e.cashDays > 0;
                return {
                    month,
                    amount: e.amount,
                    days: e.days,
                    averageApy: e.apyDays > 0 ? e.apySum / e.apyDays : null,
                    averageCash: rebuilt ? e.cashDays / e.days : null,
                    cashWeightedApy: rebuilt ? apyForDailyRate(e.amount / e.cashDays) : null,
                    minApy: e.apyDays > 0 ? e.minApy : null,
                    maxApy: e.apyDays > 0 ? e.maxApy : null,
                };
            }),
        dividends: rows
            .filter((row) => row.kind === 'dividend')
            .sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol))
            .slice(0, dividends)
            .map((row) => ({date: row.date, exDate: row.exDate ?? null, symbol: row.symbol, quantity: row.quantity ?? null, perShare: row.perShare ?? null, amount: row.amount})),
    };
};

// ---------------------------------------------------------------------------
// Receipts — why each credit is the number it is, read back from the same convention
// ---------------------------------------------------------------------------

// A fill as the trade ledger (account.getTradeLedger) carries it. Dated in Eastern time, the
// way the income job dates every trade, so "the close before the ex-date" means the same day
// here as it did when the clock decided who was paid.
export type LedgerFill = {symbol: string; side: 'buy' | 'sell'; quantity: number; createdAt: number};

type DatedFill = {date: string; symbol: string; delta: number};

const datedFills = (ledger: readonly LedgerFill[], symbol: string): DatedFill[] => ledger
    .filter((t) => t.symbol.toUpperCase() === symbol)
    .map((t) => ({date: easternParts(new Date(t.createdAt)).date, symbol, delta: t.side === 'buy' ? t.quantity : -t.quantity}))
    .sort((a, b) => a.date.localeCompare(b.date));

// Shares held at the END of `date` — the holding the clock's open(date + 1) reads.
const sharesAtClose = (fills: readonly DatedFill[], date: string): number =>
    fills.reduce((sum, f) => (f.date <= date ? sum + f.delta : sum), 0);

export type DividendReceipt = {
    symbol: string;
    exDate: string;
    closeBefore: string;      // the day whose closing holding was paid
    payDate: string;
    quantity: number;
    perShare: number;
    amount: number;
    // The first day of the holding the ledger shows at that close (since it was last flat);
    // null when the ledger does not show exactly the shares that were paid.
    heldSince: string | null;
};

export const explainDividend = (row: IncomeActivity['dividends'][number], ledger: readonly LedgerFill[]): DividendReceipt | null => {
    if (row.exDate === null || row.quantity === null || row.perShare === null) return null;
    const closeBefore = addCalendarDays(row.exDate, -1);
    const fills = datedFills(ledger, row.symbol);
    let held = 0;
    let since: string | null = null;
    for (const f of fills) {
        if (f.date > closeBefore) break;
        const next = held + f.delta;
        if (held <= QUANTITY_TOLERANCE && next > QUANTITY_TOLERANCE) since = f.date;
        if (next <= QUANTITY_TOLERANCE) since = null;
        held = next;
    }
    const matches = Math.abs(held - row.quantity) <= QUANTITY_TOLERANCE;
    return {
        symbol: row.symbol, exDate: row.exDate, closeBefore, payDate: row.date,
        quantity: row.quantity, perShare: row.perShare, amount: row.amount,
        heldSince: matches ? since : null,
    };
};

export type MissedExDate = {
    symbol: string;
    exDate: string;
    perShare: number;
    // A buy on the ex-date is one day late; a sell in the session before it is one day early.
    kind: 'bought-on-ex-date' | 'sold-before-ex-date';
    tradeDate: string;
    quantity: number;
    amount: number;
};

// Ex-dates a fill missed by one day, by the clock's own rule (paid on the holding at the end
// of the day before the ex-date). Net, not gross: a sell bought back before that close, or a
// buy on the ex-date matched by a sell the same day, missed nothing.
export const missedExDates = (
    ledger: readonly LedgerFill[],
    points: readonly DividendPoint[],
    {limit = 5}: {limit?: number} = {},
): MissedExDate[] => {
    const bySymbol = new Map<string, DatedFill[]>();
    const fillsOf = (symbol: string): DatedFill[] => {
        const cached = bySymbol.get(symbol);
        if (cached) return cached;
        const fills = datedFills(ledger, symbol);
        bySymbol.set(symbol, fills);
        return fills;
    };
    const missed: MissedExDate[] = [];
    for (const point of points) {
        if (!(point.perShare > 0)) continue;
        const fills = fillsOf(point.symbol.toUpperCase());
        if (fills.length === 0) continue;
        const closeBefore = addCalendarDays(point.exDate, -1);
        const entitled = sharesAtClose(fills, closeBefore);

        const boughtLate = sharesAtClose(fills, point.exDate) - entitled;
        if (boughtLate > QUANTITY_TOLERANCE && fills.some((f) => f.date === point.exDate && f.delta > 0)) {
            missed.push({symbol: point.symbol, exDate: point.exDate, perShare: point.perShare, kind: 'bought-on-ex-date', tradeDate: point.exDate, quantity: boughtLate, amount: boughtLate * point.perShare});
        }

        const session = previousTradingDay(point.exDate);
        const sells = fills.filter((f) => f.date >= session && f.date <= closeBefore && f.delta < 0);
        const soldEarly = sharesAtClose(fills, addCalendarDays(session, -1)) - entitled;
        if (soldEarly > QUANTITY_TOLERANCE && sells.length > 0) {
            missed.push({symbol: point.symbol, exDate: point.exDate, perShare: point.perShare, kind: 'sold-before-ex-date', tradeDate: sells[sells.length - 1].date, quantity: soldEarly, amount: soldEarly * point.perShare});
        }
    }
    return missed
        .sort((a, b) => b.exDate.localeCompare(a.exDate) || a.symbol.localeCompare(b.symbol))
        .slice(0, limit);
};

export type IncomeView = {
    interestByMonth: IncomeMonth[];
    dividends: (IncomeActivity['dividends'][number] & {receipt: DividendReceipt | null})[];
    missed: MissedExDate[];
};

export const withReceipts = (activity: IncomeActivity, ledger: readonly LedgerFill[], points: readonly DividendPoint[]): IncomeView => ({
    interestByMonth: activity.interestByMonth,
    dividends: activity.dividends.map((d) => ({...d, receipt: explainDividend(d, ledger)})),
    missed: missedExDates(ledger, points),
});
