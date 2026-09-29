// How much the account moves on an ordinary day, in dollars at today's value: the standard
// deviation of its daily log returns, the same measure annualizedVolPct scales by √252.
// Read from the %-since-inception series the /portfolio page already has.

import {describe, expect, it} from 'vitest';
import {dailySwingDollars, MIN_SWING_POINTS} from '@/lib/trading/risk';

const perf = (date: string, accountPct: number) => ({date, accountPct, benchmarkPct: null});

describe('dailySwingDollars', () => {
    it('needs three points: two daily changes make the smallest spread there is', () => {
        expect(MIN_SWING_POINTS).toBe(3);
        expect(dailySwingDollars([], 100_000)).toBeNull();
        expect(dailySwingDollars([perf('2026-08-03', 0), perf('2026-08-04', 1)], 100_000)).toBeNull();
        expect(dailySwingDollars([perf('2026-08-03', 0), perf('2026-08-04', 1), perf('2026-08-05', 0)], 100_000)).not.toBeNull();
    });

    it('is zero for an account that grows by the same step every day', () => {
        const steady = [0, 1, 2.01, 3.0301].map((pct, i) => perf(`2026-08-0${i + 3}`, pct));
        expect(dailySwingDollars(steady, 100_000)?.dollars).toBeCloseTo(0, 6);
    });

    it('is the standard deviation of daily log returns (population, as annualizedVolPct), scaled to today\'s value', () => {
        // Values 100 → 102 → 99.96 → 101.9592: log returns ln(1.02), ln(0.98), ln(1.02).
        const series = [perf('2026-08-03', 0), perf('2026-08-04', 2), perf('2026-08-05', -0.04), perf('2026-08-06', 1.9592)];
        const r = [Math.log(1.02), Math.log(0.98), Math.log(1.02)];
        const mean = r.reduce((a, b) => a + b, 0) / 3;
        const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / 3);
        const swing = dailySwingDollars(series, 50_000);
        expect(swing?.pct).toBeCloseTo(sd * 100, 10);
        expect(swing?.dollars).toBeCloseTo(sd * 50_000, 8);
        expect(swing?.days).toBe(3);
    });

    it('is null for an account with nothing in it', () => {
        const series = [perf('2026-08-03', 0), perf('2026-08-04', 1), perf('2026-08-05', 0)];
        expect(dailySwingDollars(series, 0)).toBeNull();
    });

    it('skips a step it cannot take a log of instead of returning NaN', () => {
        const series = [perf('2026-08-03', 0), perf('2026-08-04', -100), perf('2026-08-05', 1), perf('2026-08-06', 2), perf('2026-08-07', 1)];
        const swing = dailySwingDollars(series, 100_000);
        expect(Number.isFinite(swing?.dollars)).toBe(true);
        expect(swing?.days).toBe(2);
    });
});
