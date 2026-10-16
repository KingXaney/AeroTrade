// Paper-account knobs: how many accounts a user may keep, the cookie naming the one the UI
// operates on, and the longest note a fill may carry. The starting balance's bounds are
// starting-balance.ts. Pure and client-safe.

// Paper-trading: max paper accounts per user.
export const MAX_PAPER_ACCOUNTS = 10;

// HTTP-only cookie holding the id of the paper account the UI operates on.
export const ACTIVE_ACCOUNT_COOKIE = 'aero-active-account';

// The longest reason a trade row stores: the learner's own note from the ticket, or an
// automated caller's explanation. The ticket's field, sanitizeTradeNote, executeOrder and the
// PaperTrade schema all cap at this.
export const TRADE_REASON_MAX = 200;

// The trade log's page size: getTradeHistory's bounded read, and the tail a page slices from the
// ledger it already holds (/portfolio).
export const TRADE_HISTORY_LIMIT = 50;

// How old a stored daily close may be and still stand in for a quote Finnhub did not give
// (lib/trading/valuation.buildHoldingsPriceMap): a long weekend and a holiday, never an old
// history. The nightly income job tops up the bars of every held symbol, so a held symbol's
// newest close is normally the last session's.
export const CLOSE_FALLBACK_DAYS = 7;
