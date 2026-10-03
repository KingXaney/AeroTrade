// The showdown sweep against the plain count over every pair of hands, on random boards and ranges
// that share hands (so a hand meets its own copy on the other side), ties included.

import {describe, expect, it} from 'vitest';
import {COMBO_HI, COMBO_LO, COMBOS, parseCard} from '@/lib/poker/cards';
import {evaluateCards} from '@/lib/poker/evaluator';
import {createShowdown, orderShowdown, sweepShowdown, type ShowdownHands} from '@/lib/poker/showdown';
import {mulberry32} from '@/lib/random';

const handsOn = (combos: readonly number[], board: readonly number[]): ShowdownHands => {
    const hi = Uint8Array.from(combos, (combo) => COMBO_HI[combo]);
    const lo = Uint8Array.from(combos, (combo) => COMBO_LO[combo]);
    const values = Int32Array.from(combos, (_, i) =>
        board.includes(hi[i]) || board.includes(lo[i]) ? -1 : evaluateCards([...board, hi[i], lo[i]]));
    return {count: combos.length, hi, lo, values};
};

const bruteForce = (a: ShowdownHands, b: ShowdownHands, weightB: Float64Array) => {
    const win = new Float64Array(a.count);
    const tie = new Float64Array(a.count);
    const total = new Float64Array(a.count);
    for (let i = 0; i < a.count; i++) {
        if (a.values[i] < 0) continue;
        for (let j = 0; j < b.count; j++) {
            if (b.values[j] < 0) continue;
            if (a.hi[i] === b.hi[j] || a.hi[i] === b.lo[j] || a.lo[i] === b.hi[j] || a.lo[i] === b.lo[j]) continue;
            total[i] += weightB[j];
            if (a.values[i] > b.values[j]) win[i] += weightB[j];
            else if (a.values[i] === b.values[j]) tie[i] += weightB[j];
        }
    }
    return {win, tie, total};
};

const dealBoard = (random: () => number): number[] => {
    const deck = Array.from({length: 52}, (_, i) => i);
    for (let i = 0; i < 5; i++) {
        const j = i + Math.floor(random() * (52 - i));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.slice(0, 5);
};

const pick = (random: () => number, share: number): number[] =>
    Array.from({length: COMBOS}, (_, combo) => combo).filter(() => random() < share);

describe('sweepShowdown', () => {
    it('matches the count over every pair, on random boards and overlapping ranges', () => {
        const random = mulberry32(31);
        for (let round = 0; round < 40; round++) {
            const board = dealBoard(random);
            const share = round % 4 === 0 ? 0.01 : round % 4 === 1 ? 0.2 : 0.6;
            const a = handsOn(pick(random, share), board);
            const b = handsOn(pick(random, share), board);
            if (a.count === 0 || b.count === 0) continue;
            const weightB = Float64Array.from({length: b.count}, () => (random() < 0.3 ? 1 : random()));
            const show = createShowdown(a, b);
            orderShowdown(show);
            const win = new Float64Array(a.count);
            const tie = new Float64Array(a.count);
            const total = new Float64Array(a.count);
            sweepShowdown(show, weightB, win, tie, total);
            const expected = bruteForce(a, b, weightB);
            for (let i = 0; i < a.count; i++) {
                expect(win[i]).toBeCloseTo(expected.win[i], 9);
                expect(tie[i]).toBeCloseTo(expected.tie[i], 9);
                expect(total[i]).toBeCloseTo(expected.total[i], 9);
            }
        }
    });

    it('reorders when the board changes', () => {
        const random = mulberry32(5);
        const combos = pick(random, 0.3);
        const first = handsOn(combos, dealBoard(random));
        const b = handsOn(combos, dealBoard(random));
        const show = createShowdown(first, b);
        const weightB = new Float64Array(b.count).fill(1);
        const out = () => {
            const win = new Float64Array(first.count);
            const tie = new Float64Array(first.count);
            const total = new Float64Array(first.count);
            sweepShowdown(show, weightB, win, tie, total);
            return {win, tie, total};
        };
        orderShowdown(show);
        out();
        const board = dealBoard(random);
        first.values.set(handsOn(combos, board).values);
        b.values.set(handsOn(combos, board).values);
        orderShowdown(show);
        const got = out();
        const expected = bruteForce(first, b, weightB);
        expect(Array.from(got.win)).toEqual(Array.from(expected.win));
        expect(Array.from(got.tie)).toEqual(Array.from(expected.tie));
        expect(Array.from(got.total)).toEqual(Array.from(expected.total));
    });

    it('ties every hand when the board plays', () => {
        const board = ['As', 'Ks', 'Qs', 'Js', 'Ts'].map((t) => parseCard(t)!);
        const combos = Array.from({length: COMBOS}, (_, combo) => combo);
        const a = handsOn(combos, board);
        const b = handsOn(combos, board);
        const show = createShowdown(a, b);
        orderShowdown(show);
        const win = new Float64Array(a.count);
        const tie = new Float64Array(a.count);
        const total = new Float64Array(a.count);
        sweepShowdown(show, new Float64Array(b.count).fill(1), win, tie, total);
        for (let i = 0; i < a.count; i++) {
            if (a.values[i] < 0) continue;
            expect(win[i]).toBe(0);
            // 47 cards left; the other hand avoids this hand's two: C(45, 2).
            expect(tie[i]).toBe(990);
            expect(total[i]).toBe(990);
        }
    });
});
