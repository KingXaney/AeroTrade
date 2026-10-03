// The river's betting tree: bets as shares of the pot, sizes past the stack collapsing to one all-in,
// the raise cap, the no-limit minimum raise, the terminals' stakes, and the size limit.

import {describe, expect, it} from 'vitest';
import {actionKind, buildTree, DECISION, estimateBytes, FOLD, pathTo, SHOWDOWN, validateConfig, type RiverConfig, type RiverTree} from '@/lib/poker/river/tree';

const config = (overrides: Partial<RiverConfig> = {}): RiverConfig => ({
    pot: 10, stack: 100, betSizes: [[50], [50]], raiseSizes: [[], []], allIn: false, raiseCap: 0, ...overrides,
});

const children = (tree: RiverTree, node: number) =>
    Array.from({length: tree.childCount[node]}, (_, a) => tree.firstChild[node] + a);
const labels = (tree: RiverTree, node: number) =>
    children(tree, node).map((child) => `${actionKind(tree, child)}${tree.amount[child] ? ` ${Number(tree.amount[child].toFixed(4))}` : ''}`);
const raisesOnPath = (tree: RiverTree, node: number) => pathTo(tree, node).filter((at) => at > 0 && ['raise', 'all-in'].includes(actionKind(tree, at)) && tree.invested[2 * tree.parent[at] + (1 - tree.player[tree.parent[at]])] > 0).length;

describe('buildTree', () => {
    it('checks or bets a share of the pot, then folds or calls; a check behind is a showdown', () => {
        const tree = buildTree(config())!;
        expect(tree.kind[0]).toBe(DECISION);
        expect(tree.player[0]).toBe(0);
        expect(labels(tree, 0)).toEqual(['check', 'bet 5']);
        const [check, bet] = children(tree, 0);
        expect(tree.player[check]).toBe(1);
        expect(labels(tree, check)).toEqual(['check', 'bet 5']);
        expect(labels(tree, bet)).toEqual(['fold', 'call 5']);
        const [checkBehind] = children(tree, check);
        expect(tree.kind[checkBehind]).toBe(SHOWDOWN);
        const [fold, call] = children(tree, bet);
        expect(tree.kind[fold]).toBe(FOLD);
        expect(tree.player[fold]).toBe(1);
        expect([tree.invested[2 * fold], tree.invested[2 * fold + 1]]).toEqual([5, 0]);
        expect(tree.kind[call]).toBe(SHOWDOWN);
        expect([tree.invested[2 * call], tree.invested[2 * call + 1]]).toEqual([5, 5]);
        expect(tree.decisions).toBe(4);
    });

    it('turns every size past the stack into one all-in, merged with the all-in offered', () => {
        const tree = buildTree(config({stack: 12, betSizes: [[50, 150, 300], []], allIn: true}))!;
        expect(labels(tree, 0)).toEqual(['check', 'bet 5', 'all-in 12']);
        const allIn = children(tree, 0)[2];
        expect(labels(tree, allIn)).toEqual(['fold', 'call 12']);
    });

    it('raises a share of the pot after the call, and at least the last increment', () => {
        // A 5 bet into 10: the call makes 20; a 50% raise adds 10 on top of the 5 call.
        const tree = buildTree(config({raiseSizes: [[], [50, 10]], raiseCap: 1}))!;
        const bet = children(tree, 0)[1];
        // 10% of 20 is 2, under the 5 just bet: lifted to the minimum raise, 5 + 5.
        expect(labels(tree, bet)).toEqual(['fold', 'call 5', 'raise 10', 'raise 15']);
        const raise = children(tree, bet)[3];
        expect(tree.invested[2 * raise + 1]).toBe(15);
        // The cap is spent: facing the raise, only fold or call.
        expect(labels(tree, raise)).toEqual(['fold', 'call 10']);
    });

    it('stops raising at the cap on every line', () => {
        for (const raiseCap of [0, 1, 2, 3]) {
            const tree = buildTree(config({raiseSizes: [[100], [100]], raiseCap, stack: 10_000}))!;
            let deepest = 0;
            for (let node = 0; node < tree.size; node++) deepest = Math.max(deepest, raisesOnPath(tree, node));
            expect(deepest, `cap ${raiseCap}`).toBe(raiseCap);
        }
    });

    it('offers no raise once a player is all in, and no bet with nothing behind', () => {
        const tree = buildTree(config({stack: 5, betSizes: [[100], [100]], raiseSizes: [[100], [100]], allIn: true, raiseCap: 4}))!;
        const allIn = children(tree, 0)[1];
        expect(actionKind(tree, allIn)).toBe('all-in');
        expect(labels(tree, allIn)).toEqual(['fold', 'call 5']);
        expect(labels(buildTree(config({stack: 0}))!, 0)).toEqual(['check']);
    });

    it('stores children side by side, each knowing its parent and depth', () => {
        const tree = buildTree(config({betSizes: [[33, 75], [33, 75]], raiseSizes: [[100], [100]], allIn: true, raiseCap: 2}))!;
        for (let node = 0; node < tree.size; node++) {
            for (const child of children(tree, node)) {
                expect(tree.parent[child]).toBe(node);
                expect(tree.depth[child]).toBe(tree.depth[node] + 1);
            }
            if (tree.kind[node] === SHOWDOWN) expect(tree.invested[2 * node]).toBeCloseTo(tree.invested[2 * node + 1], 9);
        }
        expect(pathTo(tree, tree.size - 1)[0]).toBe(0);
        expect(estimateBytes(tree, [500, 500])).toBeGreaterThan(0);
    });

    it('gives up on a tree with more decisions than allowed', () => {
        const wide = config({betSizes: [[25, 50, 100, 200], [25, 50, 100, 200]], raiseSizes: [[50, 100, 200, 300], [50, 100, 200, 300]], allIn: true, raiseCap: 4, stack: 10_000});
        expect(buildTree(wide, 400)).toBeNull();
        expect(buildTree(config(), 3)).toBeNull();
        expect(buildTree(config(), 4)).not.toBeNull();
    });
});

describe('validateConfig', () => {
    it('names a pot, stack, size or cap it cannot use', () => {
        expect(validateConfig(config())).toEqual([]);
        expect(validateConfig(config({pot: 0}))).toEqual(['pot']);
        expect(validateConfig(config({stack: -1}))).toEqual(['stack']);
        expect(validateConfig(config({betSizes: [[0], []]}))).toEqual(['sizes']);
        expect(validateConfig(config({betSizes: [[10, 20, 30, 40, 50], []]}))).toEqual(['sizes']);
        expect(validateConfig(config({raiseSizes: [[], [2000]]}))).toEqual(['sizes']);
        expect(validateConfig(config({raiseCap: 5}))).toEqual(['raise-cap']);
        expect(validateConfig(config({raiseCap: 1.5}))).toEqual(['raise-cap']);
    });
});
