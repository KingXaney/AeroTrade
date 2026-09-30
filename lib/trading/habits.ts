// Trading habits: what the learner's own fills say about how they trade, measured lot by lot.
// Pure — the page hands in the account's epoch ledger (the one cached getTradeLedger read), the
// last price of each symbol it knows one for, and the clock.
//
// Only decisions the learner made count (source 'user'): a strategy's, a suggestion's or the
// Navigator's fill is a rule's decision, not a habit. Lots come from matchLots (FIFO) over EVERY
// fill in the account — pairing the learner's fills alone would let a learner's sell close a lot
// an automated sell had already closed — and then a closed lot counts when its sell is the
// learner's, an open lot when its buy is. FIFO here is a way of pairing, and the account's
// realized P&L (average cost) is untouched. Every figure is a measurement — how long, how many, how often — and the pace
// is set beside the catalog's own cadences, never beside an invented holding period.

import {byTime, matchLots, type LedgerTrade} from "@/lib/trading/lots";
import {isTradingDay} from "@/lib/prices/market-hours";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {getEasternDateString} from "@/lib/utils";
import type {Cadence} from "@/lib/strategies/types";

// Fewer closed lots than this and a median or a share is one trade's anecdote.
export const HABITS_MIN_CLOSED_LOTS = 3;
export const PACE_WINDOW_DAYS = 30;
// "Had you held" prices the names most recently sold; each one not held any more costs a quote.
export const HAD_YOU_HELD_MAX_SYMBOLS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClosedLot = {
    sellId: string;
    symbol: string;
    quantity: number;
    buyPrice: number;
    sellPrice: number;
    boughtAt: number;
    soldAt: number;
};

export const userFills = (ledger: readonly LedgerTrade[]): LedgerTrade[] => ledger.filter((t) => t.source === 'user');

// Every lot (or part of one) a learner's sell closed, in the order the sells happened.
export const closedLots = (ledger: readonly LedgerTrade[]): ClosedLot[] => {
    const fills = byTime(ledger);
    const {matches} = matchLots(fills);
    return fills.flatMap((sell) => (sell.side !== 'sell' || sell.source !== 'user' ? [] : (matches[sell.id] ?? []).map((lot) => ({
        sellId: sell.id,
        symbol: sell.symbol,
        quantity: lot.quantity,
        buyPrice: lot.price,
        sellPrice: sell.price,
        boughtAt: lot.createdAt,
        soldAt: sell.createdAt,
    }))));
};

// The names the learner sold, newest sale first, at most `cap` of them.
export const hadYouHeldSymbols = (ledger: readonly LedgerTrade[], cap = HAD_YOU_HELD_MAX_SYMBOLS): {symbols: string[]; capped: boolean} => {
    const sold: string[] = [];
    for (const lot of [...closedLots(ledger)].reverse()) {
        if (!sold.includes(lot.symbol)) sold.push(lot.symbol);
    }
    return {symbols: sold.slice(0, cap), capped: sold.length > cap};
};

export type CadenceControl = {cadence: Cadence; names: string[]};

const CADENCE_ORDER: readonly Cadence[] = ['daily', 'monthly', 'quarterly', 'once'];

// The catalog's rules grouped by how often they trade, fastest first — the only yardstick the
// learner's pace is set beside.
export const cadenceControls = (defs: readonly {name: string; cadence: Cadence}[]): CadenceControl[] =>
    CADENCE_ORDER
        .map((cadence) => ({cadence, names: defs.filter((def) => def.cadence === cadence).map((def) => def.name)}))
        .filter((control) => control.names.length > 0);

export type LotCount = {sold: number; total: number};

export type Habits = {
    closedLots: number;
    // Median days from a lot's buy to the sell that closed it.
    hold: {winnerDays: number | null; loserDays: number | null; winners: number; losers: number};
    // Lots at a gain vs at a loss, and how many of each were sold. An open lot is judged at the
    // last price; one with no price is left out and counted in unpricedOpen.
    sold: {winners: LotCount; losers: LotCount; unpricedOpen: number};
    // The last 30 days (from inception when the account is younger).
    pace: {fills: number; days: number; windowDays: number; sessions: number; since: string; full: boolean};
    // Dollars of shares sold in the same window, beside the starting balance.
    turnover: {soldCents: number; startingCents: number};
    // What the shares sold would be worth at the last price, against what they were sold for.
    hadYouHeld: {soldForCents: number; worthNowCents: number; symbols: string[]; capped: boolean} | null;
};

const median = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const cents = (dollars: number): number => Math.round(dollars * 100);

export const computeHabits = ({ledger, prices, now, inceptionAt, startingBalance}: {
    ledger: readonly LedgerTrade[];
    prices: ReadonlyMap<string, number>;
    now: number;
    inceptionAt: number;
    startingBalance: number;
}): Habits | null => {
    const closed = closedLots(ledger);
    if (closed.length < HABITS_MIN_CLOSED_LOTS) return null;
    const fills = userFills(ledger);

    const heldDays = (lot: ClosedLot) => (lot.soldAt - lot.boughtAt) / DAY_MS;
    const closedWinners = closed.filter((lot) => lot.sellPrice > lot.buyPrice);
    const closedLosers = closed.filter((lot) => lot.sellPrice < lot.buyPrice);

    let openWinners = 0;
    let openLosers = 0;
    let unpricedOpen = 0;
    const ownBuys = new Set(fills.filter((t) => t.side === 'buy').map((t) => t.id));
    for (const lot of matchLots(ledger).open.filter((open) => ownBuys.has(open.buyId))) {
        const price = prices.get(lot.symbol);
        if (price === undefined || !(price > 0)) unpricedOpen += 1;
        else if (price > lot.price) openWinners += 1;
        else if (price < lot.price) openLosers += 1;
    }

    const since = Math.max(inceptionAt, now - PACE_WINDOW_DAYS * DAY_MS);
    const inWindow = fills.filter((t) => t.createdAt >= since && t.createdAt <= now);
    const sinceDate = getEasternDateString(new Date(since));
    const today = getEasternDateString(new Date(now));
    let sessions = 0;
    for (let day = sinceDate; day <= today; day = addCalendarDays(day, 1)) if (isTradingDay(day)) sessions += 1;
    const windowDays = Math.max(1, Math.round((now - since) / DAY_MS));

    const {symbols: candidates, capped} = hadYouHeldSymbols(ledger);
    const priced = candidates.filter((symbol) => (prices.get(symbol) ?? 0) > 0);
    const heldLots = closed.filter((lot) => priced.includes(lot.symbol));

    return {
        closedLots: closed.length,
        hold: {
            winnerDays: median(closedWinners.map(heldDays)),
            loserDays: median(closedLosers.map(heldDays)),
            winners: closedWinners.length,
            losers: closedLosers.length,
        },
        sold: {
            winners: {sold: closedWinners.length, total: closedWinners.length + openWinners},
            losers: {sold: closedLosers.length, total: closedLosers.length + openLosers},
            unpricedOpen,
        },
        pace: {
            fills: inWindow.length,
            days: new Set(inWindow.map((t) => getEasternDateString(new Date(t.createdAt)))).size,
            windowDays,
            sessions,
            since: sinceDate,
            full: windowDays >= PACE_WINDOW_DAYS,
        },
        turnover: {
            soldCents: cents(inWindow.filter((t) => t.side === 'sell').reduce((sum, t) => sum + t.quantity * t.price, 0)),
            startingCents: cents(startingBalance),
        },
        hadYouHeld: heldLots.length === 0 ? null : {
            soldForCents: cents(heldLots.reduce((sum, lot) => sum + lot.quantity * lot.sellPrice, 0)),
            worthNowCents: cents(heldLots.reduce((sum, lot) => sum + lot.quantity * (prices.get(lot.symbol) ?? 0), 0)),
            symbols: priced,
            capped,
        },
    };
};
