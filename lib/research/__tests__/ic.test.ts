import {describe, expect, it} from 'vitest';
import {MIN_CROSS_SECTION, MIN_IC_WEEKS, averageRanks, icTable, neweyWestT, spearman, summarizeIc, type IcRow} from '@/lib/research/ic';

describe('averageRanks', () => {
    it('ranks from 1 and gives ties the mean of the ranks they span', () => {
        expect(averageRanks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
        expect(averageRanks([3, 3, 3])).toEqual([2, 2, 2]);
        expect(averageRanks([])).toEqual([]);
    });
});

describe('spearman', () => {
    const up = Array.from({length: 12}, (_, i) => i);

    it('is 1 for any rising relation and −1 for any falling one', () => {
        expect(spearman(up, up.map((x) => x ** 3))).toBeCloseTo(1, 12);
        expect(spearman(up, up.map((x) => -Math.exp(x)))).toBeCloseTo(-1, 12);
    });

    it('is Pearson on the average ranks', () => {
        // y's ranks are [1, 2, 3.5, 5, 3.5]: r = 8 / √95.
        expect(spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7], 5)).toBeCloseTo(8 / Math.sqrt(95), 12);
    });

    it('uses only the pairs where both sides are numbers', () => {
        const xs = [...up, null, 5, Number.NaN];
        const ys = [...up, 3, null, 1];
        expect(spearman(xs, ys)).toBeCloseTo(1, 12);
    });

    it('says nothing about too few names, or a side that does not vary', () => {
        expect(MIN_CROSS_SECTION).toBe(10);
        expect(spearman(up.slice(0, 9), up.slice(0, 9))).toBeNull();
        expect(spearman(up, up.map(() => 1))).toBeNull();
    });
});

describe('neweyWestT', () => {
    it('is the plain t-statistic of the mean with no lags', () => {
        // Mean 2, population variance 2/3: t = 2 / √(2/9).
        expect(neweyWestT([1, 2, 3], 0)).toBeCloseTo(2 / Math.sqrt(2 / 9), 12);
    });

    it('widens the error when neighbouring values move together, as overlapping returns do', () => {
        const persistent = [0.1, 0.1, 0.1, -0.05, -0.05, -0.05, 0.12, 0.12, 0.12, -0.02, -0.02, -0.02];
        const plain = neweyWestT(persistent, 0) as number;
        const adjusted = neweyWestT(persistent, 2) as number;
        expect(Math.abs(adjusted)).toBeLessThan(Math.abs(plain));
        expect(Math.sign(adjusted)).toBe(Math.sign(plain));
    });

    it('is null for a series that does not vary, or is too short', () => {
        expect(neweyWestT([0.02, 0.02, 0.02], 1)).toBeNull();
        expect(neweyWestT([0.02], 0)).toBeNull();
    });
});

describe('summarizeIc', () => {
    it('needs enough weeks to say anything', () => {
        expect(MIN_IC_WEEKS).toBe(8);
        expect(summarizeIc([0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1], 1)).toBeNull();
    });

    it('gives the mean, the overlap-aware t and the share of weeks above zero', () => {
        const ics = [0.05, -0.02, 0.04, 0.01, 0.06, -0.01, 0.03, 0.02, 0.05, 0.0];
        const summary = summarizeIc(ics, 4);
        expect(summary).not.toBeNull();
        expect(summary?.weeks).toBe(10);
        expect(summary?.meanIc).toBeCloseTo(0.023, 12);
        expect(summary?.positiveShare).toBeCloseTo(0.7, 12);
        expect(summary?.tStat).toBeCloseTo(neweyWestT(ics, 3) as number, 12);
    });
});

describe('icTable', () => {
    const row = (signal: string, horizonWeeks: number, meanIc: number): IcRow => ({signal, horizonWeeks, meanIc, tStat: 1, weeks: 40, positiveShare: 0.5});
    const order = [{id: 'score', label: 'Whole score', strong: true}, {id: 'news', label: 'Slow news weight'}, {id: 'empty', label: 'No figure'}];

    it("keeps the brain's order, only the horizons with a figure, and a gap where a cell has none", () => {
        const table = icTable([row('news', 4, 0.09), row('score', 1, -0.01), row('news', 1, 0.02)], order, [1, 2, 4, 8]);
        expect(table?.horizons).toEqual([1, 4]);
        expect(table?.rows.map((r) => [r.id, r.strong])).toEqual([['score', true], ['news', false]]);
        expect(table?.rows[0].cells).toEqual([{meanIc: -0.01, tStat: 1, weeks: 40, positiveShare: 0.5}, null]);
    });

    it('is null without a figure', () => {
        expect(icTable([], order, [1, 2])).toBeNull();
        expect(icTable([row('unlisted', 1, 0.1)], order, [1])).toBeNull();
    });
});
