// The starting balance a new or restarted account may hold. Pure and client-safe.

import {MAX_STARTING_BALANCE, MIN_STARTING_BALANCE, PAPER_STARTING_BALANCE} from "@/lib/trading/config";

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
