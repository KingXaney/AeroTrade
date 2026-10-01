// Paper-account knobs: how many accounts a user may keep, the cookie naming the one the UI
// operates on, and the longest note a fill may carry. The starting balance's bounds are
// starting-balance.ts. Pure and client-safe.

// Paper-trading: max strategy accounts per user.
export const MAX_PAPER_ACCOUNTS = 10;

// HTTP-only cookie holding the id of the strategy account the UI operates on.
export const ACTIVE_ACCOUNT_COOKIE = 'aero-active-account';

// The longest reason a trade row stores: the learner's own note from the ticket, or an
// automated caller's explanation. The ticket's field, sanitizeTradeNote, executeOrder and the
// PaperTrade schema all cap at this.
export const TRADE_REASON_MAX = 200;
