// Chips as the table draws them: an amount broken into a few short stacks of coloured chips
// (components/poker-night ChipStack), and a stack's count in the short form a phone's seat plate
// has room for. Pure and client-safe. The drawing is decoration — the amount is always printed as
// text beside it, so a breakdown that cannot show every chip shows the largest ones.
//
// Denominations follow a casino rack. Each colour comes from the chip set's registry through
// [data-denom] (lib/poker-night/looks, P5), never from here.

export const DENOMINATIONS = [1, 5, 25, 100, 500, 1000, 5000, 25000] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

// At most this many columns of at most this many chips.
export const CHIP_COLUMNS = 3;
export const CHIPS_PER_COLUMN = 8;

export type ChipColumn = {denom: Denomination; count: number};

// The amount in the fewest chips, largest first, then the largest CHIP_COLUMNS denominations
// drawn, each capped at CHIPS_PER_COLUMN chips. Nothing for zero or less.
export const chipBreakdown = (amount: number): ChipColumn[] => {
    let left = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    const columns: ChipColumn[] = [];
    for (let i = DENOMINATIONS.length - 1; i >= 0 && left > 0; i--) {
        const denom = DENOMINATIONS[i];
        const count = Math.floor(left / denom);
        if (count === 0) continue;
        left -= count * denom;
        columns.push({denom, count});
    }
    return columns.slice(0, CHIP_COLUMNS).map((c) => ({denom: c.denom, count: Math.min(CHIPS_PER_COLUMN, c.count)}));
};

// The chips a breakdown draws, added up (at most the amount).
export const drawnValue = (columns: readonly ChipColumn[]): number => columns.reduce((sum, c) => sum + c.denom * c.count, 0);

// From this count on, a plate prints the short form.
export const COMPACT_FROM = 100_000;

const trim = (n: number, digits: number): string => n.toFixed(digits).replace(/\.?0+$/, '');

// A count as a seat plate prints it: "12,500" in full below COMPACT_FROM, then "125k", "1.25M".
export const compactChips = (n: number): string => {
    const value = Math.max(0, Math.floor(n));
    if (value < COMPACT_FROM) return value.toLocaleString('en-US');
    if (value < 1_000_000) return `${trim(Math.floor(value / 100) / 10, 1)}k`;
    return `${trim(Math.floor(value / 10_000) / 100, 2)}M`;
};

// ── a winner's stack counting up (components/poker-night/CountUp) ──

// The count `elapsed` ms into a count-up of `length` ms from `from` to `to`: easing out, whole
// chips, never past either end; the end itself once the time is up (or when there is no time).
export const countUpValue = (from: number, to: number, elapsed: number, length: number): number => {
    if (!(length > 0) || elapsed >= length) return to;
    if (elapsed <= 0) return from;
    const p = elapsed / length;
    const eased = 1 - (1 - p) ** 3;
    const value = Math.round(from + (to - from) * eased);
    return to >= from ? Math.min(to, Math.max(from, value)) : Math.max(to, Math.min(from, value));
};

// A CSS time as the motion token holds it ("200ms", " 0.2s", "0ms"), in ms; 0 for anything else.
export const cssTimeMs = (text: string): number => {
    const m = /^\s*(-?\d*\.?\d+)(ms|s)\s*$/.exec(text);
    if (!m) return 0;
    const n = Number(m[1]) * (m[2] === 's' ? 1000 : 1);
    return Number.isFinite(n) && n > 0 ? n : 0;
};
