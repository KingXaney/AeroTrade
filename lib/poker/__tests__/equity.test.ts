// Equity, three ways: exact enumeration reproduces the known integers for AsAh against KsKh and a
// plain count over every board and pair on a flop; Monte Carlo repeats itself for a seed and lands
// near the exact figure; and the preflop table agrees with an enumeration of its own entry.

import {describe, expect, it} from 'vitest';
import {CLASS_OF_COMBO, COMBO_HI, COMBO_LO, COMBOS, classFromLabel, parseCard} from '@/lib/poker/cards';
import {evaluateCards} from '@/lib/poker/evaluator';
import {equityJob, planEquity, runToEnd, validateEquity, type EquityInput, type EquityProgress} from '@/lib/poker/equity';
import {decodePreflop, type PreflopFile} from '@/lib/poker/preflop';
import {parseRange} from '@/lib/poker/range';
import file from '@/lib/poker/data/preflop-equity.json';

const table = decodePreflop(file as PreflopFile);
const cards = (text: string): number[] => (text.match(/../g) ?? []).map((t) => parseCard(t)!);
const range = (text: string) => {
    const parsed = parseRange(text);
    expect(parsed.issues, text).toEqual([]);
    return parsed.range;
};
const input = (a: string, b: string, board = '', options: Partial<EquityInput> = {}): EquityInput => ({
    ranges: [range(a), range(b)], board: cards(board), dead: [], method: 'auto', seed: 1, ...options,
});

// Every board that finishes `board`, every pair of hands that share no card: the plain count.
const bruteForce = (spot: EquityInput) => {
    const known = new Set([...spot.board, ...spot.dead]);
    const deck = Array.from({length: 52}, (_, c) => c).filter((c) => !known.has(c));
    const need = 5 - spot.board.length;
    const live = (r: Float64Array) => Array.from({length: COMBOS}, (_, c) => c).filter((c) => r[c] > 0 && !known.has(COMBO_HI[c]) && !known.has(COMBO_LO[c]));
    const a = live(spot.ranges[0]);
    const b = live(spot.ranges[1]);
    let win = 0;
    let tie = 0;
    let all = 0;
    const visit = (start: number, picked: number[]) => {
        if (picked.length === need) {
            const board = [...spot.board, ...picked];
            const value = (c: number) => (board.includes(COMBO_HI[c]) || board.includes(COMBO_LO[c]) ? -1 : evaluateCards([...board, COMBO_HI[c], COMBO_LO[c]]));
            const va = a.map(value);
            const vb = b.map(value);
            a.forEach((x, i) => {
                if (va[i] < 0) return;
                b.forEach((y, j) => {
                    if (vb[j] < 0 || COMBO_HI[x] === COMBO_HI[y] || COMBO_HI[x] === COMBO_LO[y] || COMBO_LO[x] === COMBO_HI[y] || COMBO_LO[x] === COMBO_LO[y]) return;
                    const w = spot.ranges[0][x] * spot.ranges[1][y];
                    all += w;
                    if (va[i] > vb[j]) win += w;
                    else if (va[i] === vb[j]) tie += w;
                });
            });
            return;
        }
        for (let k = start; k < deck.length; k++) visit(k + 1, [...picked, deck[k]]);
    };
    visit(0, []);
    return {equity: (win + tie / 2) / all, win: win / all, tie: tie / all};
};

describe('planEquity', () => {
    it('takes the table preflop for whole classes, and counts the boards and the work', () => {
        expect(planEquity(input('AsAh', 'KsKh'), table)).toEqual({method: 'exact', boards: 1_712_304, live: [1, 1], work: 1_712_304 * 2});
        expect(planEquity(input('random', 'random'), table).method).toBe('table');
        expect(planEquity(input('random', 'random'), null).method).toBe('monte-carlo');
        expect(planEquity(input('random', 'random', 'Ah7c2d'), table)).toMatchObject({method: 'exact', boards: 1176, live: [1176, 1176]});
        expect(planEquity(input('AA', 'KK', '', {method: 'monte-carlo'}), table).method).toBe('monte-carlo');
        // A dead card rules the table out; 10 hands over 2,349,060 boards fit the exact budget, 34 do not.
        expect(planEquity(input('QQ', 'AKs', '', {dead: cards('2c')}), table).method).toBe('exact');
        expect(planEquity(input('QQ+', 'AK', '', {dead: cards('2c')}), table).method).toBe('monte-carlo');
    });
});

describe('validateEquity', () => {
    it('names what keeps a spot from running', () => {
        expect(validateEquity(input('AA', 'KK'))).toEqual([]);
        expect(validateEquity(input('AA', 'KK', 'Ah7c'))).toEqual(['board-size']);
        expect(validateEquity(input('AA', 'KK', 'Ah7c7c'))).toEqual(['duplicate']);
        expect(validateEquity(input('AhAd', 'KK', 'Ah7c2d'))).toEqual(['empty-side']);
        expect(validateEquity(input('AsAh', 'AsAh'))).toEqual(['no-pairs']);
        expect(() => runToEnd(equityJob(input('AsAh', 'AsAh'), table))).toThrow();
    });
});

describe('exact enumeration', () => {
    it('plays AsAh against KsKh over all 1,712,304 boards: 1,410,336 wins and 9,308 ties', () => {
        const result = runToEnd(equityJob(input('AsAh', 'KsKh'), table));
        expect(result.method).toBe('exact');
        expect(result.boards).toBe(1_712_304);
        expect(Math.round(result.win! * result.boards)).toBe(1_410_336);
        expect(Math.round(result.tie! * result.boards)).toBe(9_308);
        expect(result.equity).toBeCloseTo((1_410_336 + 9_308 / 2) / 1_712_304, 12);
    }, 30_000);

    it('equals the plain count over every board and pair, ranges sharing hands and weights', () => {
        for (const spot of [
            input('AA, KK, AKs, 76s', 'QQ+, AQs+, 87s:0.5, 22', 'Ah7c2d'),
            input('JTs, 99:0.25, AhKd', 'random', 'Th9h2c4s'),
            input('random', 'TT+, AK', '7s7h7d2c3c'),
        ]) {
            const result = runToEnd(equityJob(spot, table));
            const expected = bruteForce(spot);
            expect(result.method).toBe('exact');
            expect(result.equity).toBeCloseTo(expected.equity, 12);
            expect(result.win).toBeCloseTo(expected.win, 12);
            expect(result.tie).toBeCloseTo(expected.tie, 12);
        }
    }, 60_000);

    it('reports each class of side A on its own, and progress without a running figure', () => {
        const job = equityJob(input('AA, KK', 'QQ', 'Kh7c2d'), table);
        const progress: EquityProgress[] = [];
        let step = job.next();
        while (!step.done) {
            progress.push(step.value);
            step = job.next();
        }
        const result = step.value;
        expect(progress.length).toBeGreaterThan(0);
        expect(progress.every((p) => p.equity === null && p.done <= p.total)).toBe(true);
        const aces = result.byClass[classFromLabel('AA')!]!;
        const kings = result.byClass[classFromLabel('KK')!]!;
        expect(aces).toBeCloseTo(bruteForce(input('AA', 'QQ', 'Kh7c2d')).equity, 12);
        expect(kings).toBeCloseTo(bruteForce(input('KK', 'QQ', 'Kh7c2d')).equity, 12);
        expect(result.byClass[classFromLabel('QQ')!]).toBeNull();
    }, 30_000);
});

describe('the table against enumeration', () => {
    it('agrees with every board for aces against kings, to the table scale', () => {
        const exact = runToEnd(equityJob(input('AA', 'KK', '', {method: 'exact'}), table));
        const fromTable = runToEnd(equityJob(input('AA', 'KK'), table));
        expect(fromTable.method).toBe('table');
        expect(fromTable.win).toBeNull();
        expect(Math.abs(fromTable.equity - exact.equity)).toBeLessThanOrEqual(0.5 / file.scale + 1e-12);
    }, 60_000);

    it('weighs class against class by the pairs that share no card', () => {
        const result = runToEnd(equityJob(input('AA, AKs', 'AKs, KK'), table));
        const id = (l: string) => classFromLabel(l)!;
        const terms = [['AA', 'AKs'], ['AA', 'KK'], ['AKs', 'AKs'], ['AKs', 'KK']] as const;
        let num = 0;
        let den = 0;
        for (const [x, y] of terms) {
            const n = table.pairs[id(x) * 169 + id(y)];
            num += n * table.equity(id(x), id(y));
            den += n;
        }
        expect(result.equity).toBeCloseTo(num / den, 12);
        expect(CLASS_OF_COMBO.length).toBe(COMBOS);
    });
});

describe('Monte Carlo', () => {
    it('gives the same figure for the same seed, and stops at the target error', () => {
        const spot = input('QQ', 'AKs', '', {method: 'monte-carlo', seed: 7});
        const first = runToEnd(equityJob(spot, table));
        const again = runToEnd(equityJob(spot, table));
        expect(again).toEqual(first);
        expect(first.method).toBe('monte-carlo');
        expect(first.stdErr!).toBeLessThanOrEqual(0.0005);
        expect(first.samples % 65_536).toBe(0);
        const other = runToEnd(equityJob({...spot, seed: 8}, table));
        expect(other.equity).not.toBe(first.equity);
    }, 30_000);

    it('lands within four standard errors of the exact figure', () => {
        for (const [spot, exact] of [
            [input('QQ', 'AKs', '', {method: 'monte-carlo', seed: 7}), table.equity(classFromLabel('QQ')!, classFromLabel('AKs')!)],
            [input('AA, KK, AKs', 'random', 'Ah7c2d', {method: 'monte-carlo', seed: 3}), runToEnd(equityJob(input('AA, KK, AKs', 'random', 'Ah7c2d'), table)).equity],
        ] as const) {
            const result = runToEnd(equityJob(spot, table));
            expect(Math.abs(result.equity - exact)).toBeLessThan(4 * result.stdErr!);
        }
    }, 30_000);

    it('reports a running estimate as it goes', () => {
        const job = equityJob(input('random', 'random', 'Ah7c2d', {method: 'monte-carlo', seed: 11}), table);
        const first = job.next();
        expect(first.done).toBe(false);
        const progress = first.value as EquityProgress;
        expect(progress.done).toBe(65_536);
        expect(progress.equity).toBeGreaterThan(0.4);
        expect(progress.equity).toBeLessThan(0.6);
        expect(progress.stdErr).toBeGreaterThan(0);
        expect(progress.total).toBeGreaterThan(progress.done);
    });
});
