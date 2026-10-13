import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {LAB_COPY, LAB_TRACK_LABELS} from '@/lib/learn/copy/lab';

// Every string, including the ones the functions and nested objects produce.
const flatten = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') {
        const fn = value as (...args: unknown[]) => unknown;
        const samples: unknown[][] = [[3], [3, 10], ['2026-10-12'], ['2026-10-12', '2026-10-20'], ['2026-10-12', 'solved'], ['2026-10-12', 'revealed'], ['cv', 2, 10], ['A unit title']];
        return samples.filter((args) => args.length === fn.length).flatMap((args) => {
            try { const out = fn(...args); return typeof out === 'string' ? [out] : []; } catch { return []; }
        });
    }
    if (value && typeof value === 'object') return Object.values(value).flatMap(flatten);
    return [];
};

describe('LAB_COPY', () => {
    it('describes the lab and never advises, in every line', () => {
        const lines = [...flatten(LAB_COPY), ...Object.values(LAB_TRACK_LABELS)];
        expect(lines.length).toBeGreaterThan(60);
        for (const text of lines) {
            expect(text.trim().length, text).toBeGreaterThan(0);
            expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
        expect(LAB_COPY.subtitle).toMatch(/computer vision, machine learning and quantitative finance/);
        expect(LAB_COPY.unitsOf(3, 10)).toBe('3 of 10');
        expect(LAB_COPY.cardsCount(1)).toBe('1 review card');
        expect(LAB_COPY.closedOn('2026-10-12', 'solved')).toBe('Answered on 2026-10-12.');
        expect(LAB_COPY.trackOf('quant', 2, 10)).toBe('Quantitative finance · unit 2 of 10');
    });
});
