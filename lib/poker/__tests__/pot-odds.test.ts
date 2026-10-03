// Pot odds: the five figures for the textbook sizes, and the identities that tie them together.

import {describe, expect, it} from 'vitest';
import {potOdds, validatePotOdds} from '@/lib/poker/pot-odds';

describe('potOdds', () => {
    it('reads a half-pot bet: 25% to call, 3 to 1, defend two thirds, a bluff needs a third', () => {
        const odds = potOdds({pot: 100, bet: 50, equity: null});
        expect(odds.breakEven).toBeCloseTo(0.25, 12);
        expect(odds.odds).toBeCloseTo(3, 12);
        expect(odds.minimumDefense).toBeCloseTo(2 / 3, 12);
        expect(odds.bluffFolds).toBeCloseTo(1 / 3, 12);
        expect(odds.callResult).toBeNull();
    });

    it('reads a pot-sized bet and an overbet', () => {
        expect(potOdds({pot: 10, bet: 10, equity: null}).breakEven).toBeCloseTo(1 / 3, 12);
        expect(potOdds({pot: 10, bet: 10, equity: null}).minimumDefense).toBeCloseTo(0.5, 12);
        expect(potOdds({pot: 10, bet: 20, equity: null}).breakEven).toBeCloseTo(0.4, 12);
        expect(potOdds({pot: 10, bet: 20, equity: null}).odds).toBeCloseTo(1.5, 12);
    });

    it('breaks a call even at exactly the break-even equity, and ties the shares together', () => {
        for (const [pot, bet] of [[100, 50], [7, 3], [1, 40], [250, 0.5]]) {
            const {breakEven, minimumDefense, bluffFolds, odds} = potOdds({pot, bet, equity: null});
            expect(potOdds({pot, bet, equity: breakEven}).callResult).toBeCloseTo(0, 9);
            expect(potOdds({pot, bet, equity: Math.min(1, breakEven + 0.1)}).callResult).toBeGreaterThan(0);
            expect(minimumDefense + bluffFolds).toBeCloseTo(1, 12);
            expect(1 / (odds + 1)).toBeCloseTo(breakEven, 12);
        }
        expect(potOdds({pot: 100, bet: 50, equity: 0.5}).callResult).toBeCloseTo(50, 12);
    });
});

describe('validatePotOdds', () => {
    it('names a pot, bet or equity it cannot use', () => {
        expect(validatePotOdds({pot: 100, bet: 50, equity: 0.4})).toEqual([]);
        expect(validatePotOdds({pot: 0, bet: 50, equity: null})).toEqual(['pot']);
        expect(validatePotOdds({pot: 100, bet: -1, equity: null})).toEqual(['bet']);
        expect(validatePotOdds({pot: Number.NaN, bet: Number.POSITIVE_INFINITY, equity: 1.2})).toEqual(['pot', 'bet', 'equity']);
    });
});
