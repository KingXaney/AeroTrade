// "Trading habits" on /portfolio, assembled from what the page already holds: the account's
// epoch ledger (the one cached getTradeLedger read — no second trade read) and its priced
// positions. The only extra reads are quotes for "had you held": the names most recently sold
// (at most HAD_YOU_HELD_MAX_SYMBOLS) that the portfolio does not already price. A plain server
// module; the maths is lib/trading/habits.ts.

import {buildPriceMap} from "@/lib/trading/account";
import {closedLots, computeHabits, HABITS_MIN_CLOSED_LOTS, hadYouHeldSymbols, type Habits} from "@/lib/trading/habits";
import type {LedgerTrade} from "@/lib/trading/lots";

export type HabitsRead = {habits: Habits | null; closedLots: number};

export const getTradingHabits = async ({ledger, positions, inceptionAt, startingBalance}: {
    ledger: readonly LedgerTrade[];
    positions: readonly {symbol: string; currentPrice?: number; priceStale: boolean}[];
    inceptionAt: number;
    startingBalance: number;
}): Promise<HabitsRead> => {
    const closed = closedLots(ledger).length;
    // Under the threshold there is nothing to describe, and no quote is worth reading.
    if (closed < HABITS_MIN_CLOSED_LOTS) return {habits: null, closedLots: closed};
    const prices = new Map<string, number>();
    for (const p of positions) {
        if (!p.priceStale && typeof p.currentPrice === 'number' && p.currentPrice > 0) prices.set(p.symbol.toUpperCase(), p.currentPrice);
    }

    const missing = hadYouHeldSymbols(ledger).symbols.filter((symbol) => !prices.has(symbol.toUpperCase()));
    if (missing.length > 0) {
        const quotes = await buildPriceMap(missing).catch((error) => {
            console.error('Trading habits: quotes failed', error);
            return new Map<string, {price?: number}>();
        });
        for (const [symbol, info] of quotes) if (typeof info.price === 'number' && info.price > 0) prices.set(symbol, info.price);
    }
    return {habits: computeHabits({ledger, prices, now: Date.now(), inceptionAt, startingBalance}), closedLots: closed};
};
