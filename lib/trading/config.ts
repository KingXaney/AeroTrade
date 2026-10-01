// Paper-account knobs: the starting cash a new account may hold, how many accounts a user may
// keep, and the cookie naming the one the UI operates on. Pure and client-safe — the account
// dialogs read the bounds too.

// Paper-trading: default starting virtual cash; users may pick a custom amount
// at account creation / AI enrollment within these bounds.
export const PAPER_STARTING_BALANCE = 100_000;
export const MIN_STARTING_BALANCE = 1_000;
export const MAX_STARTING_BALANCE = 10_000_000;

// Paper-trading: max strategy accounts per user.
export const MAX_PAPER_ACCOUNTS = 10;

// HTTP-only cookie holding the id of the strategy account the UI operates on.
export const ACTIVE_ACCOUNT_COOKIE = 'aero-active-account';
