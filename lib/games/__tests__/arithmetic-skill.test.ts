// What the sprint learns: rounds fold into per-kind counts, the slow kinds are the ones well
// over the reader's own average with enough answers, and a practice address names known kinds.

import {describe, expect, it} from 'vitest';
import type {Problem} from '@/lib/games/arithmetic';
import {foldSolved, MIN_ATTEMPTS, overallMeanMs, parseFocus, practiceHref, skillView, weakCells, WEAK_TOP, type SkillCells} from '@/lib/games/arithmetic-skill';

const times = (n: number, r = 5): Problem => ({op: 'multiply', left: n, right: r, answer: n * r});
const solvedOf = (problem: Problem, ms: number, count: number, slips = 0) => Array.from({length: count}, () => ({problem, ms, slips}));

describe('the arithmetic skill', () => {
    it('folds timed answers into per-kind counts without touching its input', () => {
        const before: SkillCells = {'times-7': {n: 1, ms: 1000, slips: 0}};
        const after = foldSolved(before, [...solvedOf(times(7), 3000, 2, 1), ...solvedOf(times(3), 800, 1)]);
        expect(after).toEqual({'times-7': {n: 3, ms: 7000, slips: 2}, 'times-3': {n: 1, ms: 800, slips: 0}});
        expect(before).toEqual({'times-7': {n: 1, ms: 1000, slips: 0}});
        expect(overallMeanMs(after)).toBeCloseTo(7800 / 4);
        expect(overallMeanMs({})).toBeNull();
    });

    it('names a kind slow only with enough answers and well over the average, slowest first, at most three', () => {
        const cells: SkillCells = {
            'times-7': {n: 6, ms: 6 * 3000, slips: 2},    // 3.0 s
            'times-8': {n: 5, ms: 5 * 2600, slips: 0},    // 2.6 s
            'times-6': {n: 4, ms: 4 * 9000, slips: 0},    // 9.0 s but four answers
            'times-9': {n: 5, ms: 5 * 2400, slips: 0},    // 2.4 s
            'add-2d-plain': {n: 40, ms: 40 * 1000, slips: 0},
            'by-7': {n: 5, ms: 5 * 2200, slips: 0},
            'by-8': {n: 5, ms: 5 * 2100, slips: 0},
        };
        const overall = overallMeanMs(cells)!;
        const weak = weakCells(cells);
        expect(weak.map((row) => row.cell)).toEqual(['times-7', 'times-8', 'times-9']);
        expect(weak).toHaveLength(WEAK_TOP);
        expect(weak[0]).toMatchObject({n: 6, meanMs: 3000, slips: 2});
        expect(weak[0].ratio).toBeCloseTo(3000 / overall);
        expect(weak.every((row) => row.ratio >= 1.1 && row.n >= MIN_ATTEMPTS)).toBe(true);
        // Within a tenth of the average: nothing stands out.
        expect(weakCells({'times-7': {n: 10, ms: 10_500, slips: 0}, 'times-8': {n: 10, ms: 9_500, slips: 0}})).toEqual([]);
        expect(weakCells({})).toEqual([]);
    });

    it('shapes the page\'s view, empty before the first round', () => {
        expect(skillView(null)).toEqual({weak: [], problems: 0, rounds: 0, since: null, mostTried: 0});
        const view = skillView({cells: {'times-7': {n: 6, ms: 18_000, slips: 0}, 'add-2d-plain': {n: 30, ms: 30_000, slips: 0}}, problems: 36, rounds: 2, since: new Date('2026-10-13T12:00:00Z')});
        expect(view).toMatchObject({problems: 36, rounds: 2, since: '2026-10-13', mostTried: 30});
        expect(view.weak.map((row) => row.cell)).toEqual(['times-7']);
    });

    it('reads a practice address: known kinds, each once, at most eight, in order', () => {
        expect(parseFocus('times-7,bogus,times-7,add-3d-carry')).toEqual(['times-7', 'add-3d-carry']);
        expect(parseFocus(undefined)).toEqual([]);
        expect(parseFocus('')).toEqual([]);
        expect(parseFocus(['times-1', 'times-2', 'times-3', 'times-4', 'times-5', 'times-6', 'times-7', 'times-8', 'times-9'].join(','))).toHaveLength(8);
        expect(practiceHref(['times-7', 'by-7'])).toBe('/games/arithmetic?mode=practice&focus=times-7,by-7');
    });
});
