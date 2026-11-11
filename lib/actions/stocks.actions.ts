'use server';

// The market-data reads client components call: the ⌘K search and the order ticket. Thin
// wrappers — server code imports lib/prices/finnhub.ts and lib/prices/quote-store.ts directly.
// They take no user id, so they read nothing of anyone's.

import {getCurrentUserId} from "@/lib/auth/session";
import {searchStocks as fetchStocks} from "@/lib/prices/finnhub";
import {getSheetQuote} from "@/lib/prices/quote-store";
import type {QuoteData} from '@/lib/prices/types';
import type {Stock} from '@/lib/stocks/types';

export const searchStocks = async (query?: string): Promise<Stock[]> => fetchStocks(query);

// The ticket's "Last Price": the quote sheet's price for this window — the one the page's
// positions are valued at — as Finnhub's `c` and `dp`. No price is exactly {} (the order then
// fills, or refuses, at the quote executeOrder asks for itself). A read of the sheet may ask
// Finnhub and store a row, so it is the signed-in reader's alone, and only for something shaped
// like a ticker (lib/prices/quotes.normalizeSymbols): every export here is a public endpoint.
export const getQuote = async (symbol: string): Promise<QuoteData> => {
    if (typeof symbol !== 'string' || !(await getCurrentUserId())) return {};
    const quote = await getSheetQuote(symbol, {wait: 'current'});
    if (!quote) return {};
    return typeof quote.changePercent === 'number' ? {c: quote.price, dp: quote.changePercent} : {c: quote.price};
};
