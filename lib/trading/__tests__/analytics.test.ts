import {describe, expect, it} from 'vitest';
import {
    buildPerfSeries,
    computeMaxDrawdown,
    computeRealizedPnl,
    computeWinStats,
    mergeLivePoint,
    toReturnPct,
} from '@/lib/trading/analytics';

const pt = (date: string, value: number) => ({date, value});

describe('toReturnPct', () => {
    it('computes percentage return from a base', () => {
        expect(toReturnPct(110_000, 100_000)).toBeCloseTo(10);
        expect(toReturnPct(95_000, 100_000)).toBeCloseTo(-5);
    });

    it('returns 0 when the base is not positive', () => {
        expect(toReturnPct(100, 0)).toBe(0);
    });
});

describe('computeMaxDrawdown', () => {
    it('is null with fewer than two points', () => {
        expect(computeMaxDrawdown([])).toBeNull();
        expect(computeMaxDrawdown([pt('2026-07-01', 100_000)])).toBeNull();
    });

    it('is 0 for a monotonically rising series', () => {
        const series = [pt('2026-07-01', 100_000), pt('2026-07-02', 101_000), pt('2026-07-03', 105_000)];
        expect(computeMaxDrawdown(series)).toBe(0);
    });

    it('measures the largest peak-to-trough decline', () => {
        const series = [
            pt('2026-07-01', 100_000),
            pt('2026-07-02', 120_000),  // peak
            pt('2026-07-03', 90_000),   // -25% from peak
            pt('2026-07-04', 110_000),
            pt('2026-07-05', 104_500),  // only -5% from the 110k local peak
        ];
        expect(computeMaxDrawdown(series)).toBeCloseTo(25);
    });

    it('uses the later, higher peak for subsequent troughs', () => {
        const series = [
            pt('2026-07-01', 100_000),
            pt('2026-07-02', 80_000),   // -20%
            pt('2026-07-03', 150_000),  // new peak
            pt('2026-07-04', 105_000),  // -30% from 150k
        ];
        expect(computeMaxDrawdown(series)).toBeCloseTo(30);
    });
});

describe('computeWinStats', () => {
    it('is null (not 0%) when no position has been closed', () => {
        expect(computeWinStats([]).winRatePct).toBeNull();
        expect(computeWinStats([{side: 'buy'}]).winRatePct).toBeNull();
        // A sell without a recorded realizedPnl (legacy row) is not a closed trade.
        expect(computeWinStats([{side: 'sell'}]).winRatePct).toBeNull();
    });

    it('counts only sells with realizedPnl; win = positive', () => {
        const stats = computeWinStats([
            {side: 'buy'},
            {side: 'sell', realizedPnl: 250},
            {side: 'sell', realizedPnl: -120},
            {side: 'sell', realizedPnl: 0},  // break-even counts as a loss
            {side: 'sell', realizedPnl: 10},
        ]);
        expect(stats.wins).toBe(2);
        expect(stats.losses).toBe(2);
        expect(stats.winRatePct).toBeCloseTo(50);
    });
});

describe('computeRealizedPnl', () => {
    it('sums realized P&L across trades, ignoring buys and missing values', () => {
        expect(computeRealizedPnl([
            {side: 'buy'},
            {side: 'sell', realizedPnl: 100},
            {side: 'sell', realizedPnl: -40},
        ])).toBeCloseTo(60);
    });
});

describe('mergeLivePoint', () => {
    it('sorts snapshots and appends a newer live point', () => {
        const merged = mergeLivePoint(
            [pt('2026-07-02', 101_000), pt('2026-07-01', 100_000)],
            pt('2026-07-03', 102_000),
        );
        expect(merged.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    });

    it('replaces an existing snapshot for the same date (live is fresher)', () => {
        const merged = mergeLivePoint(
            [pt('2026-07-01', 100_000), pt('2026-07-02', 101_000)],
            pt('2026-07-02', 99_500),
        );
        expect(merged).toHaveLength(2);
        expect(merged[1].value).toBe(99_500);
    });

    it('ignores a live point older than the newest snapshot', () => {
        const merged = mergeLivePoint(
            [pt('2026-07-01', 100_000), pt('2026-07-03', 103_000)],
            pt('2026-07-02', 99_000),
        );
        expect(merged.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-03']);
    });
});

describe('buildPerfSeries', () => {
    it('returns [] with no snapshots', () => {
        expect(buildPerfSeries([], [pt('2026-07-01', 500)])).toEqual([]);
    });

    it('normalizes both series to the first shared date', () => {
        const series = buildPerfSeries(
            [pt('2026-07-01', 100_000), pt('2026-07-02', 110_000)],
            [pt('2026-07-01', 500), pt('2026-07-02', 505)],
        );
        expect(series[0]).toEqual({date: '2026-07-01', accountPct: 0, benchmarkPct: 0});
        expect(series[1].accountPct).toBeCloseTo(10);
        expect(series[1].benchmarkPct).toBeCloseTo(1);
    });

    it('forward-fills the benchmark across dates it does not cover (holidays)', () => {
        const series = buildPerfSeries(
            [pt('2026-07-01', 100_000), pt('2026-07-02', 102_000), pt('2026-07-03', 104_000)],
            [pt('2026-07-01', 500), pt('2026-07-03', 510)],
        );
        expect(series[1].benchmarkPct).toBeCloseTo(0);   // carried forward from 07-01
        expect(series[2].benchmarkPct).toBeCloseTo(2);
    });

    it('yields null benchmark before the first benchmark point', () => {
        const series = buildPerfSeries(
            [pt('2026-07-01', 100_000), pt('2026-07-02', 101_000)],
            [pt('2026-07-02', 500)],
        );
        expect(series[0].benchmarkPct).toBeNull();
        // Benchmark base anchors at its first covered date, so that date reads 0%.
        expect(series[1].benchmarkPct).toBeCloseTo(0);
    });

    it('appends the live point as the final entry', () => {
        const series = buildPerfSeries(
            [pt('2026-07-01', 100_000)],
            [pt('2026-07-01', 500)],
            pt('2026-07-02', 108_000),
        );
        expect(series).toHaveLength(2);
        expect(series[1].accountPct).toBeCloseTo(8);
    });
});
