// The raise panel's sizes, held to the server's own limits: legalFor's smallest and largest "raise
// to" from the view. A pot-sized raise is the current bet plus the pot after the call; every size is
// rounded to the small blind, clamped to the legal range, and one that reaches the stack is the
// all-in — in PLO, the pot is the top whenever the stack goes past it, and the move it sends is a raise. The slider runs from the minimum to the all-in on a square curve and back, and the amount
// field reads what people type.

import {describe, expect, it} from 'vitest';
import {ACTION_COPY} from '@/lib/learn/copy/poker-night';
import {legalFor} from '@/lib/poker-night/betting';
import {
    amountToSlider, clampTo, confirmLabel, EMPTY_SIZE_MEMORY, initialRaiseTo, moveFor, parseChips, potRaise, potTotal, QUICK_SIZE_IDS, quickSizes, readSizeMemory, rememberSize,
    REMEMBERED_SIZES, SIZE_MEMORY_KEY, sizeIdFor, sizeStreet, SLIDER_MAX, sizingFor, sliderToAmount, stepRaise, type Sizing,
} from '@/lib/poker-night/bet-sizing';
import type {TableState} from '@/lib/poker-night/types';
import {publicView, snapshotFromView} from '@/lib/poker-night/views';
import {C, R, X, deal, moves, table} from './fixtures';

const sizing = (s: TableState): Sizing => {
    const view = publicView(s);
    const actor = view.hand!.actor!;
    return sizingFor(view, legalFor(snapshotFromView(view), actor), actor, s.config.smallBlind)!;
};

const three = (stacks: [number, number, number] = [1000, 1000, 1000]) => table({0: stacks[0], 1: stacks[1], 2: stacks[2]}, {lastBigBlind: 0});

describe('sizing from the view', () => {
    it('reads the pot, the call and the legal range preflop', () => {
        const s = deal(three());
        const sz = sizing(s);
        expect(sz).toMatchObject({kind: 'raise', min: 40, max: 1000, cap: 'all-in', currentBet: 20, myBet: 0, toCall: 20, pot: 30, unit: 10});
        // A pot-sized raise: 20 to call, then the pot after calling (30 + 20) on top of the bet.
        expect(potRaise(sz, 1)).toBe(70);
        expect(quickSizes(sz)).toEqual([
            {id: 'min', to: 40}, {id: 'half', to: 50}, {id: 'three-quarters', to: 60}, {id: 'pot', to: 70}, {id: 'all-in', to: 1000},
        ]);
    });

    it('sizes a bet as a share of the pot', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, C, C, X);
        const sz = sizing(s);
        expect(sz).toMatchObject({kind: 'bet', min: 20, currentBet: 0, toCall: 0, pot: 60});
        expect(quickSizes(sz).map((q) => [q.id, q.to])).toEqual([['min', 20], ['half', 30], ['three-quarters', 50], ['pot', 60], ['all-in', 980]]);
    });

    it('drops sizes past the stack and repeats, and offers only the all-in when the minimum is all of it', () => {
        let s = deal(three([1000, 1000, 150]));
        // Seat 2, with 150, faces 20: the pot raise (70) is under its stack, but the min raise is 40.
        expect(quickSizes(sizing(s)).map((q) => q.id)).toEqual(['min', 'half', 'three-quarters', 'pot', 'all-in']);
        s = moves(s, R(120));
        // Seat 0 faces 120 more with 1000: raises reach past the half pot.
        const sz = sizing(s);
        const ids = quickSizes(sz).map((q) => q.to);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
        expect(quickSizes({kind: 'raise', min: 300, max: 300, cap: 'all-in', currentBet: 200, myBet: 0, toCall: 200, pot: 400, unit: 10})).toEqual([{id: 'all-in', to: 300}]);
        expect(quickSizes({kind: 'raise', min: 40, max: 65, cap: 'all-in', currentBet: 20, myBet: 0, toCall: 20, pot: 30, unit: 10}).map((q) => q.id)).toEqual(['min', 'half', 'three-quarters', 'all-in']);
    });

    it('has a label for every size', () => {
        for (const id of QUICK_SIZE_IDS) expect(ACTION_COPY.sizes[id]).toBeTruthy();
    });

    it('offers nothing to a player who may not raise', () => {
        const s = deal(three());
        const view = publicView(s);
        expect(sizingFor(view, null, 2, 10)).toBeNull();
        expect(sizingFor(view, {fold: true, check: false, call: 20, callAllIn: false, raise: null}, 2, 10)).toBeNull();
        expect(potTotal({hand: null, seats: []})).toBe(0);
    });
});

describe('pot limit (PLO)', () => {
    const plo = (stacks: [number, number, number] = [1000, 1000, 1000]) => table({0: stacks[0], 1: stacks[1], 2: stacks[2]}, {lastBigBlind: 0, config: {variant: 'plo'}});

    it('tops the range at the pot: Pot is the last size, its words say so, and it sends a raise', () => {
        const sz = sizing(deal(plo()));
        // 20 to call, then the pot after calling (30 + 20) on top of the bet: 70, the server's own cap.
        expect(sz).toMatchObject({kind: 'raise', min: 40, max: 70, cap: 'pot', toCall: 20, pot: 30});
        expect(quickSizes(sz)).toEqual([{id: 'min', to: 40}, {id: 'half', to: 50}, {id: 'three-quarters', to: 60}, {id: 'pot', to: 70}]);
        expect(confirmLabel(sz, 70)).toBe('Raise to 70 (pot)');
        expect(confirmLabel(sz, 50)).toBe('Raise to 50');
        expect(moveFor(sz, 70)).toEqual({kind: 'raise', to: 70});
        expect(moveFor(sz, 5000)).toEqual({kind: 'raise', to: 70});
        expect(confirmLabel({...sz, kind: 'bet'}, 70)).toBe('Bet 70 (pot)');
    });

    it('is all in, as in no limit, when the stack fits under the pot', () => {
        const sz = sizing(deal(plo([1000, 1000, 55])));
        expect(sz).toMatchObject({min: 40, max: 55, cap: 'all-in'});
        expect(quickSizes(sz).at(-1)).toEqual({id: 'all-in', to: 55});
        expect(confirmLabel(sz, 55)).toBe(ACTION_COPY.allIn(55));
        expect(moveFor(sz, 55)).toEqual({kind: 'all-in'});
        const nl = sizing(deal(three()));
        expect(moveFor(nl, nl.max)).toEqual({kind: 'all-in'});
        expect(moveFor(nl, 300)).toEqual({kind: 'raise', to: 300});
    });
});

describe('clamping and the slider', () => {
    const sz = {min: 40, max: 1000, unit: 10};

    it('rounds to the unit inside the legal range and keeps the all-in exact', () => {
        expect(clampTo(57, sz)).toBe(60);
        expect(clampTo(12, sz)).toBe(40);
        expect(clampTo(5000, sz)).toBe(1000);
        expect(clampTo(996, sz)).toBe(1000);
        expect(clampTo(Number.NaN, sz)).toBe(1000);
        expect(clampTo(43, {min: 43, max: 517, unit: 10})).toBe(43);
    });

    it('runs from the minimum to the all-in on a square curve, and back', () => {
        expect(sliderToAmount(0, sz)).toBe(40);
        expect(sliderToAmount(SLIDER_MAX, sz)).toBe(1000);
        expect(sliderToAmount(500, sz)).toBe(280);
        expect(sliderToAmount(-5, sz)).toBe(40);
        expect(amountToSlider(40, sz)).toBe(0);
        expect(amountToSlider(1000, sz)).toBe(SLIDER_MAX);
        expect(amountToSlider(280, sz)).toBe(500);
        for (let pos = 0; pos <= SLIDER_MAX; pos += 50) {
            const amount = sliderToAmount(pos, sz);
            expect(amount).toBeGreaterThanOrEqual(sz.min);
            expect(amount).toBeLessThanOrEqual(sz.max);
            expect(Math.abs(sliderToAmount(amountToSlider(amount, sz), sz) - amount)).toBeLessThanOrEqual(sz.unit);
        }
        expect(amountToSlider(50, {min: 50, max: 50})).toBe(SLIDER_MAX);
    });
});

describe('the amount field', () => {
    it('reads digits, groups and short forms', () => {
        expect(parseChips('1,250')).toBe(1250);
        expect(parseChips(' 300 ')).toBe(300);
        expect(parseChips('1.5k')).toBe(1500);
        expect(parseChips('2M')).toBe(2_000_000);
        expect(parseChips('1 000')).toBe(1000);
    });

    it('reads nothing else', () => {
        for (const text of ['', 'abc', '-5', '0', '1.5', '1e3', '12x', '1,2.5k', '.']) expect(parseChips(text), text).toBeNull();
    });
});

describe('the panel on a phone', () => {
    const sz: Sizing = {kind: 'raise', min: 40, max: 1000, cap: 'all-in', currentBet: 20, myBet: 0, toCall: 20, pot: 30, unit: 10};

    it('steps a big blind at a time, held to the range: from the top a big blind under it, from the bottom one over it', () => {
        expect(stepRaise(sz, 40, 1, 20)).toBe(60);
        expect(stepRaise(sz, 60, -1, 20)).toBe(40);
        expect(stepRaise(sz, 40, -1, 20)).toBe(40);
        expect(stepRaise(sz, 1000, 1, 20)).toBe(1000);
        expect(stepRaise(sz, 1000, -1, 20)).toBe(980);
        expect(stepRaise(sz, 990, 1, 20)).toBe(1000);
        // An amount typed off the unit lands back on it.
        expect(stepRaise(sz, 55, 1, 20) % sz.unit).toBe(0);
        // Under pot limit the top is the pot: a step never passes it.
        const potCap: Sizing = {...sz, max: 120, cap: 'pot'};
        expect(stepRaise(potCap, 110, 1, 20)).toBe(120);
    });

    it("remembers the minimum and the pot's shares before and after the flop, never the all-in or the pot", () => {
        expect(SIZE_MEMORY_KEY).toBe('aero-poker-night:sizes');
        expect(REMEMBERED_SIZES).toEqual(['min', 'half', 'three-quarters']);
        expect([sizeStreet('preflop'), sizeStreet('flop'), sizeStreet('turn'), sizeStreet('river')]).toEqual(['pre', 'post', 'post', 'post']);
        expect(sizeIdFor(sz, 50)).toBe('half');
        expect(sizeIdFor(sz, 55)).toBeNull();
        const half = rememberSize(EMPTY_SIZE_MEMORY, 'preflop', sz, 50);
        expect(half).toEqual({pre: 'half', post: null});
        // The all-in, the pot and an amount of the player's own leave it as it was.
        expect(rememberSize(half, 'preflop', sz, 1000)).toBe(half);
        expect(rememberSize(half, 'preflop', sz, 70)).toBe(half);
        expect(rememberSize(half, 'preflop', sz, 55)).toBe(half);
        expect(rememberSize(half, 'river', sz, 60)).toEqual({pre: 'half', post: 'three-quarters'});
    });

    it('reads only the sizes it may hold back from storage', () => {
        expect(readSizeMemory(null)).toEqual(EMPTY_SIZE_MEMORY);
        expect(readSizeMemory('not json')).toEqual(EMPTY_SIZE_MEMORY);
        expect(readSizeMemory('[1]')).toEqual(EMPTY_SIZE_MEMORY);
        expect(readSizeMemory(JSON.stringify({pre: 'all-in', post: 'pot'}))).toEqual(EMPTY_SIZE_MEMORY);
        expect(readSizeMemory(JSON.stringify({pre: 'three-quarters', post: 'min', extra: 1}))).toEqual({pre: 'three-quarters', post: 'min'});
    });

    it('opens at the size remembered where this turn offers it, else at the minimum', () => {
        expect(initialRaiseTo(sz, null)).toBe(40);
        expect(initialRaiseTo(sz, 'half')).toBe(50);
        expect(initialRaiseTo(sz, 'three-quarters')).toBe(60);
        // A short stack: no half-pot raise on offer, so the minimum.
        const short: Sizing = {...sz, max: 45};
        expect(quickSizes(short).map((q) => q.id)).not.toContain('half');
        expect(initialRaiseTo(short, 'half')).toBe(40);
    });
});
