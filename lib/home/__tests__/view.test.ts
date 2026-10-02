import {describe, expect, it} from 'vitest';
import {nextStep, toHomeAccounts} from '@/lib/home/view';
import {HOME_STEPS} from '@/lib/learn/copy/home';
import {MISSION_COPY} from '@/lib/learn/copy/missions';
import type {Mission} from '@/lib/learn/missions';
import type {AccountWithPortfolio} from '@/lib/trading/types';

const account = (id: string, startingBalance: number, cash: number, positions: {value: number; priceStale: boolean}[]): AccountWithPortfolio => {
    const holdingsValue = positions.reduce((sum, p) => sum + p.value, 0);
    const totalValue = cash + holdingsValue;
    return {
        account: {id, name: `Account ${id}`, inceptionAt: 0, createdAt: 0},
        summary: {
            startingBalance,
            cash,
            positions: positions as unknown as AccountWithPortfolio['summary']['positions'],
            holdingsValue,
            totalValue,
            totalReturnAbs: totalValue - startingBalance,
            totalReturnPct: ((totalValue - startingBalance) / startingBalance) * 100,
        },
    };
};

const missions = (done: number): Mission[] => MISSION_COPY.map((m, i) => ({...m, done: i < done}));

describe('toHomeAccounts', () => {
    it('lists each account and totals them', () => {
        const view = toHomeAccounts([
            account('a', 100_000, 60_000, [{value: 50_000, priceStale: false}]),
            account('b', 1_000, 1_000, []),
        ]);
        expect(view.rows.map((r) => [r.id, r.totalValue, r.holdings])).toEqual([['a', 110_000, 1], ['b', 1_000, 0]]);
        expect(view.totalValue).toBe(111_000);
    });

    it('weighs the total return by money, not by account', () => {
        // +10% on $100,000 and 0% on $1,000 is +9.9% on $101,000, not the +5% an average says.
        const view = toHomeAccounts([
            account('a', 100_000, 60_000, [{value: 50_000, priceStale: false}]),
            account('b', 1_000, 1_000, []),
        ]);
        expect(view.totalReturnPct).toBeCloseTo(9.90099, 4);
    });

    it('counts holdings valued at cost, per account and in all', () => {
        const view = toHomeAccounts([
            account('a', 100_000, 0, [{value: 1, priceStale: true}, {value: 1, priceStale: false}]),
            account('b', 100_000, 0, [{value: 1, priceStale: true}]),
        ]);
        expect(view.rows.map((r) => r.unpriced)).toEqual([1, 1]);
        expect(view.unpriced).toBe(2);
    });

    it('reads zero, never NaN, with no accounts', () => {
        expect(toHomeAccounts([])).toEqual({rows: [], totalValue: 0, totalReturnPct: 0, unpriced: 0});
    });
});

describe('nextStep', () => {
    it('offers the first first-week step not yet done, in its own words', () => {
        const step = nextStep(missions(2), true, false);
        expect(step.title).toBe(MISSION_COPY[2].title);
        expect(step.href).toBe(MISSION_COPY[2].href);
        expect(step.body).toBe(MISSION_COPY[2].lesson[0]);
        expect(step.progress).toBe('2 of 5 first-week steps done');
    });

    it('follows the session once the list is done', () => {
        expect(nextStep(missions(5), true, true)).toEqual({...HOME_STEPS.marketOpen, progress: null});
        expect(nextStep(missions(5), true, false)).toEqual({...HOME_STEPS.marketClosed, progress: null});
    });

    it('offers no first-week step once the list is hidden or aged out', () => {
        expect(nextStep(missions(0), false, true).title).toBe(HOME_STEPS.marketOpen.title);
        expect(nextStep(missions(0), false, false).href).toBe('/news');
    });
});
