// Poker night's deck: what counts as a deck, the fixed deal layout, and the shuffle. Driving
// Fisher–Yates down every path of its random draws for four cards reaches each of the 24 orders
// exactly once, which is the whole proof that it has no bias; a pinned seeded deck holds the
// algorithm still.

import {describe, expect, it} from 'vitest';
import {dealFrom, FULL_DECK, isDeck, shuffleWith} from '@/lib/poker-night/deck';
import {cardLabel} from '@/lib/poker/cards';
import {mulberry32} from '@/lib/random';

// A randomInt that answers from a script and records what it was asked.
const scripted = (answers: readonly number[]) => {
    const asked: number[] = [];
    let next = 0;
    const randomInt = (max: number): number => {
        asked.push(max);
        return answers[next++];
    };
    return {randomInt, asked};
};

describe('isDeck', () => {
    it('takes the 52 cards in any order', () => {
        expect(isDeck(FULL_DECK)).toBe(true);
        expect(isDeck([...FULL_DECK].reverse())).toBe(true);
        expect(FULL_DECK).toEqual(Array.from({length: 52}, (_, i) => i));
    });

    it('rejects a repeated card, a card out of range and the wrong length', () => {
        const repeated = [...FULL_DECK];
        repeated[51] = 0;
        expect(isDeck(repeated)).toBe(false);
        for (const bad of [52, -1, 1.5, Number.NaN, '7' as unknown as number]) {
            const deck: unknown[] = [...FULL_DECK];
            deck[10] = bad;
            expect(isDeck(deck), String(bad)).toBe(false);
        }
        expect(isDeck(FULL_DECK.slice(1))).toBe(false);
        expect(isDeck([...FULL_DECK, 0])).toBe(false);
        expect(isDeck([])).toBe(false);
        expect(isDeck(null)).toBe(false);
        expect(isDeck({length: 52})).toBe(false);
    });
});

describe('dealFrom', () => {
    it('gives player k cards 2k and 2k + 1, then the board', () => {
        expect(dealFrom(FULL_DECK, 3)).toEqual({holes: [[0, 1], [2, 3], [4, 5]], board: [6, 7, 8, 9, 10]});
        const deck = [...FULL_DECK].reverse();
        const {holes, board} = dealFrom(deck, 9);
        expect(holes).toHaveLength(9);
        expect(holes[8]).toEqual([deck[16], deck[17]]);
        expect(board).toEqual(deck.slice(18, 23));
    });

    it('refuses a deal the deck cannot cover', () => {
        expect(() => dealFrom(FULL_DECK, 0)).toThrow(RangeError);
        expect(() => dealFrom(FULL_DECK, 1.5)).toThrow(RangeError);
        expect(dealFrom(FULL_DECK, 23).board).toEqual([46, 47, 48, 49, 50]);
        expect(() => dealFrom(FULL_DECK, 24)).toThrow(RangeError);
    });
});

describe('shuffleWith', () => {
    it('reaches each of the 24 orders of four cards exactly once over every path of draws', () => {
        const seen = new Map<string, number>();
        for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
            const {randomInt, asked} = scripted([a, b, c]);
            const order = shuffleWith([0, 1, 2, 3], randomInt);
            expect(asked).toEqual([4, 3, 2]);
            const key = order.join('');
            seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        expect(seen.size).toBe(24);
        expect([...seen.values()].every((n) => n === 1)).toBe(true);
    });

    it('swaps i with the drawn j, from the top down', () => {
        const {randomInt, asked} = scripted([2, 0, 3, 1, 0]);
        expect(shuffleWith([0, 1, 2, 3, 4, 5], randomInt)).toEqual([5, 4, 1, 3, 0, 2]);
        expect(asked).toEqual([6, 5, 4, 3, 2]);
    });

    it('deals a pinned deck from a seeded draw', () => {
        const random = mulberry32(2026);
        const deck = shuffleWith(FULL_DECK, (max) => Math.floor(random() * max));
        expect(isDeck(deck)).toBe(true);
        expect(deck).toEqual([44, 41, 13, 48, 38, 18, 29, 16, 3, 49, 40, 21, 39, 46, 11, 5, 34, 42, 28, 22, 17, 35, 24, 9, 45, 47,
            20, 26, 27, 51, 8, 37, 0, 19, 32, 14, 43, 6, 4, 50, 25, 2, 1, 12, 36, 31, 10, 7, 30, 33, 15, 23]);
        expect(deck.slice(0, 9).map(cardLabel).join(' ')).toBe('Kc Qd 5d Ac Jh 6h 9d 6c 2s');
    });

    it('returns a new array and leaves its input alone', () => {
        const input = Object.freeze([0, 1, 2, 3, 4]);
        const out = shuffleWith(input, () => 0);
        expect(out).not.toBe(input);
        expect(input).toEqual([0, 1, 2, 3, 4]);
        expect(shuffleWith([], () => 0)).toEqual([]);
        expect(shuffleWith([7], () => 0)).toEqual([7]);
    });

    it('throws on a draw outside 0…i', () => {
        expect(() => shuffleWith([0, 1, 2], (max) => max)).toThrow(RangeError);
        expect(() => shuffleWith([0, 1, 2], () => -1)).toThrow(RangeError);
        expect(() => shuffleWith([0, 1, 2], () => 0.5)).toThrow(RangeError);
    });
});
