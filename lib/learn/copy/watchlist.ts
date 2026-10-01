// What /watchlist and /history say when the watchlist read failed (getWatchlistForUser → null),
// in place of the empty state, which would tell someone with a watchlist that it is empty.
// The test holds it to the 'copy' tier of lib/learn/banned.ts. Import-free.

export const WATCHLIST_COPY = {
    unavailable: 'Your watchlist could not be loaded right now — try again in a few minutes.',
} as const;
