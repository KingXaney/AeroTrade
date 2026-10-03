// The shared seeded randomness (lib/random.ts). Known values pin both functions: Luck or skill's
// sample is seeded through them, and the browser QA recomputes that sample with its own copy.

import {describe, expect, it} from 'vitest';
import {fnv1a, mulberry32} from '@/lib/random';

const TWO_32 = 4294967296;

describe('fnv1a', () => {
    it('is the 32-bit FNV-1a hash', () => {
        expect(fnv1a('')).toBe(0x811c9dc5);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });
});

describe('mulberry32', () => {
    it('gives the known stream for a seed', () => {
        const fortyTwo = mulberry32(42);
        expect([fortyTwo(), fortyTwo(), fortyTwo()].map((x) => x * TWO_32)).toEqual([2581720956, 1925393290, 3661312704]);
        const zero = mulberry32(0);
        expect([zero(), zero()].map((x) => x * TWO_32)).toEqual([1144304738, 1416247]);
    });

    it('stays in [0, 1) and treats a seed as its unsigned 32 bits', () => {
        const random = mulberry32(7);
        for (let i = 0; i < 10_000; i++) {
            const x = random();
            expect(x >= 0 && x < 1).toBe(true);
        }
        expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    });
});
