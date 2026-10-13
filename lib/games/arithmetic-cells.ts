// The kinds of arithmetic problem the sprint times — its "cells": for addition and subtraction,
// the size of the total (under 100, 100 to 999, 1,000 or more) crossed with whether the units
// carry or borrow; for multiplication and division, the times table (the schema's small factor,
// or the divisor), 1 to 12, else "13 and up". Every problem maps to exactly one cell, and every
// cell can generate a problem of its own kind, so a practice round is drawn from cells alone.
// Pure and client-safe; a cell id is stored on the reader's aggregate and never renamed.

import type {Problem} from "@/lib/games/arithmetic";

export type Band = '2d' | '3d' | '4d';
export type Small = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type CellId =
    | `add-${Band}-${'plain' | 'carry'}`
    | `subtract-${Band}-${'plain' | 'borrow'}`
    | `times-${Small}` | 'times-13plus'
    | `by-${Small}` | 'by-13plus';

export type CellFamily = 'add-plain' | 'add-carry' | 'subtract-plain' | 'subtract-borrow' | 'times' | 'by';

const BANDS: readonly Band[] = ['2d', '3d', '4d'];
const SMALLS: readonly Small[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// The range of the total in each band; a sum under 10 is not a kind worth timing.
const BAND_RANGE: Record<Band, {min: number; max: number}> = {'2d': {min: 10, max: 99}, '3d': {min: 100, max: 999}, '4d': {min: 1000, max: 9999}};
// What "13 and up" draws from when practised; a classified problem may carry any factor.
const BIG_FACTOR = {min: 13, max: 20};
const OTHER = {min: 2, max: 100};

export const CELL_IDS: readonly CellId[] = [
    ...BANDS.flatMap((band) => [`add-${band}-plain`, `add-${band}-carry`] as const),
    ...BANDS.flatMap((band) => [`subtract-${band}-plain`, `subtract-${band}-borrow`] as const),
    ...SMALLS.map((n) => `times-${n}` as const), 'times-13plus',
    ...SMALLS.map((n) => `by-${n}` as const), 'by-13plus',
];

const CELL_SET: ReadonlySet<string> = new Set(CELL_IDS);

export const isCellId = (value: unknown): value is CellId => typeof value === 'string' && CELL_SET.has(value);

// At most this many kinds in one practice round.
export const MAX_FOCUS = 8;

export const familyOf = (cell: CellId): CellFamily => {
    if (cell.startsWith('times-')) return 'times';
    if (cell.startsWith('by-')) return 'by';
    if (cell.startsWith('add-')) return cell.endsWith('carry') ? 'add-carry' : 'add-plain';
    return cell.endsWith('borrow') ? 'subtract-borrow' : 'subtract-plain';
};

const bandOf = (total: number): Band => (total <= 99 ? '2d' : total <= 999 ? '3d' : '4d');

// The cell a problem belongs to. Addition carries when the units add to ten or more; subtraction
// borrows when the units of what is taken away exceed the units of what it is taken from.
export const cellOf = (problem: Problem): CellId => {
    switch (problem.op) {
        case 'add':
            return `add-${bandOf(problem.left + problem.right)}-${problem.left % 10 + problem.right % 10 >= 10 ? 'carry' : 'plain'}`;
        case 'subtract':
            return `subtract-${bandOf(problem.left)}-${problem.left % 10 < problem.right % 10 ? 'borrow' : 'plain'}`;
        case 'multiply':
            return problem.left >= 1 && problem.left <= 12 ? `times-${problem.left as Small}` : 'times-13plus';
        case 'divide':
            return problem.right >= 1 && problem.right <= 12 ? `by-${problem.right as Small}` : 'by-13plus';
    }
};

const between = (random: () => number, range: {min: number; max: number}) =>
    range.min + Math.floor(random() * (range.max - range.min + 1));

// A problem of one kind, built rather than drawn and rejected: the total first, then the units
// to force or avoid the carry, then the tens. For a sum S with units s, a carry needs the first
// addend's units u above s (so u + (s − u + 10) ≥ 10) and no carry needs u at most s; the tens
// are then any split that leaves both addends at least one.
export const nextCellProblem = (random: () => number, cell: CellId): Problem => {
    const family = familyOf(cell);
    if (family === 'times') {
        const n = cell === 'times-13plus' ? between(random, BIG_FACTOR) : Number(cell.slice('times-'.length));
        const r = between(random, OTHER);
        return {op: 'multiply', left: n, right: r, answer: n * r};
    }
    if (family === 'by') {
        const n = cell === 'by-13plus' ? between(random, BIG_FACTOR) : Number(cell.slice('by-'.length));
        const b = between(random, OTHER);
        return {op: 'divide', left: n * b, right: n, answer: b};
    }
    const band = cell.split('-')[1] as Band;
    const crossing = family === 'add-carry' || family === 'subtract-borrow';
    let total = between(random, BAND_RANGE[band]);
    if (crossing && total % 10 === 9) total -= 1;      // units of 9 leave no room for a carry
    if (!crossing && total === 10) total = 11;           // 10 has no carry-free split with both parts ≥ 1
    const s = total % 10;
    const u = crossing ? between(random, {min: s + 1, max: 9}) : between(random, {min: 0, max: s});
    const tMax = Math.floor((total - 1 - u) / 10);
    const t = between(random, {min: u === 0 ? 1 : 0, max: tMax});
    const a = 10 * t + u;
    const b = total - a;
    if (family === 'add-carry' || family === 'add-plain') {
        return random() < 0.5 ? {op: 'add', left: a, right: b, answer: total} : {op: 'add', left: b, right: a, answer: total};
    }
    return {op: 'subtract', left: total, right: a, answer: b};
};
