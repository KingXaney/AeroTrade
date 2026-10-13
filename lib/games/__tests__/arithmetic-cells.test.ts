// The kinds of arithmetic problem: every Zetamac problem lands in exactly one, the pinned cases
// read as named, and every kind generates problems that map back to it.

import {describe, expect, it} from 'vitest';
import {mulberry32} from '@/lib/random';
import {problemAt, ZETAMAC_DEFAULTS, type Problem} from '@/lib/games/arithmetic';
import {CELL_IDS, cellOf, familyOf, isCellId, MAX_FOCUS, nextCellProblem, type CellId} from '@/lib/games/arithmetic-cells';

const add = (left: number, right: number): Problem => ({op: 'add', left, right, answer: left + right});
const subtract = (left: number, right: number): Problem => ({op: 'subtract', left, right, answer: left - right});
const multiply = (left: number, right: number): Problem => ({op: 'multiply', left, right, answer: left * right});
const divide = (left: number, right: number): Problem => ({op: 'divide', left, right, answer: left / right});

describe('the cells', () => {
    it('are thirty-eight known ids, and nothing else is one', () => {
        expect(CELL_IDS).toHaveLength(38);
        expect(new Set(CELL_IDS).size).toBe(38);
        for (const cell of CELL_IDS) expect(isCellId(cell)).toBe(true);
        for (const junk of ['times-0', 'times-13', 'add-5d-carry', 'add-2d', '', 'constructor', 7, null, undefined]) expect(isCellId(junk)).toBe(false);
        expect(MAX_FOCUS).toBe(8);
    });

    it('name the kind of every pinned problem', () => {
        expect(cellOf(add(47, 38))).toBe('add-2d-carry');
        expect(cellOf(add(47, 32))).toBe('add-2d-plain');
        expect(cellOf(add(60, 50))).toBe('add-3d-plain');
        expect(cellOf(add(95, 96))).toBe('add-3d-carry');
        expect(cellOf(add(5000, 6000))).toBe('add-4d-plain');
        expect(cellOf(subtract(105, 47))).toBe('subtract-3d-borrow');
        expect(cellOf(subtract(98, 45))).toBe('subtract-2d-plain');
        expect(cellOf(subtract(42, 17))).toBe('subtract-2d-borrow');
        expect(cellOf(subtract(1200, 300))).toBe('subtract-4d-plain');
        expect(cellOf(multiply(7, 86))).toBe('times-7');
        expect(cellOf(multiply(12, 2))).toBe('times-12');
        expect(cellOf(multiply(13, 5))).toBe('times-13plus');
        expect(cellOf(divide(91, 7))).toBe('by-7');
        expect(cellOf(divide(260, 13))).toBe('by-13plus');
        expect(familyOf('add-2d-carry')).toBe('add-carry');
        expect(familyOf('subtract-3d-plain')).toBe('subtract-plain');
        expect(familyOf('times-13plus')).toBe('times');
        expect(familyOf('by-4')).toBe('by');
    });

    it('place every Zetamac problem, across every two- and three-digit kind and every times table', () => {
        const seen = new Set<CellId>();
        let previous: Problem | null = null;
        for (let i = 0; i < 5000; i++) {
            previous = problemAt(11, ZETAMAC_DEFAULTS, i, previous);
            const cell = cellOf(previous);
            expect(isCellId(cell)).toBe(true);
            seen.add(cell);
        }
        for (const band of ['2d', '3d'] as const) {
            for (const cell of [`add-${band}-plain`, `add-${band}-carry`, `subtract-${band}-plain`, `subtract-${band}-borrow`] as const) expect(seen.has(cell), cell).toBe(true);
        }
        for (let n = 2; n <= 12; n++) {
            expect(seen.has(`times-${n}` as CellId), `times-${n}`).toBe(true);
            expect(seen.has(`by-${n}` as CellId), `by-${n}`).toBe(true);
        }
        for (const never of ['add-4d-plain', 'add-4d-carry', 'subtract-4d-plain', 'subtract-4d-borrow', 'times-13plus', 'by-13plus', 'times-1', 'by-1'] as const) expect(seen.has(never), never).toBe(false);
    });

    it.each(CELL_IDS.map((cell) => [cell] as const))('%s generates problems of its own kind, consistent and never trivial', (cell) => {
        const random = mulberry32(cell.length * 1000 + cell.charCodeAt(0));
        for (let i = 0; i < 500; i++) {
            const problem = nextCellProblem(random, cell);
            expect(cellOf(problem), JSON.stringify(problem)).toBe(cell);
            expect(problem.left).toBeGreaterThanOrEqual(1);
            expect(problem.right).toBeGreaterThanOrEqual(1);
            expect(Number.isInteger(problem.answer)).toBe(true);
            switch (problem.op) {
                case 'add': expect(problem.answer).toBe(problem.left + problem.right); break;
                case 'subtract': expect(problem.answer).toBe(problem.left - problem.right); expect(problem.answer).toBeGreaterThanOrEqual(1); break;
                case 'multiply': expect(problem.answer).toBe(problem.left * problem.right); break;
                case 'divide': expect(problem.left).toBe(problem.right * problem.answer); break;
            }
        }
    });

    it('draws the same problem from the same seed', () => {
        expect(nextCellProblem(mulberry32(9), 'add-3d-carry')).toEqual(nextCellProblem(mulberry32(9), 'add-3d-carry'));
        expect(nextCellProblem(mulberry32(9), 'by-7')).toEqual(nextCellProblem(mulberry32(9), 'by-7'));
    });
});
