// A seeded synthetic market for tests that run the real simulator end to end: every symbol
// any strategy trades (plus SPY), weekday bars with open/high/low, a total-return adjClose
// and a quarterly dividend, and a T-bill series. Deterministic — the same seed draws the
// same universe on every machine. Not a test file itself (vitest picks up *.test.ts).
//
// Each symbol drifts through regimes (the drift flips sign on its own period) at its own
// volatility, so trends cross, momentum ranks reshuffle, calm and wild names trade places,
// channels break and RSI dips: every knob in lib/strategies/whatif.ts has something to act on.

import type {Bar} from '@/lib/prices/signals';
import {addCalendarDays} from '@/lib/dates';
import type {RatePoint} from '@/lib/income/accrual';
import {UNIVERSES} from '@/lib/strategies/universe';
import {BENCHMARK_SYMBOL} from '@/lib/prices/config';

export const SYNTHETIC_LAUNCH = '2030-01-01';

export const weekdayCalendar = (count: number, from: string): string[] => {
    const dates: string[] = [];
    for (let day = from; dates.length < count; day = addCalendarDays(day, 1)) {
        const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
        if (wd !== 0 && wd !== 6) dates.push(day);
    }
    return dates;
};

// mulberry32.
const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const syntheticSeries = (dates: readonly string[], index: number): Bar[] => {
    const next = seeded(7919 * (index + 1));
    const vol = 0.007 + (index % 9) * 0.0025;
    const period = 70 + (index % 5) * 23;
    const phase = (index * 37) % period;
    let close = 40 + index * 3;
    let adj = close;
    return dates.map((date, i) => {
        const previous = close;
        const drift = (Math.floor((i + phase) / period) % 2 === 0 ? 1 : -1) * 0.0012;
        const shock = (next() + next() + next() - 1.5) * 2 * vol;
        const open = previous * (1 + (next() - 0.5) * vol);
        close = Math.max(1, previous * (1 + drift + shock));
        const dividend = (i + index) % 63 === 0 && i > 0 ? Math.round(close * 0.004 * 100) / 100 : 0;
        adj *= (close + dividend) / previous;
        return {
            date,
            open,
            high: Math.max(open, close) * (1 + next() * vol),
            low: Math.min(open, close) * (1 - next() * vol),
            close,
            adjClose: adj,
            dividend,
        };
    });
};

export const ALL_SYNTHETIC_SYMBOLS: readonly string[] = Array.from(new Set([BENCHMARK_SYMBOL, ...Object.values(UNIVERSES).flat()]));

export type SyntheticMarket = {
    dates: string[];
    bars: Map<string, Bar[]>;
    rates: RatePoint[];
};

// `count` weekday bars per symbol, ending well before SYNTHETIC_LAUNCH.
export const syntheticMarket = (count: number, from = '2025-01-06'): SyntheticMarket => {
    const dates = weekdayCalendar(count, from);
    const bars = new Map<string, Bar[]>(ALL_SYNTHETIC_SYMBOLS.map((symbol, index) => [symbol, syntheticSeries(dates, index)]));
    // Every calendar day, stepping partway through so a lookup off by a day would show.
    const rates: RatePoint[] = [];
    for (let day = addCalendarDays(dates[0], -10); day <= dates[dates.length - 1]; day = addCalendarDays(day, 1)) {
        rates.push({date: day, discountPct: day < dates[Math.floor(dates.length / 2)] ? 4.2 : 3.8});
    }
    return {dates, bars, rates};
};
