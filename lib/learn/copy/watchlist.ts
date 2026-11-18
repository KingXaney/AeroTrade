// The watchlist's own sentences. `unavailable` is what /watchlist and /history say when the
// watchlist read failed (getWatchlistForUser → null), in place of the empty state, which would
// tell someone with a watchlist that it is empty. `add` is /watchlist's own way to add a stock
// (components/stocks/AddToWatchlist.tsx): the button in the page title and in the empty panel,
// and the dialog it opens. The test holds every sentence to the 'copy' tier of
// lib/learn/banned.ts. Import-free.

export const WATCHLIST_COPY = {
    unavailable: 'Your watchlist could not be loaded right now — try again in a few minutes.',
    add: {
        button: 'Add a stock',
        // The first-week step's own words (lib/learn/copy/missions.ts).
        title: 'Add a stock to your watchlist',
        lead: 'Search by company name or ticker, then pick a stock. Watching one places no order.',
        searchLabel: 'Search stocks',
        placeholder: 'Company name or ticker',
        popular: 'Popular stocks',
        results: 'Stocks',
        searching: 'Searching…',
        // Nothing typed, and every suggestion is on the list already.
        hint: 'Type a company name or a ticker to search.',
        none: (query: string): string => `No stocks found for “${query}”.`,
        tracked: 'On your watchlist',
        adding: 'Adding…',
        // WatchlistButton's own words for the same thing.
        added: (symbol: string): string => `${symbol} added to watchlist`,
        failed: 'Could not add to your watchlist — try again in a moment.',
        close: 'Close',
    },
} as const;
