// How much the account moves on an ordinary day, in dollars at today's value: the standard
// deviation of its daily log returns, the same measure annualizedVolPct scales by √252.
// Read from the %-since-inception series the /portfolio page already has.

import {describe, expect, it} from 'vitest';
import {dailySwingDollars, MIN_SWING_POINTS} from '@/lib/trading/learn/risk';

const perf = (date: string, accountPct: number) => ({date, accountPct, benchmarkPct: null});

describe('dailySwingDollars', () => {
    it('needs three points: two daily changes make the smallest spread there is', () => {
        expect(MIN_SWING_POINTS).toBe(3);
        expect(dailySwingDollars([], 100_000, null)).toBeNull();
        expect(dailySwingDollars([perf('2026-08-03', 0), perf('2026-08-04', 1)], 100_000, '2026-08-04')).toBeNull();
        expect(dailySwingDollars([perf('2026-08-03', 0), perf('2026-08-04', 1), perf('2026-08-05', 0)], 100_000, '2026-08-05')).not.toBeNull();
    });

    it('is zero for an account that grows by the same step every day', () => {
        const steady = [0, 1, 2.01, 3.0301].map((pct, i) => perf(`2026-08-0${i + 3}`, pct));
        expect(dailySwingDollars(steady, 100_000, '2026-08-06')?.dollars).toBeCloseTo(0, 6);
    });

    it('is the standard deviation of daily log returns (population, as annualizedVolPct), scaled to today\'s value', () => {
        // Values 100 → 102 → 99.96 → 101.9592: log returns ln(1.02), ln(0.98), ln(1.02).
        const series = [perf('2026-08-03', 0), perf('2026-08-04', 2), perf('2026-08-05', -0.04), perf('2026-08-06', 1.9592)];
        const r = [Math.log(1.02), Math.log(0.98), Math.log(1.02)];
        const mean = r.reduce((a, b) => a + b, 0) / 3;
        const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / 3);
        const swing = dailySwingDollars(series, 50_000, '2026-08-06');
        expect(swing?.pct).toBeCloseTo(sd * 100, 10);
        expect(swing?.dollars).toBeCloseTo(sd * 50_000, 8);
        expect(swing?.days).toBe(3);
    });

    it('is null for an account with nothing in it', () => {
        const series = [perf('2026-08-03', 0), perf('2026-08-04', 1), perf('2026-08-05', 0)];
        expect(dailySwingDollars(series, 0, '2026-08-05')).toBeNull();
    });

    it('skips a step it cannot take a log of instead of returning NaN', () => {
        const series = [perf('2026-08-03', 0), perf('2026-08-04', -100), perf('2026-08-05', 1), perf('2026-08-06', 2), perf('2026-08-07', 1)];
        const swing = dailySwingDollars(series, 100_000, '2026-08-07');
        expect(Number.isFinite(swing?.dollars)).toBe(true);
        expect(swing?.days).toBe(2);
    });
});

// The series the page hands in ends with today's live value. Only closes are days: a live point
// after the last snapshot (a weekend, or a weekday before the 16:10 snapshot) is not a close,
// and a snapshot the weekday cron wrote on a market holiday repeats the day before.
describe('dailySwingDollars counts closes on trading days only', () => {
    // Mon 21 – Fri 25 Sep 2026: four real daily moves.
    const week = [perf('2026-09-21', 0), perf('2026-09-22', 1), perf('2026-09-23', -0.5), perf('2026-09-24', 1.2), perf('2026-09-25', 0.4)];

    it('drops the live point a Saturday appends after Friday\'s snapshot', () => {
        const closes = dailySwingDollars(week, 100_000, '2026-09-25');
        expect(closes?.days).toBe(4);
        const saturday = [...week, perf('2026-09-26', 0.4)];
        expect(dailySwingDollars(saturday, 100_000, '2026-09-25')).toEqual(closes);
    });

    it('keeps today\'s live value once today\'s snapshot exists (it replaced that close)', () => {
        expect(dailySwingDollars(week, 100_000, '2026-09-25')?.days).toBe(4);
        expect(dailySwingDollars(week, 100_000, '2026-09-24')?.days).toBe(3);
    });

    it('skips a snapshot written on a market holiday', () => {
        // Labor Day, Mon 7 Sep 2026: the cron still ran and recorded Friday's value again.
        const withHoliday = [perf('2026-09-03', 0), perf('2026-09-04', 1), perf('2026-09-07', 1), perf('2026-09-08', -0.3), perf('2026-09-09', 0.8)];
        const without = withHoliday.filter((p) => p.date !== '2026-09-07');
        expect(dailySwingDollars(withHoliday, 100_000, '2026-09-09')).toEqual(dailySwingDollars(without, 100_000, '2026-09-09'));
        expect(dailySwingDollars(withHoliday, 100_000, '2026-09-09')?.days).toBe(3);
    });

    it('is null before any snapshot exists', () => {
        expect(dailySwingDollars(week, 100_000, null)).toBeNull();
    });
});
