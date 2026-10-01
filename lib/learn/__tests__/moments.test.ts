import {describe, expect, it} from 'vitest';
import type {LearnFacts} from '@/lib/learn/facts';
import {
    DRAWDOWN_MOMENT_THRESHOLD,
    LESSONS_SEEN_CAP,
    MAX_LESSON_KEY_CHARS,
    MOMENT_PRIORITY,
    deriveMoments,
    firstDrawdownCrossing,
    lessonKey,
    parseLessonId,
    shiftDate,
} from '@/lib/learn/moments';

const TODAY = '2026-09-29';

const none: LearnFacts = {
    today: TODAY,
    accountCreatedOn: '2026-09-20',
    hasUserTrade: false,
    followedStrategies: [],
    topicOpened: false,
    hasWatchlist: false,
    navigatorEnrolled: false,
    missionsDismissedAt: null,
    firstFill: null,
    firstSell: null,
    firstDividend: null,
    firstDrawdown: null,
    rebalances: [],
    lessonsSeen: [],
};

const all: LearnFacts = {
    ...none,
    hasUserTrade: true,
    firstFill: {date: '2026-09-22', symbol: 'SPY', side: 'buy', quantity: 3, price: 500},
    firstSell: {date: '2026-09-25', symbol: 'SPY', quantity: 1, price: 510, realizedPnl: 10},
    firstDividend: {date: '2026-09-28', symbol: 'SPY', amount: 5.67, perShare: 1.889, quantity: 3, exDate: '2026-09-23'},
    firstDrawdown: {date: '2026-09-26', peakDate: '2026-09-23', peakValue: 102_000, value: 96_000, pct: 0.0588},
    rebalances: [
        {strategyId: 'momentum-12-1', date: '2026-09-28', traded: true},
        {strategyId: 'sixty-forty', date: '2026-09-27', traded: false},
    ],
};

const kinds = (facts: LearnFacts, today = TODAY) => deriveMoments(facts, today).map((m) => m.kind);

describe('deriveMoments', () => {
    it('is empty for an account with no firsts', () => {
        expect(deriveMoments(none, TODAY)).toEqual([]);
    });

    it('orders dividend > drawdown > sell > fill > rebalance', () => {
        expect(MOMENT_PRIORITY).toEqual(['first-dividend', 'first-drawdown', 'first-sell', 'first-fill', 'rebalance']);
        expect(kinds(all)).toEqual(['first-dividend', 'first-drawdown', 'first-sell', 'first-fill', 'rebalance', 'rebalance']);
    });

    it('dates each moment by the day it happened', () => {
        const byKind = Object.fromEntries(deriveMoments(all, TODAY).map((m) => [m.kind, m.occurredOn]));
        expect(byKind).toMatchObject({'first-dividend': '2026-09-28', 'first-drawdown': '2026-09-26', 'first-sell': '2026-09-25', 'first-fill': '2026-09-22'});
    });

    it('keeps a first for seven days and a rebalance for three', () => {
        expect(kinds({...none, firstFill: {...all.firstFill!, date: '2026-09-22'}})).toEqual(['first-fill']);
        expect(kinds({...none, firstFill: {...all.firstFill!, date: '2026-09-21'}})).toEqual([]);
        expect(kinds({...none, rebalances: [{strategyId: 'sixty-forty', date: '2026-09-26', traded: true}]})).toEqual(['rebalance']);
        expect(kinds({...none, rebalances: [{strategyId: 'sixty-forty', date: '2026-09-25', traded: true}]})).toEqual([]);
        expect(deriveMoments({...none, firstFill: all.firstFill}, TODAY, {windowDays: 3}).map((m) => m.kind)).toEqual([]);
    });

    it('hides a drawdown that happened outside the window', () => {
        expect(kinds({...none, firstDrawdown: {...all.firstDrawdown!, date: '2026-09-15'}})).toEqual([]);
    });

    it('never shows a moment dated after today', () => {
        expect(kinds({...none, firstSell: {...all.firstSell!, date: '2026-09-30'}})).toEqual([]);
    });

    it('hides what was marked seen, by its own key', () => {
        const seen = ['first-dividend', 'first-fill', 'rebalance:momentum-12-1:2026-09-28'];
        expect(kinds({...all, lessonsSeen: seen})).toEqual(['first-drawdown', 'first-sell', 'rebalance']);
        // A later rebalance of the same strategy is a new moment.
        expect(kinds({...none, lessonsSeen: ['rebalance:sixty-forty:2026-07-01'], rebalances: [{strategyId: 'sixty-forty', date: '2026-09-28', traded: true}]}))
            .toEqual(['rebalance']);
    });

    it('lists the newest rebalance first', () => {
        const rebalances = deriveMoments(all, TODAY).filter((m) => m.kind === 'rebalance');
        expect(rebalances.map((m) => lessonKey(m.id))).toEqual(['rebalance:momentum-12-1:2026-09-28', 'rebalance:sixty-forty:2026-09-27']);
    });

    it('skips a strategy that re-checks every trading day, and an unknown one', () => {
        expect(kinds({...none, rebalances: [{strategyId: 'golden-cross', date: TODAY, traded: true}]})).toEqual([]);
        expect(kinds({...none, rebalances: [{strategyId: 'nope' as 'golden-cross', date: TODAY, traded: true}]})).toEqual([]);
        expect(kinds({...none, rebalances: [{strategyId: 'buy-and-hold-spy', date: TODAY, traded: true}]})).toEqual(['rebalance']);
    });
});

describe('lessonKey and parseLessonId', () => {
    it('keys a first by its kind and a rebalance by strategy and date', () => {
        expect(lessonKey('first-sell')).toBe('first-sell');
        expect(lessonKey({kind: 'rebalance', strategyId: 'rsi2-mean-reversion', date: '2026-09-28'})).toBe('rebalance:rsi2-mean-reversion:2026-09-28');
    });

    it('accepts the four firsts and a well-formed rebalance', () => {
        for (const id of ['first-dividend', 'first-drawdown', 'first-sell', 'first-fill'] as const) {
            expect(parseLessonId(id)).toBe(id);
        }
        expect(parseLessonId({kind: 'rebalance', strategyId: 'sixty-forty', date: '2026-09-28'}))
            .toEqual({kind: 'rebalance', strategyId: 'sixty-forty', date: '2026-09-28'});
    });

    it('rejects anything else', () => {
        for (const bad of [
            'first-quiz', '', null, undefined, 3, {}, ['first-fill'], 'x'.repeat(200),
            {kind: 'rebalance', strategyId: 'not-a-strategy', date: '2026-09-28'},
            {kind: 'rebalance', strategyId: 'sixty-forty', date: '2026-9-28'},
            {kind: 'rebalance', strategyId: 'sixty-forty', date: '2026-02-30'},
            {kind: 'rebalance', strategyId: 'sixty-forty', date: '2026-09-28', extra: 1},
            {kind: 'first-fill'},
            {$set: {learn: 1}},
        ]) {
            expect(parseLessonId(bad), JSON.stringify(bad)).toBeNull();
        }
    });

    it('keeps every accepted key within the stored cap', () => {
        expect(lessonKey({kind: 'rebalance', strategyId: 'rsi2-mean-reversion', date: '2026-09-28'}).length).toBeLessThanOrEqual(MAX_LESSON_KEY_CHARS);
        expect(MAX_LESSON_KEY_CHARS).toBe(64);
        expect(LESSONS_SEEN_CAP).toBe(32);
    });
});

describe('firstDrawdownCrossing', () => {
    const series = (accountId: string, start: string, values: number[]) =>
        values.map((totalValue, i) => ({accountId, date: shiftDate(start, i), totalValue}));

    it('dates the first day the account stood 5% below its running peak', () => {
        const points = series('a', '2026-09-10', [100_000, 102_000, 99_000, 96_900, 95_000]);
        expect(DRAWDOWN_MOMENT_THRESHOLD).toBe(0.05);
        const hit = firstDrawdownCrossing(points);
        expect(hit).toMatchObject({date: '2026-09-13', peakDate: '2026-09-11', peakValue: 102_000, value: 96_900});
        expect(hit!.pct).toBeCloseTo(0.05, 6);
    });

    it('dates the fall from the latest of several equal highs', () => {
        const hit = firstDrawdownCrossing(series('a', '2026-09-01', [100_000, 100_000, 100_000, 100_000, 97_000, 94_000]));
        expect(hit).toMatchObject({date: '2026-09-06', peakDate: '2026-09-04', peakValue: 100_000, value: 94_000});
    });

    it('is null when no fall reaches the threshold', () => {
        expect(firstDrawdownCrossing(series('a', '2026-09-10', [100_000, 101_000, 97_000, 104_000]))).toBeNull();
        expect(firstDrawdownCrossing([])).toBeNull();
    });

    it('keeps accounts apart and returns the earliest crossing', () => {
        const points = [
            ...series('late', '2026-09-10', [100_000, 90_000]),      // crosses 09-11
            ...series('early', '2026-09-08', [50_000, 47_000]),      // crosses 09-09
            ...series('mixed', '2026-09-08', [200_000, 210_000]),
        ];
        expect(firstDrawdownCrossing(points)).toMatchObject({date: '2026-09-09', peakDate: '2026-09-08'});
        // Interleaved accounts would fake a fall if they were one series.
        expect(firstDrawdownCrossing([...series('big', '2026-09-08', [200_000, 200_000]), ...series('small', '2026-09-08', [50_000, 50_000])])).toBeNull();
    });

    it('sorts by date and ignores values that are not positive and finite', () => {
        const points = [
            {accountId: 'a', date: '2026-09-12', totalValue: 94_000},
            {accountId: 'a', date: '2026-09-10', totalValue: 100_000},
            {accountId: 'a', date: '2026-09-11', totalValue: Number.NaN},
            {accountId: 'a', date: '2026-09-11', totalValue: 0},
        ];
        expect(firstDrawdownCrossing(points)).toMatchObject({date: '2026-09-12', peakDate: '2026-09-10'});
    });
});

describe('shiftDate', () => {
    it('moves an ET date by whole days across month and year ends', () => {
        expect(shiftDate('2026-09-29', -30)).toBe('2026-08-30');
        expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
        expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    });
});
