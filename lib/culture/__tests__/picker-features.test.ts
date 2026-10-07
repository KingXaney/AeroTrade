import {describe, expect, it} from 'vitest';
import {APP_RANK_FLOOR, PERSISTENCE_CAP_WEEKS} from '@/lib/culture/config';
import {
    appRankScore,
    attentionBaseline,
    attentionPersistence,
    attentionSinceReport,
    attentionSurprise,
    attentionTrend,
    logRatioPct,
    sumBetween,
} from '@/lib/culture/picker-features';
import {addCalendarDays} from '@/lib/dates';
import type {AttentionPoint} from '@/lib/culture/types';

const AS_OF = '2026-10-05';

// `days` points ending on AS_OF, each from `valueAt(daysBeforeAsOf)`.
const series = (days: number, valueAt: (back: number) => number): AttentionPoint[] =>
    Array.from({length: days}, (_, i) => {
        const back = days - 1 - i;
        return {date: addCalendarDays(AS_OF, -back), value: valueAt(back)};
    });

describe('attentionSurprise and attentionBaseline', () => {
    it('is null without a month of recent views or three months of baseline', () => {
        expect(attentionSurprise(series(100, () => 100), AS_OF)).toBeNull();
        expect(attentionSurprise(series(400, () => 100).slice(0, 380), AS_OF)).toBeNull();
    });

    it('is zero on a flat series and ln 3 on a tripled month, with the baseline the prior median', () => {
        expect(attentionSurprise(series(400, () => 99), AS_OF)).toBeCloseTo(0, 9);
        const tripled = series(400, (back) => (back < 28 ? 299 : 99));
        expect(attentionSurprise(tripled, AS_OF)).toBeCloseTo(Math.log(3), 9);
        expect(attentionBaseline(tripled, AS_OF)).toBe(99);
    });

    it('never reads a day after asOf', () => {
        const future = [...series(400, () => 99), {date: addCalendarDays(AS_OF, 1), value: 1_000_000}];
        expect(attentionSurprise(future, AS_OF)).toBeCloseTo(0, 9);
    });
});

describe('attentionTrend', () => {
    it('is zero on a flat series, the log change over the window on an exponential one, null when short', () => {
        expect(attentionTrend(series(100, () => 50), AS_OF)).toBeCloseTo(0, 9);
        // Doubling over the ninety-day window: ln 2 end to end.
        const rising = series(100, (back) => Math.exp(Math.log(2) * (89 - back) / 89) * 100 - 1);
        expect(attentionTrend(rising, AS_OF)).toBeCloseTo(Math.log(2), 3);
        expect(attentionTrend(series(50, () => 50), AS_OF)).toBeNull();
    });
});

describe('attentionPersistence', () => {
    it('counts the consecutive weeks above each week’s own prior median, from the latest week back', () => {
        expect(attentionPersistence(series(400, () => 100), AS_OF)).toBe(0);
        expect(attentionPersistence(series(400, (back) => (back < 21 ? 300 : 100)), AS_OF)).toBe(3);
        // A dip in the middle breaks the streak.
        expect(attentionPersistence(series(400, (back) => (back < 7 || (back >= 14 && back < 28) ? 300 : 100)), AS_OF)).toBe(1);
    });

    it('counts a plateau that began long ago, caps at the configured weeks, and is null without its baseline', () => {
        expect(attentionPersistence(series(600, (back) => (back < 250 ? 300 : 100)), AS_OF)).toBe(PERSISTENCE_CAP_WEEKS);
        // A hundred elevated days: fourteen full weeks and a fifteenth whose mean still clears the baseline.
        expect(attentionPersistence(series(600, (back) => (back < 100 ? 300 : 100)), AS_OF)).toBe(15);
        expect(attentionPersistence(series(100, () => 100), AS_OF)).toBeNull();
        expect(attentionPersistence([], AS_OF)).toBeNull();
    });
});

describe('attentionSinceReport', () => {
    it('is null without a report, and the log ratio of the views since it against the six months before it', () => {
        const report = addCalendarDays(AS_OF, -20);
        const doubled = series(400, (back) => (back < 20 ? 199 : 99));
        expect(attentionSinceReport(doubled, null, AS_OF)).toBeNull();
        expect(attentionSinceReport(doubled, AS_OF, AS_OF)).toBeNull();
        expect(attentionSinceReport(doubled, report, AS_OF)).toBeCloseTo(Math.log(2), 9);
        expect(attentionSinceReport(doubled, addCalendarDays(AS_OF, -2), AS_OF)).toBeNull();
    });
});

describe('sumBetween and appRankScore', () => {
    it('sums a window inclusively', () => {
        expect(sumBetween(series(10, () => 5), addCalendarDays(AS_OF, -3), AS_OF)).toBe(20);
        expect(sumBetween(series(10, () => 5), addCalendarDays(AS_OF, 1), addCalendarDays(AS_OF, 5))).toBe(0);
    });

    it('reads the latest chart day inside the week: 1 at the top, 0 at the floor, null off the chart', () => {
        expect(appRankScore([], AS_OF)).toBeNull();
        expect(appRankScore([{date: addCalendarDays(AS_OF, -10), value: 100}], AS_OF)).toBeNull();
        expect(appRankScore([{date: AS_OF, value: 100}], AS_OF)).toBe(1);
        // The latest chart day wins: number one two days ago, number 100 today.
        expect(appRankScore([{date: addCalendarDays(AS_OF, -2), value: 100}, {date: AS_OF, value: 1}], AS_OF)).toBeCloseTo(1 - Math.log(100) / Math.log(APP_RANK_FLOOR), 9);
        expect(appRankScore([{date: addCalendarDays(AS_OF, -2), value: 1}, {date: AS_OF, value: 100}], AS_OF)).toBe(1);
        expect(appRankScore([{date: AS_OF, value: 91}], AS_OF)).toBeCloseTo(1 - Math.log(10) / Math.log(APP_RANK_FLOOR), 9);
    });
});

describe('logRatioPct', () => {
    it('reads a log ratio as the percentage change it is', () => {
        expect(logRatioPct(Math.log(3))).toBeCloseTo(200, 9);
        expect(logRatioPct(0)).toBe(0);
        expect(logRatioPct(Math.log(0.5))).toBeCloseTo(-50, 9);
    });
});
