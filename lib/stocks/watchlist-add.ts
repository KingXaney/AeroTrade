// The rows of /watchlist's own add dialog (components/stocks/AddToWatchlist.tsx) for the text in
// its box. Pure, so the rule is unit-tested: lib/stocks/__tests__/watchlist-add.test.ts.
//
// A pick there is a write — the row joins the reader's watchlist — and Enter runs the selected
// row, so the stock rows follow ⌘K's rule (lib/shell/palette.ts): while the search for the query
// in the box is out there is no row at all, never an earlier query's. Two things are the dialog's own:
//   - a stock already on the watchlist stays in a search's answer, marked (the dialog draws it
//     as a row that cannot be run), so searching for it never reads as "not found" — and is left
//     out of the suggestions shown before anything is typed, which are there to be picked;
//   - the suggestions carry their companies' names (lib/stocks/popular.ts), since the name a row
//     shows is the name the watchlist saves.

import {paletteRows, type StockAnswer} from '@/lib/shell/palette';
import {POPULAR_STOCK_NAMES, POPULAR_STOCK_SYMBOLS} from '@/lib/stocks/popular';
import type {Stock} from '@/lib/stocks/types';

// The popular stocks as search rows, named. No request: the list is the app's own.
export const popularStocks = (): Stock[] =>
    POPULAR_STOCK_SYMBOLS.map((symbol) => ({
        symbol,
        name: POPULAR_STOCK_NAMES[symbol] ?? symbol,
        exchange: '',
        type: 'Common Stock',
    }));

// Finnhub's search names a company in capitals ("APPLE INC"). A name with letters and none of
// them small is one of those: lib/actions/watchlist.actions.ts saves the profile's instead.
export const isShouting = (name: string): boolean => /\p{Lu}/u.test(name) && !/\p{Ll}/u.test(name);

export type AddRow = {stock: Stock; tracked: boolean};   // tracked: already on the watchlist

export type AddRows = {
    query: string;        // the text in the box, trimmed
    searching: boolean;   // the search for this query has not answered yet
    unavailable: boolean; // it was asked for this query and did not answer: not "found nothing"
    suggested: boolean;   // nothing typed: the rows are the suggestions
    rows: AddRow[];
};

const keyOf = (symbol: string): string => symbol.trim().toUpperCase();

export const addRows = ({term, answer, tracked, popular}: {
    term: string;
    answer: StockAnswer<Stock> | null;   // the newest answer the search gave, for whichever query
    tracked: readonly string[];          // the symbols on the watchlist now
    popular: readonly Stock[];
}): AddRows => {
    const onList = new Set(tracked.map(keyOf));
    const isTracked = (stock: Stock): boolean => onList.has(keyOf(stock.symbol));
    // topicMax 0: the dialog has no topic row.
    const view = paletteRows({term, answer, popular: popular.filter((stock) => !isTracked(stock)), topicMax: 0});
    return {
        query: view.query,
        searching: view.searching,
        unavailable: view.unavailable,
        suggested: !view.query,
        rows: view.stocks.map((stock) => ({stock, tracked: isTracked(stock)})),
    };
};
