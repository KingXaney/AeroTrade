// Forward returns for a signal check (lib/research/ic): from one session's open — the fill — to
// another's, with the dividends that went ex after the first and on or before the second, per
// share bought at the first. Pure. Dividends are the stored per-share amounts inferred inside one
// Yahoo payload (lib/prices/yahoo), never adjcloses compared across fetches (invariant 11).

import type {Bar} from "@/lib/prices/signals";

type PricedBar = {date: string; open?: number; close: number};
export type BarBook = {byDate: Map<string, PricedBar>; dividends: {date: string; amount: number}[]};

export const bookOf = (bars: readonly Bar[]): BarBook => ({
    byDate: new Map(bars.map((bar) => [bar.date, bar])),
    dividends: bars.filter((bar) => typeof bar.dividend === 'number' && bar.dividend > 0).map((bar) => ({date: bar.date, amount: bar.dividend as number})),
});

const fillPrice = (bar: PricedBar | undefined): number | null => {
    if (!bar) return null;
    const price = typeof bar.open === 'number' && bar.open > 0 ? bar.open : bar.close;
    return price > 0 ? price : null;
};

export const forwardReturn = (book: BarBook | undefined, from: string, to: string): number | null => {
    if (!book) return null;
    const start = fillPrice(book.byDate.get(from));
    const end = fillPrice(book.byDate.get(to));
    if (start === null || end === null) return null;
    const paid = book.dividends.filter((d) => d.date > from && d.date <= to).reduce((sum, d) => sum + d.amount, 0);
    return (end + paid) / start - 1;
};

// A book per symbol, built on first use.
export const bookShelf = (bars: ReadonlyMap<string, readonly Bar[]>): ((symbol: string) => BarBook | undefined) => {
    const books = new Map<string, BarBook>();
    return (symbol) => {
        if (!books.has(symbol)) {
            const series = bars.get(symbol);
            if (series) books.set(symbol, bookOf(series));
        }
        return books.get(symbol);
    };
};
