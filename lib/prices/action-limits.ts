// How often one signed-in reader may run the two server actions that ask Finnhub on a person's
// say-so, and the counter keys they spend: the stock search (lib/actions/stocks.actions.ts
// searchStocks — one /search call for each query not asked in the last minute) and an order
// (lib/actions/trading.actions.ts placeOrder — a fresh quote, which the quote sheet counts but
// never refuses, and the company's profile). Finnhub's free plan is one minute of 60 calls for
// the whole deployment (lib/prices/config.ts), so without a count one loop on one account keeps
// that minute spent for every reader. lib/rate-limit.ts takeRateLimit does the counting.
//
// Import-free, like lib/auth/limits.ts, so the numbers, the keys and the search's input check are
// unit-tested: lib/prices/__tests__/action-limits.test.ts.

// Each alone stays under the plan's minute — a search is one call, an order at most two. A
// search box asks once per pause in the typing (⌘K, /watchlist's dialog and the ticket's symbol
// field debounce), and an order is a ticket filled in and sent; a loop passes either in seconds.
export const SEARCH_USER_LIMIT = 30;
export const ORDER_USER_LIMIT = 20;
export const ACTION_WINDOW_MS = 60_000;

// The longest query the search reads: a ticker or a company's name, never a paragraph.
export const SEARCH_QUERY_MAX = 40;

export const searchUserKey = (userId: string): string => `search:${userId}`;
export const orderUserKey = (userId: string): string => `order:${userId}`;

// A server action's argument is whatever the client posted, whatever its type says. The search
// reads one string of at most SEARCH_QUERY_MAX characters, trimmed; nothing typed is the empty
// query (the popular list, which asks Finnhub nothing). Anything else is null: no search at all.
export const searchQuery = (input: unknown): string | null => {
    if (input === undefined) return '';
    if (typeof input !== 'string') return null;
    const query = input.trim();
    return query.length <= SEARCH_QUERY_MAX ? query : null;
};

// One counter step, as takeRateLimit takes it: true while `key` is within `limit` for its window.
export type TakeCounter = (key: string, limit: number, windowMs: number) => Promise<boolean>;

// One step of the reader's counter: true while they are within the minute's count.
export const withinSearchLimit = (userId: string, take: TakeCounter): Promise<boolean> =>
    take(searchUserKey(userId), SEARCH_USER_LIMIT, ACTION_WINDOW_MS);

export const withinOrderLimit = (userId: string, take: TakeCounter): Promise<boolean> =>
    take(orderUserKey(userId), ORDER_USER_LIMIT, ACTION_WINDOW_MS);
