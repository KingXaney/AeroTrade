// Push or fold at equilibrium: the stacks where the answer is known in closed form, the hands that
// never fold, how the shares move with the stack and the ante, and the published charts' shares.

import {describe, expect, it} from 'vitest';
import {CLASSES, classFromLabel, classSize} from '@/lib/poker/cards';
import {runToEnd} from '@/lib/poker/equity';
import {decodePreflop, type PreflopFile} from '@/lib/poker/preflop';
import {PUSH_FOLD_TOLERANCE, pushFoldJob, validatePushFold, type PushFoldProgress, type PushFoldResult} from '@/lib/poker/pushfold';
import file from '@/lib/poker/data/preflop-equity.json';

const table = decodePreflop(file as PreflopFile);
const solved = new Map<string, PushFoldResult>();
const solve = (stack: number, ante = 0): PushFoldResult => {
    const key = `${stack}:${ante}`;
    const hit = solved.get(key);
    if (hit) return hit;
    const result = runToEnd(pushFoldJob({stack, ante}, table));
    solved.set(key, result);
    return result;
};
const id = (label: string) => classFromLabel(label)!;
const LADDER = [1, 2, 3, 5, 8, 12, 16, 20, 25];

describe('validatePushFold', () => {
    it('keeps the stack and the ante in range, and the stack above what the big blind posts', () => {
        expect(validatePushFold({stack: 10, ante: 0.1})).toEqual([]);
        expect(validatePushFold({stack: 0.5, ante: 0})).toEqual(['stack-range']);
        expect(validatePushFold({stack: 26, ante: 0})).toEqual(['stack-range']);
        expect(validatePushFold({stack: Number.NaN, ante: 0})).toEqual(['stack-range']);
        expect(validatePushFold({stack: 10, ante: 0.3})).toEqual(['ante-range']);
        expect(validatePushFold({stack: 1, ante: 0.1})).toEqual(['stack-below-posts']);
        expect(() => runToEnd(pushFoldJob({stack: 1, ante: 0.1}, table))).toThrow();
    });
});

describe('the solved spots', () => {
    it('meets the tolerance everywhere on the ladder, with or without an ante', () => {
        for (const ante of [0, 0.25]) for (const stack of LADDER) {
            if (stack < 1 + ante) continue;
            const result = solve(stack, ante);
            expect(result.exploitability, `${stack} bb, ante ${ante}`).toBeLessThanOrEqual(PUSH_FOLD_TOLERANCE);
            expect(result.exploitability).toBeGreaterThan(-1e-12);
        }
    });

    it('plays every hand at one big blind, where the big blind is all in already', () => {
        const result = solve(1);
        expect(result.push.every((p) => p === 1)).toBe(true);
        expect(result.call.every((c) => c === 1)).toBe(true);
        expect(result.value).toBeCloseTo(0, 12);
    });

    it('at two big blinds: the big blind calls everything, so the small blind pushes exactly what has over 37.5% against a random hand', () => {
        // Called every time, a push wins 4e − 2 against folding's −0.5: it pays when e > 0.375.
        const result = solve(2);
        expect(result.call.every((c) => c > 0.999)).toBe(true);
        for (let i = 0; i < CLASSES; i++) expect(result.push[i] > 0.5, `class ${i}`).toBe(table.vsRandom[i] > 0.375);
        expect(result.pushShare).toBeCloseTo(1186 / 1326, 3);
    });

    it('always pushes and always calls with aces and kings', () => {
        for (const ante of [0, 0.25]) for (const stack of LADDER) {
            if (stack < 1 + ante) continue;
            const result = solve(stack, ante);
            for (const label of ['AA', 'KK']) {
                expect(result.push[id(label)]).toBeGreaterThan(0.999);
                expect(result.call[id(label)]).toBeGreaterThan(0.999);
            }
        }
    });

    it('narrows both seats as the stacks deepen, and a quarter-blind ante never narrows them', () => {
        for (const ante of [0, 0.25]) {
            const ladder = LADDER.filter((stack) => stack >= 1 + ante).map((stack) => solve(stack, ante));
            for (let k = 1; k < ladder.length; k++) {
                expect(ladder[k].pushShare).toBeLessThanOrEqual(ladder[k - 1].pushShare + 1e-9);
                expect(ladder[k].callShare).toBeLessThanOrEqual(ladder[k - 1].callShare + 1e-9);
            }
        }
        for (const stack of [3, 5, 8, 12, 16, 20, 25]) {
            expect(solve(stack, 0.25).pushShare).toBeGreaterThanOrEqual(solve(stack, 0).pushShare);
            expect(solve(stack, 0.25).callShare).toBeGreaterThanOrEqual(solve(stack, 0).callShare);
        }
    });

    it('lands on the published charts: about 58% pushed and 37% called at 10 bb, 40% and 22% at 20 bb', () => {
        expect(solve(10).pushShare).toBeCloseTo(0.58, 1);
        expect(solve(10).callShare).toBeCloseTo(0.373, 1);
        expect(solve(20).pushShare).toBeCloseTo(0.402, 1);
        expect(solve(20).callShare).toBeCloseTo(0.217, 1);
        expect(Math.abs(solve(10).pushShare - 0.5807)).toBeLessThan(0.01);
        expect(Math.abs(solve(10).callShare - 0.3725)).toBeLessThan(0.01);
    });

    it('gives each pure hand the gain its action has, to within what the tolerance leaves', () => {
        for (const stack of [5, 10, 20]) {
            const result = solve(stack);
            for (let k = 0; k < CLASSES; k++) {
                if (result.push[k] === 1) expect(result.pushGain[k]).toBeGreaterThan(-2e-3);
                if (result.push[k] === 0) expect(result.pushGain[k]).toBeLessThan(2e-3);
                if (result.call[k] === 1) expect(result.callGain[k]).toBeGreaterThan(-2e-3);
                if (result.call[k] === 0) expect(result.callGain[k]).toBeLessThan(2e-3);
            }
            const share = (strategy: Float64Array) => strategy.reduce((sum, s, k) => sum + s * classSize(k), 0) / 1326;
            expect(result.pushShare).toBeCloseTo(share(result.push), 12);
            expect(result.callShare).toBeCloseTo(share(result.call), 12);
        }
    });

    it('reports its progress as it goes', () => {
        const job = pushFoldJob({stack: 15, ante: 0.1}, table);
        const progress: PushFoldProgress[] = [];
        let step = job.next();
        while (!step.done) {
            progress.push(step.value);
            step = job.next();
        }
        expect(progress.length).toBeGreaterThan(0);
        expect(progress.every((p) => p.iterations > 0 && p.exploitability > PUSH_FOLD_TOLERANCE)).toBe(true);
        expect(step.value.iterations).toBeGreaterThan(progress.at(-1)!.iterations);
    });
});
