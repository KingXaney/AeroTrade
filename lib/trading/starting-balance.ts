// The starting balance a new or restarted account may hold: the default, the bounds, the
// rule and the range the dialogs and the server both state. Pure and client-safe.

// Paper-trading: default starting virtual cash; users may pick a custom amount
// at account creation / AI enrollment within these bounds.
export const PAPER_STARTING_BALANCE = 100_000;
export const MIN_STARTING_BALANCE = 1_000;
export const MAX_STARTING_BALANCE = 10_000_000;

// "$1,000 and $10,000,000": the dialogs say "Between …", the server STARTING_BALANCE_ERROR.
export const STARTING_BALANCE_RANGE = `$${MIN_STARTING_BALANCE.toLocaleString('en-US')} and $${MAX_STARTING_BALANCE.toLocaleString('en-US')}`;

// The one refusal for a bad balance: create, reset and the Navigator's re-enroll all return it.
export const STARTING_BALANCE_ERROR = `Starting balance must be between ${STARTING_BALANCE_RANGE}`;

// Whole dollars within bounds; undefined means the standard default; null = invalid.
// The starting balance is fixed at creation — editing it mid-flight would corrupt
// every return/benchmark calculation, so changes go through create or reset.
export const resolveStartingBalance = (value?: number): number | null => {
    if (value === undefined) return PAPER_STARTING_BALANCE;
    if (!Number.isFinite(value)) return null;
    const whole = Math.floor(value);
    if (whole < MIN_STARTING_BALANCE || whole > MAX_STARTING_BALANCE) return null;
    return whole;
};
