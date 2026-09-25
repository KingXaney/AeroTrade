import {describe, expect, it} from 'vitest';
import {coversRange, mergeCoverage} from '@/lib/prices/coverage';

describe('mergeCoverage', () => {
    it('adopts the first payload and ignores an empty one', () => {
        expect(mergeCoverage(null, {from: '2026-08-01', through: '2026-09-01'})).toEqual({from: '2026-08-01', through: '2026-09-01'});
        expect(mergeCoverage({from: '2026-08-01', through: '2026-09-01'}, null)).toEqual({from: '2026-08-01', through: '2026-09-01'});
    });

    it('joins overlapping ranges in either direction', () => {
        const stored = {from: '2021-09-28', through: '2026-09-10'};
        expect(mergeCoverage(stored, {from: '2026-08-26', through: '2026-09-24'})).toEqual({from: '2021-09-28', through: '2026-09-24'});
        expect(mergeCoverage({from: '2026-08-26', through: '2026-09-24'}, stored)).toEqual({from: '2021-09-28', through: '2026-09-24'});
    });

    // The dates in a hole were never parsed. Bridging it would claim zero dividends there.
    it('never bridges a gap: the older range is dropped', () => {
        expect(mergeCoverage({from: '2021-09-28', through: '2026-06-30'}, {from: '2026-08-26', through: '2026-09-24'}))
            .toEqual({from: '2026-08-26', through: '2026-09-24'});
    });
});

describe('coversRange', () => {
    it('requires the whole span', () => {
        const range = {from: '2026-01-02', through: '2026-09-24'};
        expect(coversRange(range, '2026-01-02', '2026-09-24')).toBe(true);
        expect(coversRange(range, '2026-01-01', '2026-09-24')).toBe(false);
        expect(coversRange(range, '2026-01-02', '2026-09-25')).toBe(false);
        expect(coversRange(null, '2026-01-02', '2026-01-02')).toBe(false);
    });
});
