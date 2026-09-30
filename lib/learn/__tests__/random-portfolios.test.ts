// Luck or skill: the pure layer. A seeded sample of random five-stock portfolios held over the
// learner's own window, equal-weight in whole shares with dividends kept as cash; where the
// learner's snapshot return lands among them; and the rule that decides the window (it ends on
// the last snapshot's date, and the learner's marker is withheld — never replaced by a live
// at-cost value — when holdings are unpriced and there is no snapshot on the latest session).

import {describe, expect, it} from 'vitest';
import {
    buildLuckView,
    createDayMemo,
    histogram,
    holdInputs,
    holdReturn,
    LUCK_MIN_POOL,
    LUCK_MIN_SESSIONS,
    LUCK_PORTFOLIO_SIZE,
    LUCK_SAMPLE_COUNT,
    luckWindow,
    medianOf,
    mulberry32,
    percentileRank,
    samplePortfolios,
    seedFrom,
    sessionOnOrBefore,
    sessionsBetween,
    type HoldInput,
} from '@/lib/learn/random-portfolios';

const input = (symbol: string, startClose: number, endClose: number, dividendsPerShare = 0): HoldInput =>
    ({symbol, startClose, endClose, dividendsPerShare});

describe('mulberry32 and seedFrom', () => {
    it('repeats the same stream for the same seed and differs for another', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        const c = mulberry32(43);
        const first = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(first);
        expect([c(), c(), c()]).not.toEqual(first);
        expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
    });

    it('seeds from the account and the date, so a day and an account each get their own sample', () => {
        expect(seedFrom('acc1', '2026-09-25')).toBe(seedFrom('acc1', '2026-09-25'));
        expect(seedFrom('acc1', '2026-09-25')).not.toBe(seedFrom('acc1', '2026-09-26'));
        expect(seedFrom('acc1', '2026-09-25')).not.toBe(seedFrom('acc2', '2026-09-25'));
    });
});

describe('samplePortfolios', () => {
    const pool = Array.from({length: 40}, (_, i) => `S${String(i).padStart(2, '0')}`);

    it('draws the requested count of distinct five-name portfolios from the pool, deterministically', () => {
        const one = samplePortfolios(pool, {count: 200, size: 5, random: mulberry32(7)});
        const two = samplePortfolios(pool, {count: 200, size: 5, random: mulberry32(7)});
        expect(one).toEqual(two);
        expect(one).toHaveLength(200);
        for (const portfolio of one) {
            expect(new Set(portfolio).size).toBe(5);
            expect(portfolio.every((s) => pool.includes(s))).toBe(true);
        }
        // Every name gets drawn somewhere: the sample is spread over the whole pool.
        expect(new Set(one.flat()).size).toBe(40);
    });

    it('does not depend on the order the pool arrives in', () => {
        const shuffled = [...pool].reverse();
        expect(samplePortfolios(shuffled, {count: 20, size: 5, random: mulberry32(1)}))
            .toEqual(samplePortfolios(pool, {count: 20, size: 5, random: mulberry32(1)}));
    });

    it('draws nothing from a pool smaller than a portfolio', () => {
        expect(samplePortfolios(['A', 'B', 'C'], {count: 10, size: 5, random: mulberry32(1)})).toEqual([]);
    });
});

describe('holdInputs', () => {
    it('pairs each symbol\'s two edge closes and sums the dividends with ex-dates inside the window', () => {
        const map = holdInputs(
            [
                {symbol: 'AAA', date: '2026-08-03', close: 100},
                {symbol: 'AAA', date: '2026-09-25', close: 110},
                {symbol: 'BBB', date: '2026-08-03', close: 50},   // no end bar: left out
                {symbol: 'CCC', date: '2026-09-25', close: 20},   // no start bar: left out
                {symbol: 'DDD', date: '2026-08-03', close: 0},    // a zero close is not a price
                {symbol: 'DDD', date: '2026-09-25', close: 5},
            ],
            [
                {symbol: 'AAA', exDate: '2026-08-03', perShare: 9},    // on the buy day: the seller keeps it
                {symbol: 'AAA', exDate: '2026-08-20', perShare: 0.5},
                {symbol: 'AAA', exDate: '2026-09-25', perShare: 0.25}, // on the last day: held at the close before
                {symbol: 'AAA', exDate: '2026-09-26', perShare: 7},    // after the window
            ],
            '2026-08-03',
            '2026-09-25',
        );
        expect([...map.keys()]).toEqual(['AAA']);
        expect(map.get('AAA')).toEqual({symbol: 'AAA', startClose: 100, endClose: 110, dividendsPerShare: 0.75});
    });
});

describe('holdReturn', () => {
    it('buys equal dollar amounts in whole shares, keeps the rest as cash, and counts dividends as cash', () => {
        const inputs = new Map([
            ['AAA', input('AAA', 30, 33, 1)],   // $500 → 16 shares ($480), $20 left
            ['BBB', input('BBB', 70, 63)],      // $500 → 7 shares ($490), $10 left
        ]);
        const result = holdReturn(['AAA', 'BBB'], inputs, 1000);
        // cash 30 + 16 × (33 + 1) + 7 × 63 = 30 + 544 + 441 = 1015
        expect(result?.cash).toBeCloseTo(30, 9);
        expect(result?.endValue).toBeCloseTo(1015, 9);
        expect(result?.returnPct).toBeCloseTo(1.5, 9);
    });

    it('holds cash when a share costs more than its slice, and is null for a symbol with no prices', () => {
        const inputs = new Map([['BIG', input('BIG', 900, 1800)]]);
        expect(holdReturn(['BIG'], inputs, 500)?.returnPct).toBe(0);
        expect(holdReturn(['BIG', 'NOPE'], inputs, 5000)).toBeNull();
        expect(holdReturn([], inputs, 5000)).toBeNull();
    });
});

describe('percentileRank, medianOf, histogram', () => {
    it('counts the portfolios strictly below and never rounds a share up', () => {
        const sorted = [1, 2, 2, 3, 4, 5, 6, 7, 8, 9];
        expect(percentileRank(sorted, 2)).toEqual({below: 1, pct: 10});
        expect(percentileRank(sorted, 2.5)).toEqual({below: 3, pct: 30});
        expect(percentileRank(sorted, 100)).toEqual({below: 10, pct: 100});
        expect(percentileRank(sorted, 0)).toEqual({below: 0, pct: 0});
        const many = Array.from({length: 1000}, (_, i) => i);
        expect(percentileRank(many, 995.5)).toEqual({below: 996, pct: 99});
    });

    it('takes the middle of an odd list and the mean of the two middles of an even one', () => {
        expect(medianOf([1, 2, 9])).toBe(2);
        expect(medianOf([1, 2, 4, 9])).toBe(3);
        expect(medianOf([])).toBeNull();
    });

    it('bins every value into equal-width bins whose span also covers the markers', () => {
        const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        const h = histogram(values, 4, [-4]);
        expect(h.min).toBe(-4);
        expect(h.max).toBe(11);
        expect(h.counts).toHaveLength(4);
        expect(h.counts.reduce((a, b) => a + b, 0)).toBe(values.length);
        // the maximum lands in the last bin, not past it
        expect(h.counts[3]).toBeGreaterThan(0);
        const flat = histogram([2, 2, 2], 24);
        expect(flat.max).toBeGreaterThan(flat.min);
        expect(flat.counts.reduce((a, b) => a + b, 0)).toBe(3);
    });
});

describe('trading sessions', () => {
    it('counts NYSE sessions after the start and through the end', () => {
        // Fri Sep 4 2026 → Fri Sep 11: Labor Day (Sep 7) is closed.
        expect(sessionsBetween('2026-09-04', '2026-09-11')).toBe(4);
        expect(sessionsBetween('2026-09-11', '2026-09-11')).toBe(0);
        expect(sessionsBetween('2026-09-11', '2026-09-04')).toBe(0);
    });

    it('moves a weekend or holiday back to the session before it', () => {
        expect(sessionOnOrBefore('2026-09-07')).toBe('2026-09-04');
        expect(sessionOnOrBefore('2026-09-06')).toBe('2026-09-04');
        expect(sessionOnOrBefore('2026-09-08')).toBe('2026-09-08');
    });
});

describe('luckWindow', () => {
    const base = {inceptionDate: '2026-08-03', lastSession: '2026-09-25', unpriced: 0};
    const snap = (date: string, totalValue = 103_000) => ({date, totalValue, startingBalance: 100_000});

    it('ends on the latest session when the account has a snapshot that day, with the snapshot\'s return', () => {
        const w = luckWindow({...base, lastSnapshot: snap('2026-09-25')});
        expect(w).toMatchObject({start: '2026-08-03', end: '2026-09-25', yoursPct: expect.closeTo(3, 9), withheld: null});
        expect(w?.sessions).toBe(sessionsBetween('2026-08-03', '2026-09-25'));
    });

    it('otherwise ends on the last snapshot\'s date while every holding is priced', () => {
        const w = luckWindow({...base, lastSnapshot: snap('2026-09-19', 98_000)});
        // a Saturday snapshot is the Friday close
        expect(w).toMatchObject({end: '2026-09-18', yoursPct: expect.closeTo(-2, 9), withheld: null});
    });

    it('withholds the learner\'s marker with unpriced holdings and no snapshot on the latest session', () => {
        const w = luckWindow({...base, unpriced: 1, lastSnapshot: snap('2026-09-18')});
        expect(w).toMatchObject({end: '2026-09-25', yoursPct: null, withheld: 'unpriced'});
        // …but a snapshot on the latest session is a real close, priced or not today
        expect(luckWindow({...base, unpriced: 2, lastSnapshot: snap('2026-09-25')})).toMatchObject({yoursPct: expect.closeTo(3, 9), withheld: null});
    });

    it('withholds it without a note when there is no snapshot at all, and starts on the session before a weekend inception', () => {
        const w = luckWindow({...base, inceptionDate: '2026-08-02', lastSnapshot: null});
        expect(w).toMatchObject({start: '2026-07-31', end: '2026-09-25', yoursPct: null, withheld: 'no-snapshot'});
    });

    it('has no window without a stored session, or before the account existed', () => {
        expect(luckWindow({...base, lastSession: null, lastSnapshot: null})).toBeNull();
        expect(luckWindow({...base, lastSession: '2026-07-01', lastSnapshot: null})).toBeNull();
    });
});

describe('buildLuckView', () => {
    const universe = Array.from({length: 40}, (_, i) => `L${String(i).padStart(2, '0')}`);
    // Large cap i returns exactly i% over the window (prices that divide $20,000 evenly), SPY 12%.
    const inputs = new Map<string, HoldInput>([
        ...universe.map((symbol, i) => [symbol, input(symbol, 100, 100 + i)] as const),
        ['SPY', input('SPY', 500, 560)],
    ]);
    const window = {start: '2026-08-03', end: '2026-09-25', sessions: 38, yoursPct: 25, withheld: null};

    it('needs ten sessions before it compares anything', () => {
        expect(buildLuckView({window: {...window, sessions: LUCK_MIN_SESSIONS - 1}, inputs, universe, seed: 1, amount: 100_000}))
            .toEqual({status: 'needs-days', sessions: LUCK_MIN_SESSIONS - 1});
    });

    it('says prices are missing when too little of the universe has both edge closes', () => {
        const few = new Map([...inputs].slice(0, LUCK_MIN_POOL - 1));
        expect(buildLuckView({window, inputs: few, universe, seed: 1, amount: 100_000}))
            .toEqual({status: 'no-prices', sessions: 38});
    });

    it('places the snapshot return among a thousand seeded portfolios, with SPY and the median beside it', () => {
        const view = buildLuckView({window, inputs, universe, seed: seedFrom('acc', '2026-09-25'), amount: 100_000});
        if (view.status !== 'ready') throw new Error(view.status);
        expect(view.count).toBe(LUCK_SAMPLE_COUNT);
        expect(view.size).toBe(LUCK_PORTFOLIO_SIZE);
        expect(view.pool).toBe(40);
        expect(view.spyPct).toBeCloseTo(12, 9);
        // five distinct returns from 0..39 average between 2 and 37; the median sits near 19.5
        expect(view.medianPct).toBeGreaterThan(15);
        expect(view.medianPct).toBeLessThan(24);
        expect(view.histogram.counts.reduce((a, b) => a + b, 0)).toBe(LUCK_SAMPLE_COUNT);
        expect(view.yours).not.toBeNull();
        // the rank is recomputable from the returns the view was built on
        const again = buildLuckView({window, inputs, universe, seed: seedFrom('acc', '2026-09-25'), amount: 100_000});
        expect(again).toEqual(view);
        expect(view.yours?.pct).toBe(25);
        expect(view.yours?.rankPct).toBe(Math.floor((view.yours?.below ?? 0) / LUCK_SAMPLE_COUNT * 100));
        expect(view.yours?.below).toBeGreaterThan(500);
        expect(view.yours?.below).toBeLessThan(LUCK_SAMPLE_COUNT);
    });

    it('lands above all of them past the best five, and keeps SPY and the median when the marker is withheld', () => {
        const top = buildLuckView({window: {...window, yoursPct: 50}, inputs, universe, seed: 3, amount: 100_000});
        expect(top.status === 'ready' && top.yours).toMatchObject({below: LUCK_SAMPLE_COUNT, rankPct: 100});
        const withheld = buildLuckView({window: {...window, yoursPct: null, withheld: 'unpriced'}, inputs, universe, seed: 3, amount: 100_000});
        if (withheld.status !== 'ready') throw new Error(withheld.status);
        expect(withheld.yours).toBeNull();
        expect(withheld.withheld).toBe('unpriced');
        expect(withheld.spyPct).toBeCloseTo(12, 9);
        expect(withheld.medianPct).not.toBeNull();
    });

    it('uses only the universe for the sample: SPY is a marker, never a pick', () => {
        const onlySpyExtra = new Map([...inputs].filter(([s]) => s === 'SPY' || universe.slice(0, 25).includes(s)));
        const view = buildLuckView({window, inputs: onlySpyExtra, universe, seed: 9, amount: 100_000});
        expect(view.status === 'ready' && view.pool).toBe(25);
    });
});

describe('createDayMemo', () => {
    it('keeps values for the day they were stored and forgets them when the date turns', () => {
        const memo = createDayMemo<number>(2);
        memo.set('a', '2026-09-25', 1);
        expect(memo.get('a', '2026-09-25')).toBe(1);
        expect(memo.get('a', '2026-09-26')).toBeUndefined();
        expect(memo.get('a', '2026-09-25')).toBeUndefined();
    });

    it('holds at most `limit` keys, dropping the oldest', () => {
        const memo = createDayMemo<number>(2);
        memo.set('a', 'd', 1);
        memo.set('b', 'd', 2);
        memo.set('c', 'd', 3);
        expect(memo.get('a', 'd')).toBeUndefined();
        expect(memo.get('b', 'd')).toBe(2);
        expect(memo.get('c', 'd')).toBe(3);
    });
});
