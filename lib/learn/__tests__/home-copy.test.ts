// The signed-in Home page's sentences (lib/learn/copy/home.ts), held to the 'copy' tier of
// lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {HOME_COPY, HOME_STEPS} from '@/lib/learn/copy/home';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('HOME_COPY', () => {
    it('greets by first name, or by no name at all', () => {
        expect(HOME_COPY.greeting('Ada Lovelace')).toBe('Welcome back, Ada');
        expect(HOME_COPY.greeting('  Ada  ')).toBe('Welcome back, Ada');
        expect(HOME_COPY.greeting('')).toBe('Welcome back');
        expect(HOME_COPY.greeting(undefined)).toBe('Welcome back');
    });

    it('counts in words that agree', () => {
        expect(HOME_COPY.holdings(0)).toBe('No holdings yet');
        expect(HOME_COPY.holdings(1)).toBe('1 holding');
        expect(HOME_COPY.holdings(3)).toBe('3 holdings');
        expect(HOME_COPY.stepsDone(2, 5)).toBe('2 of 5 first-week steps done');
        expect(HOME_COPY.accountsTotal(2)).toBe('All 2 accounts');
        expect(HOME_COPY.morePoints(1)).toBe('+1 more point in the news');
        expect(HOME_COPY.morePoints(2)).toBe('+2 more points in the news');
    });

    it('never advises', () => {
        for (const value of Object.values(HOME_COPY)) {
            if (typeof value === 'string') clean(value);
        }
        for (const text of [HOME_COPY.greeting('Ada'), HOME_COPY.stepsDone(1, 5), HOME_COPY.accountsTotal(3), HOME_COPY.holdings(0), HOME_COPY.holdings(2), HOME_COPY.morePoints(2)]) clean(text);
        for (const step of Object.values(HOME_STEPS)) {
            clean(step.title);
            clean(step.body);
            clean(step.cta);
        }
    });

    it('points its closing steps at pages that exist', () => {
        expect(HOME_STEPS.marketOpen.href).toBe('/trade');
        expect(HOME_STEPS.marketClosed.href).toBe('/news');
    });
});
