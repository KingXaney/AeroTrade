// Paper-account knobs: how many accounts a user may keep and the cookie naming the one the UI
// operates on. The starting balance's bounds are starting-balance.ts. Pure and client-safe.

// Paper-trading: max strategy accounts per user.
export const MAX_PAPER_ACCOUNTS = 10;

// HTTP-only cookie holding the id of the strategy account the UI operates on.
export const ACTIVE_ACCOUNT_COOKIE = 'aero-active-account';
