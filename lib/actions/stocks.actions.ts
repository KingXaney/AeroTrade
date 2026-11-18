'use server';

// The market-data reads client components call: the ⌘K search and the order ticket. Thin
// wrappers — server code imports lib/prices/finnhub.ts and lib/prices/quote-store.ts directly.
// They take no user id, so they read nothing of anyone's.

import {getCurrentUserId} from "@/lib/auth/session";
import {searchQuery, withinSearchLimit} from "@/lib/prices/action-limits";
import {searchStocks as fetchStocks} from "@/lib/prices/finnhub";
import {getSheetQuote} from "@/lib/prices/quote-store";
import {takeRateLimit} from "@/lib/rate-limit";
import type {QuoteData} from '@/lib/prices/types';
import type {Stock} from '@/lib/stocks/types';

// The stock search behind ⌘K, /watchlist's add dialog and the ticket's symbol field — every one
// of them inside the signed-in shell. Each new query is a Finnhub call on the plan's one shared
// minute, so it is the signed-in reader's alone, for a query short enough to be a name
// (lib/prices/action-limits.ts searchQuery, read before anything is spent), and counted per
// reader by the minute. Refused, it answers as a search that found nothing: the boxes draw no
// row. Nothing typed is the popular list, which asks Finnhub nothing and is not counted.
export const searchStocks = async (query?: string): Promise<Stock[]> => {
    const asked = searchQuery(query);
    if (asked === null) return [];
    const userId = await getCurrentUserId();
    if (!userId) return [];
    if (asked && !(await withinSearchLimit(userId, takeRateLimit))) return [];
    return fetchStocks(asked);
};

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
