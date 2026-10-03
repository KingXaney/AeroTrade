// The committed preflop table: its shape, its symmetry, the card-removal pair counts, and the
// published equities against a random hand it reproduces.

import {describe, expect, it} from 'vitest';
import {CLASSES, classFromLabel, classLabel} from '@/lib/poker/cards';
import {decodePreflop, pairCounts, rankingOf, type PreflopFile} from '@/lib/poker/preflop';
import {PREFLOP_RANKING} from '@/lib/poker/ranking';
import file from '@/lib/poker/data/preflop-equity.json';

const table = decodePreflop(file as PreflopFile);
const id = (label: string) => classFromLabel(label)!;

describe('the preflop table', () => {
    it('holds every pair of classes once, as whole numbers on its scale', () => {
        expect(file.upper).toHaveLength((CLASSES * (CLASSES - 1)) / 2);
        expect(file.upper.every((n) => Number.isInteger(n) && n >= 0 && n <= file.scale)).toBe(true);
        expect(() => decodePreflop({...file, upper: file.upper.slice(1)})).toThrow();
    });

    it('is zero-sum: a class against itself is even, and the two sides add to one', () => {
        for (let i = 0; i < CLASSES; i++) {
            expect(table.equity(i, i)).toBe(0.5);
            for (let j = 0; j < CLASSES; j++) expect(table.equity(i, j) + table.equity(j, i)).toBeCloseTo(1, 12);
        }
    });

    it('counts the combo pairs that share no card', () => {
        const pairs = pairCounts();
        expect(pairs.reduce((sum, n) => sum + n, 0)).toBe(1326 * 1225);
        for (let i = 0; i < CLASSES; i++) for (let j = 0; j < CLASSES; j++) expect(pairs[i * CLASSES + j]).toBe(pairs[j * CLASSES + i]);
        expect(pairs[id('AA') * CLASSES + id('AA')]).toBe(6);
        expect(pairs[id('AA') * CLASSES + id('KK')]).toBe(36);
        expect(pairs[id('AKs') * CLASSES + id('AA')]).toBe(12);
        expect(pairs[id('AKo') * CLASSES + id('AKs')]).toBe(24);
    });

    it('reproduces the published head-to-head and against-a-random-hand equities', () => {
        expect(table.equity(id('AA'), id('KK'))).toBeCloseTo(0.81946, 5);
        expect(table.equity(id('QQ'), id('AKs'))).toBeCloseTo(0.53951, 5);
        expect(table.equity(id('AA'), id('72o'))).toBeCloseTo(0.882, 3);
        const vsRandom = (label: string) => table.vsRandom[id(label)];
        expect(vsRandom('AA')).toBeCloseTo(0.85204, 5);
        expect(vsRandom('KK')).toBeCloseTo(0.82396, 5);
        expect(vsRandom('AKs')).toBeCloseTo(0.67045, 5);
        expect(vsRandom('AKo')).toBeCloseTo(0.6532, 5);
        expect(vsRandom('22')).toBeCloseTo(0.50334, 5);
        expect(vsRandom('72o')).toBeCloseTo(0.34584, 5);
        expect(vsRandom('32o')).toBeCloseTo(0.32303, 5);
    });

    it('ranks the classes from aces down to three-deuce offsuit', () => {
        const ranking = rankingOf(table);
        expect(new Set(ranking).size).toBe(CLASSES);
        expect(ranking.slice(0, 8).map(classLabel)).toEqual(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs']);
        expect(ranking.at(-1)).toBe(id('32o'));
    });

    it('ships the same ranking for the range editor, so its Top x% needs no table', () => {
        expect(PREFLOP_RANKING).toEqual(rankingOf(table));
    });
});
