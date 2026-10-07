// Poker night's crypto source (server-only, node:crypto in the node environment): every deck is a
// permutation and every draw is in range. Fisher–Yates itself is proved unbiased in deck.test.ts;
// no statistical test is run on crypto output.

import {describe, expect, it} from 'vitest';
import {FULL_DECK, isDeck} from '@/lib/poker-night/deck';
import {SECURE_SOURCE, secureDeck, secureDraw} from '@/lib/poker-night/shuffle';

describe('secureDeck', () => {
    it('is a permutation of the 52 cards, a new array each time', () => {
        const first = secureDeck();
        for (let n = 0; n < 200; n++) expect(isDeck(secureDeck())).toBe(true);
        expect(isDeck(first)).toBe(true);
        expect(secureDeck()).not.toBe(first);
        expect(FULL_DECK).toEqual(Array.from({length: 52}, (_, i) => i));
    });
});

describe('secureDraw', () => {
    it('is an integer in [0, 2^31)', () => {
        for (let n = 0; n < 1000; n++) {
            const draw = secureDraw();
            expect(Number.isSafeInteger(draw)).toBe(true);
            expect(draw).toBeGreaterThanOrEqual(0);
            expect(draw).toBeLessThan(2 ** 31);
        }
    });
});

describe('SECURE_SOURCE', () => {
    it('hands out a deck and a draw', () => {
        expect(isDeck(SECURE_SOURCE.deck())).toBe(true);
        expect(Number.isSafeInteger(SECURE_SOURCE.draw())).toBe(true);
        expect(Object.isFrozen(SECURE_SOURCE)).toBe(true);
    });
});
