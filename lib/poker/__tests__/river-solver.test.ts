// The river solver against what is known: the polarized range against a bluff-catcher, whose
// equilibrium is in closed form; zero-sum results and a falling exploitability; the same answer
// with the suits relabelled; a board that ties every hand; a check-only tree equal to plain equity;
// the vectorised counter-strategy equal to a brute force over every pure strategy; a stop that keeps
// the strategy so far.

import {describe, expect, it} from 'vitest';
import {CLASS_OF_COMBO, COMBO_HI, COMBO_LO, classFromLabel, comboIndex, parseCardList} from '@/lib/poker/cards';
import {evaluateCards} from '@/lib/poker/evaluator';
import {equityJob, runToEnd} from '@/lib/poker/equity';
import {emptyRange, parseRange, type Range} from '@/lib/poker/range';
import {riverJob, validateRiver, type RiverInput, type RiverMethod, type RiverResult} from '@/lib/poker/river/solver';
import {DECISION, FOLD} from '@/lib/poker/river/tree';
import {combosTaking, viewAt} from '@/lib/poker/river/view';

const cards = (text: string) => parseCardList(text).cards;
const range = (text: string) => parseRange(text).range;
const solve = (overrides: Partial<RiverInput> & Pick<RiverInput, 'board' | 'ranges' | 'config'>): RiverResult =>
    runToEnd(riverJob({method: 'dcfr', maxIterations: 1000, targetPct: 0.3, maxDecisions: 400, ...overrides}));

// The toy: AA (three combos) and four 65s bluffs against three KQs bluff-catchers on Ah Kd 7c 4s 2h.
// The bettor bets or checks; the catcher only checks behind, or calls or folds a bet.
const TOY_BOARD = cards('Ah Kd 7c 4s 2h');
const toy = (pot: number, bet: number, method: RiverMethod) => solve({
    board: TOY_BOARD, ranges: [range('AA, 65s'), range('KQs')], method, targetPct: 0,
    config: {pot, stack: 100, betSizes: [[(bet / pot) * 100], []], raiseSizes: [[], []], allIn: false, raiseCap: 0},
});

describe('the polarized range against a bluff-catcher', () => {
    for (const method of ['dcfr', 'cfr+'] as const) {
        it(`bluffs bet/(pot + 2·bet) of its bets, and the catcher calls pot/(pot + bet), by ${method}`, () => {
            const pot = 10;
            for (const bet of [3.3, 7.5, 15, 40]) {
                const result = toy(pot, bet, method);
                const root = viewAt(result, 0)!;
                const betIndex = root.actions.findIndex((a) => a.kind === 'bet');
                const value = combosTaking(root, betIndex, [classFromLabel('AA')!]);
                const bluffs = combosTaking(root, betIndex, [classFromLabel('65s')!]);
                expect(root.classes[classFromLabel('AA')!].freq[betIndex], `value bets at ${bet}`).toBeGreaterThan(0.995);
                expect(Math.abs(bluffs / (value + bluffs) - bet / (pot + 2 * bet)), `bluff share at ${bet}`).toBeLessThan(0.005);
                const facing = viewAt(result, root.actions[betIndex].node)!;
                const call = facing.actions.findIndex((a) => a.kind === 'call');
                expect(Math.abs(facing.classes[classFromLabel('KQs')!].freq[call] - pot / (pot + bet)), `call rate at ${bet}`).toBeLessThan(0.005);
            }
        });
    }

    it('pays each side its closed-form result: the aces win the pot plus a called bet, the bluffs break even', () => {
        const pot = 10;
        const bet = 7.5;
        const result = toy(pot, bet, 'dcfr');
        const call = pot / (pot + bet);
        // Three aces worth pot + call·bet, four bluffs worth 0, over seven combos.
        expect(result.ev[0]).toBeCloseTo((3 * (pot + call * bet)) / 7, 2);
        expect(result.ev[0] + result.ev[1]).toBeCloseTo(pot, 9);
        expect(viewAt(result, 0)!.classes[classFromLabel('65s')!].ev).toBeCloseTo(0, 1);
        expect(result.exploitabilityPct).toBeLessThan(0.1);
    });
});

const REALISTIC: Omit<RiverInput, 'method' | 'maxIterations' | 'targetPct' | 'maxDecisions'> = {
    board: cards('Qs Jh 7d 4c 2s'),
    ranges: [range('TT+, AQ+, KQs, QJs, JTs, 98s, A5s-A2s'), range('99-66, AJ+, KQ, QTs+, JTs, T9s, 87s, 65s')],
    config: {pot: 10, stack: 30, betSizes: [[33, 75], [50]], raiseSizes: [[100], [100]], allIn: true, raiseCap: 2},
};

describe('a realistic spot', () => {
    it('is zero-sum, and its exploitability is never negative and keeps falling', () => {
        const result = solve({...REALISTIC, targetPct: 0, maxIterations: 500});
        expect(result.ev[0] + result.ev[1]).toBeCloseTo(REALISTIC.config.pot, 9);
        const at = (iterations: number) => result.history.find((h) => h.iterations === iterations)!.pct;
        expect(result.history.every((h) => h.pct >= -1e-9)).toBe(true);
        expect(at(500)).toBeLessThanOrEqual(at(50) / 5);
        expect(at(500)).toBeLessThan(0.5);
        // Every class that reaches a decision plays its actions with frequencies that add up to one.
        for (let node = 0; node < result.tree.size; node++) {
            if (result.tree.kind[node] !== DECISION) continue;
            for (const cell of viewAt(result, node)!.classes) {
                if (cell.combos > 1e-9) expect(cell.freq.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 5);
            }
        }
    }, 30_000);

    it('gives the same answer with the suits relabelled', () => {
        const swap = [2, 3, 0, 1];
        const relabel = (card: number) => (card & ~3) | swap[card & 3];
        const relabelRange = (r: Range): Range => {
            const out = emptyRange();
            for (let combo = 0; combo < r.length; combo++) if (r[combo] > 0) out[comboIndex(relabel(COMBO_HI[combo]), relabel(COMBO_LO[combo]))] = r[combo];
            return out;
        };
        const base = solve({...REALISTIC, targetPct: 0, maxIterations: 120});
        const mirrored = solve({...REALISTIC, board: REALISTIC.board.map(relabel), ranges: [relabelRange(REALISTIC.ranges[0]), relabelRange(REALISTIC.ranges[1])], targetPct: 0, maxIterations: 120});
        expect(mirrored.ev[0]).toBeCloseTo(base.ev[0], 9);
        expect(mirrored.exploitabilityPct).toBeCloseTo(base.exploitabilityPct, 9);
    }, 30_000);
});

describe('spots with a known value', () => {
    it('splits the pot when the board plays for everyone', () => {
        const result = solve({
            board: cards('As Ks Qs Js Ts'), ranges: [range('random'), range('random')], targetPct: 0, maxIterations: 200,
            config: {pot: 10, stack: 20, betSizes: [[50, 100], [50, 100]], raiseSizes: [[100], [100]], allIn: true, raiseCap: 1},
        });
        // Within what the first iterations' uniform play still leaves in the average.
        expect(result.ev[0]).toBeCloseTo(5, 4);
        expect(result.ev[1]).toBeCloseTo(5, 4);
        expect(result.exploitabilityPct).toBeLessThan(1e-4);
    }, 30_000);

    it('values a tree where nobody bets at the pot times plain equity', () => {
        const board = cards('Qs Jh 7d 4c 2s');
        const ranges: [Range, Range] = [range('AA, KK, AQ, 98s'), range('QQ, JJ, KJs, T9s, 65s')];
        const result = solve({board, ranges, config: {pot: 10, stack: 30, betSizes: [[], []], raiseSizes: [[], []], allIn: false, raiseCap: 0}});
        const equity = runToEnd(equityJob({ranges, board, dead: [], method: 'exact', seed: 1}, null)).equity;
        expect(result.tree.decisions).toBe(2);
        expect(result.ev[0]).toBeCloseTo(10 * equity, 9);
    });
});

describe('the counter-strategy that wins the most', () => {
    it('equals a brute force over every pure strategy, card removal included', () => {
        // Tiny ranges that share cards, a tree with bets and a raise, and a strategy far from the
        // equilibrium (seven iterations), so the counter-strategy has something to find.
        const board = cards('Qs Jh 7d 4c 2s');
        const input: RiverInput = {
            board, ranges: [range('AsKs, QhQd, 9s8s'), range('AsQd, KsJd, Th9h')],
            config: {pot: 10, stack: 20, betSizes: [[50], [100]], raiseSizes: [[100], [100]], allIn: false, raiseCap: 1},
            method: 'dcfr', maxIterations: 7, targetPct: 0, maxDecisions: 400,
        };
        const result = runToEnd(riverJob(input));
        const {tree} = result;
        const half = input.config.pot / 2;
        const strategyOf = (node: number, h: number) => {
            const d = tree.decisionOf[node];
            const n = result.combos[tree.player[node]].length;
            return Array.from({length: tree.childCount[node]}, (_, a) => result.strategy[result.strategyOffsets[d] + a * n + h]);
        };
        const shares = (x: number, y: number) => COMBO_HI[x] === COMBO_HI[y] || COMBO_HI[x] === COMBO_LO[y] || COMBO_LO[x] === COMBO_HI[y] || COMBO_LO[x] === COMBO_LO[y];
        const strength = (combo: number) => evaluateCards([...board, COMBO_HI[combo], COMBO_LO[combo]]);
        const brute = (p: 0 | 1): number => {
            const q = p === 0 ? 1 : 0;
            const mine = [...result.combos[p]];
            const theirs = [...result.combos[q]];
            const decisions = Array.from({length: tree.size}, (_, node) => node).filter((node) => tree.kind[node] === DECISION && tree.player[node] === p);
            // Every pure strategy: one action at each of p's decisions.
            const plans: number[][] = [[]];
            for (const node of decisions) plans.splice(0, plans.length, ...plans.flatMap((plan) => Array.from({length: tree.childCount[node]}, (_, a) => [...plan, a])));
            const valueOf = (node: number, plan: number[], hand: number, other: number, otherIndex: number): number => {
                if (tree.kind[node] === FOLD) {
                    const folder = tree.player[node];
                    const stake = half + tree.invested[2 * node + folder];
                    return folder === p ? -stake : stake;
                }
                if (tree.kind[node] !== DECISION) {
                    const stake = half + tree.invested[2 * node];
                    return stake * Math.sign(strength(hand) - strength(other));
                }
                const first = tree.firstChild[node];
                if (tree.player[node] === p) return valueOf(first + plan[decisions.indexOf(node)], plan, hand, other, otherIndex);
                return strategyOf(node, otherIndex).reduce((sum, prob, a) => sum + prob * valueOf(first + a, plan, hand, other, otherIndex), 0);
            };
            let total = 0;
            let pairs = 0;
            mine.forEach((hand, i) => {
                let bestValue = -Infinity;
                for (const plan of plans) {
                    let value = 0;
                    theirs.forEach((other, j) => {
                        if (!shares(hand, other)) value += result.weights[q][j] * valueOf(0, plan, hand, other, j);
                    });
                    bestValue = Math.max(bestValue, value);
                }
                total += result.weights[p][i] * bestValue;
                theirs.forEach((other, j) => {
                    if (!shares(hand, other)) pairs += result.weights[p][i] * result.weights[q][j];
                });
            });
            return total / pairs;
        };
        const exploitability = (brute(0) + brute(1)) / 2;
        expect(exploitability).toBeGreaterThan(0);
        expect(Math.abs(exploitability - result.exploitability)).toBeLessThan(1e-4);
        expect(CLASS_OF_COMBO.length).toBe(1326);
    });
});

describe('the job', () => {
    it('keeps the average strategy so far when told to stop', () => {
        const job = riverJob({...REALISTIC, method: 'dcfr', maxIterations: 1000, targetPct: 0, maxDecisions: 400});
        let step = job.next();
        for (let i = 1; i < 25 && !step.done; i++) step = job.next();
        step = job.next('stop');
        expect(step.done).toBe(true);
        const result = step.value as RiverResult;
        expect(result.iterations).toBeLessThan(30);
        expect(result.history.at(-1)!.iterations).toBe(result.iterations);
        expect(result.exploitabilityPct).toBeGreaterThan(0);
        expect(viewAt(result, 0)!.combos).toBeGreaterThan(0);
    });

    it('names what keeps a spot from solving', () => {
        const base: RiverInput = {...REALISTIC, method: 'dcfr', maxIterations: 10, targetPct: 0, maxDecisions: 400};
        expect(validateRiver(base)).toEqual([]);
        expect(validateRiver({...base, board: cards('Qs Jh 7d 4c')})).toEqual(['board']);
        expect(validateRiver({...base, board: cards('Qs Jh 7d 4c 4c')})).toEqual(['board']);
        expect(validateRiver({...base, board: cards('Ks Th 7d 4c 2h')})).toEqual([]);
        expect(validateRiver({...base, ranges: [range('QsQh'), range('AK')]})).toEqual(['empty-side']);
        expect(validateRiver({...base, ranges: [range('AhAd'), range('AhAd')]})).toEqual(['no-pairs']);
        expect(validateRiver({...base, maxDecisions: 3})).toEqual(['too-big']);
        expect(validateRiver({...base, config: {...base.config, pot: 0}})).toEqual(['pot']);
        expect(() => runToEnd(riverJob({...base, maxDecisions: 3}))).toThrow(/too-big/);
    });
});
