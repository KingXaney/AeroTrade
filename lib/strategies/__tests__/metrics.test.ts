import {describe, expect, it} from "vitest";
import {annualizedVolPct, cagrPct, summarizeSeries, totalReturnPct} from "@/lib/strategies/metrics";

const pts = (values: number[], start = 1): {date: string; value: number}[] =>
    values.map((value, i) => ({date: `2025-01-${String(start + i).padStart(2, '0')}`, value}));

describe("totalReturnPct / cagrPct", () => {
    it("are null under two points and match hand-computed values", () => {
        expect(totalReturnPct(pts([100]))).toBeNull();
        expect(totalReturnPct(pts([100, 110]))).toBeCloseTo(10, 10);
        // 10% over 10 calendar days → (1.1)^(365.25/10) − 1
        expect(cagrPct([{date: '2025-01-01', value: 100}, {date: '2025-01-11', value: 110}]))
            .toBeCloseTo((1.1 ** (365.25 / 10) - 1) * 100, 8);
        expect(cagrPct([{date: '2025-01-01', value: 100}, {date: '2025-01-01', value: 110}])).toBeNull();
        expect(totalReturnPct(pts([0, 10]))).toBeNull();
    });
});

describe("annualizedVolPct", () => {
    it("is null under three points, zero on a flat series, and √252-scaled otherwise", () => {
        expect(annualizedVolPct(pts([100, 101]))).toBeNull();
        expect(annualizedVolPct(pts([100, 100, 100]))).toBe(0);
        const logs = [Math.log(1.1), Math.log(0.9)];
        const mean = (logs[0] + logs[1]) / 2;
        const variance = ((logs[0] - mean) ** 2 + (logs[1] - mean) ** 2) / 2;
        expect(annualizedVolPct(pts([100, 110, 99]))).toBeCloseTo(Math.sqrt(variance) * Math.sqrt(252) * 100, 10);
    });
});

describe("summarizeSeries", () => {
    it("fills every field and aligns the benchmark to the series window", () => {
        const points = pts([100, 120, 90, 108], 2);
        const benchmark = pts([50, 55, 60, 45, 66], 1); // wider than the series
        const stats = summarizeSeries(points, [
            {side: 'sell', realizedPnl: 5},
            {side: 'sell', realizedPnl: -1},
            {side: 'buy'},
        ], benchmark);
        expect(stats.totalReturnPct).toBeCloseTo(8, 10);
        expect(stats.maxDrawdownPct).toBeCloseTo(25, 10);
        expect(stats.winRatePct).toBe(50);
        expect(stats.wins).toBe(1);
        expect(stats.losses).toBe(1);
        expect(stats.tradeCount).toBe(3);
        // benchmark rows inside 01-02..01-05: 55 → 66
        expect(stats.benchmarkReturnPct).toBeCloseTo(20, 10);
        expect(stats.excessReturnPct).toBeCloseTo(8 - 20, 10);
        expect(stats.cagrPct).not.toBeNull();
        expect(stats.annualizedVolPct).not.toBeNull();
    });

    it("degrades to nulls on a single point", () => {
        const stats = summarizeSeries(pts([100]), [], []);
        expect(stats.totalReturnPct).toBeNull();
        expect(stats.cagrPct).toBeNull();
        expect(stats.annualizedVolPct).toBeNull();
        expect(stats.maxDrawdownPct).toBeNull();
        expect(stats.winRatePct).toBeNull();
        expect(stats.benchmarkReturnPct).toBeNull();
        expect(stats.excessReturnPct).toBeNull();
    });
});
