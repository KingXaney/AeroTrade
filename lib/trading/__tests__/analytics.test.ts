import {describe, expect, it} from 'vitest';
import {
    benchmarkReturnBetween,
    buildPerfSeries,
    computeMaxDrawdown,
    computeRealizedPnl,
    computeWinStats,
    concentration,
    countUnpriced,
    describeUnpriced,
    drawdownWindow,
    enrichPosition,
    mergeLivePoint,
    toReturnPct,
    unpricedLabel,
    winStatsFromCounts,
} from '@/lib/trading/analytics';
import type {PaperPosition} from '@/lib/trading/types';

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

describe('drawdownWindow', () => {
    it('is null with fewer than two points, like computeMaxDrawdown', () => {
        expect(drawdownWindow([])).toBeNull();
        expect(drawdownWindow([pt('2026-07-01', 100_000)])).toBeNull();
    });

    it('returns a zero window, not null, for a series that never fell', () => {
        const rising = [pt('2026-07-01', 100_000), pt('2026-07-02', 101_000), pt('2026-07-03', 105_000)];
        expect(drawdownWindow(rising)).toEqual({
            pct: 0, peakDate: '2026-07-01', peakValue: 100_000, troughDate: '2026-07-01', troughValue: 100_000,
            recovered: true, recoveryPctNeeded: 0,
        });
        const flat = [pt('2026-07-01', 100_000), pt('2026-07-02', 100_000)];
        expect(drawdownWindow(flat)?.pct).toBe(0);
    });

    it('dates the worst stretch: the peak before it, the low, and the climb back it needs', () => {
        const series = [
            pt('2026-08-01', 100_000),
            pt('2026-08-03', 101_000),   // peak
            pt('2026-08-10', 96_000),
            pt('2026-08-21', 92_819),    // trough: −8.1%
            pt('2026-08-25', 97_000),
        ];
        const window = drawdownWindow(series);
        expect(window).toMatchObject({peakDate: '2026-08-03', peakValue: 101_000, troughDate: '2026-08-21', troughValue: 92_819, recovered: false});
        expect(window?.pct).toBeCloseTo(8.1, 2);
        expect(window?.recoveryPctNeeded).toBeCloseTo((101_000 / 92_819 - 1) * 100, 10);
    });

    it('is recovered once a later point reaches the old peak', () => {
        const series = [pt('2026-07-01', 100), pt('2026-07-02', 80), pt('2026-07-03', 99.99), pt('2026-07-04', 100)];
        expect(drawdownWindow(series)?.recovered).toBe(true);
        expect(drawdownWindow(series.slice(0, 3))?.recovered).toBe(false);
    });

    it('keeps the later, deeper window over an earlier shallow one, and the first of two equal ones', () => {
        const later = [pt('2026-07-01', 100_000), pt('2026-07-02', 80_000), pt('2026-07-03', 150_000), pt('2026-07-04', 105_000)];
        expect(drawdownWindow(later)).toMatchObject({peakDate: '2026-07-03', troughDate: '2026-07-04'});
        const twice = [pt('2026-07-01', 100), pt('2026-07-02', 90), pt('2026-07-03', 100), pt('2026-07-04', 90)];
        expect(drawdownWindow(twice)).toMatchObject({peakDate: '2026-07-01', troughDate: '2026-07-02', recovered: true});
    });

    // A flat stretch at the high is not part of the fall: the window starts at the LAST day the
    // account stood at its peak, so the band, the hint and "SPY same days" span the fall alone.
    it('starts at the latest of several equal highs', () => {
        const series = [
            pt('2026-09-01', 100_000), pt('2026-09-02', 100_000), pt('2026-09-03', 100_000), pt('2026-09-04', 100_000),
            pt('2026-09-08', 97_000), pt('2026-09-09', 94_000),
        ];
        expect(drawdownWindow(series)).toMatchObject({peakDate: '2026-09-04', peakValue: 100_000, troughDate: '2026-09-09', troughValue: 94_000});
        // A return to the same high after a fall moves the start too.
        const back = [pt('2026-07-01', 100), pt('2026-07-02', 95), pt('2026-07-03', 100), pt('2026-07-06', 100), pt('2026-07-07', 80)];
        expect(drawdownWindow(back)).toMatchObject({peakDate: '2026-07-06', troughDate: '2026-07-07'});
    });

    // computeMaxDrawdown is drawdownWindow(...).pct, so comparing the two proves nothing; the
    // window is held instead to a brute force over every earlier/later pair of points.
    it('finds the same fall a brute force over every pair of days finds', () => {
        const bruteForce = (values: number[]): number => {
            let worst = 0;
            values.forEach((high, i) => values.slice(i).forEach((low) => { worst = Math.max(worst, ((high - low) / high) * 100); }));
            return worst;
        };
        const cases = [
            [100_000, 120_000, 90_000, 110_000],
            [100, 80, 150, 105, 160, 90, 95],
            [50, 60, 55, 70, 40, 45, 80, 20],
            [100, 100, 100],
            [10, 9, 8, 7, 6],
        ];
        for (const values of cases) {
            const series = values.map((value, i) => pt(`2026-07-${String(i + 1).padStart(2, '0')}`, value));
            const window = drawdownWindow(series);
            expect(window?.pct, values.join(',')).toBeCloseTo(bruteForce(values), 10);
            expect(computeMaxDrawdown(series), values.join(',')).toBeCloseTo(bruteForce(values), 10);
            if (window && window.pct > 0) {
                expect(((window.peakValue - window.troughValue) / window.peakValue) * 100, values.join(',')).toBeCloseTo(window.pct, 10);
                expect(window.peakDate < window.troughDate, values.join(',')).toBe(true);
            }
        }
        expect(drawdownWindow([pt('2026-07-01', 100_000), pt('2026-07-02', 120_000), pt('2026-07-03', 90_000)])?.pct).toBe(25);
    });
});

describe('benchmarkReturnBetween', () => {
    const perf = (date: string, accountPct: number, benchmarkPct: number | null) => ({date, accountPct, benchmarkPct});
    const series = [
        perf('2026-08-01', 0, 0),
        perf('2026-08-03', 1, 10),
        perf('2026-08-21', -7, 6.59),
        perf('2026-08-25', -3, null),
    ];

    it('compounds the two since-inception returns rather than subtracting them', () => {
        // 1.0659 / 1.10 − 1 = −3.1%
        expect(benchmarkReturnBetween(series, '2026-08-03', '2026-08-21')).toBeCloseTo(-3.1, 2);
        expect(benchmarkReturnBetween(series, '2026-08-01', '2026-08-03')).toBeCloseTo(10, 10);
    });

    it('reads the last point on or before each date', () => {
        expect(benchmarkReturnBetween(series, '2026-08-02', '2026-08-20')).toBeCloseTo(10, 10);
    });

    it('is null where the benchmark has no value or the dates fall outside the series', () => {
        expect(benchmarkReturnBetween(series, '2026-08-03', '2026-08-25')).toBeNull();
        expect(benchmarkReturnBetween(series, '2026-07-01', '2026-08-03')).toBeNull();
        expect(benchmarkReturnBetween([], '2026-08-01', '2026-08-03')).toBeNull();
        expect(benchmarkReturnBetween([perf('2026-08-01', 0, null), perf('2026-08-02', 1, 0)], '2026-08-01', '2026-08-02')).toBeNull();
    });
});

describe('concentration', () => {
    const position = (symbol: string, marketValue: number, priceStale = false) => ({symbol, marketValue, priceStale});

    it('names the largest position and its share of the whole account, cash included', () => {
        const c = concentration([position('SPY', 20_000), position('NVDA', 41_000)], 39_000, 100_000);
        expect(c.largest).toEqual({symbol: 'NVDA', weight: 0.41, marketValue: 41_000, priceStale: false});
        expect(c.cashWeight).toBeCloseTo(0.39, 12);
        expect(c.holdings).toBe(2);
    });

    it('carries whether that position is valued at cost', () => {
        expect(concentration([position('AAPL', 1_500, true)], 98_500, 100_000).largest?.priceStale).toBe(true);
    });

    it('has no largest position in an all-cash account', () => {
        expect(concentration([], 100_000, 100_000)).toEqual({largest: null, cashWeight: 1, holdings: 0});
    });

    it('never divides by an empty account', () => {
        const c = concentration([position('SPY', 0)], 0, 0);
        expect(c.largest?.weight).toBe(0);
        expect(c.cashWeight).toBe(0);
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

// The chat's win rate counts sells in the database ($group) instead of reading them back; the
// arithmetic on those counts is this one function, which computeWinStats also ends in.
describe('winStatsFromCounts', () => {
    it('is null (not 0%) with nothing closed, and wins over closed otherwise', () => {
        expect(winStatsFromCounts({closed: 0, wins: 0})).toEqual({wins: 0, losses: 0, winRatePct: null});
        expect(winStatsFromCounts({closed: 4, wins: 3})).toEqual({wins: 3, losses: 1, winRatePct: 75});
    });

    it('is what computeWinStats gives for the same trades', () => {
        const trades = [{side: 'buy'}, {side: 'sell', realizedPnl: 250}, {side: 'sell'}, {side: 'sell', realizedPnl: 0}, {side: 'sell', realizedPnl: -5}];
        expect(computeWinStats(trades)).toEqual(winStatsFromCounts({closed: 3, wins: 1}));
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

describe('enrichPosition', () => {
    const held: PaperPosition = {symbol: 'NVDA', company: 'NVIDIA Corp', quantity: 10, avgCost: 100};

    it('prices a position from the quote and flags it live', () => {
        const p = enrichPosition(held, {price: 120, changePercent: 1.5});
        expect(p).toMatchObject({
            costBasis: 1000, marketValue: 1200, unrealizedPnl: 200, unrealizedPnlPct: 20,
            currentPrice: 120, changePercent: 1.5, priceStale: false,
        });
    });

    it('falls back to cost basis when the quote is missing — and says so', () => {
        // The value must stay at cost (it feeds the snapshot series), but the
        // resulting +$0.00 must never be presentable as a real, flat P&L.
        const p = enrichPosition(held, undefined);
        expect(p.marketValue).toBe(1000);
        expect(p.unrealizedPnl).toBe(0);
        expect(p.currentPrice).toBeUndefined();
        expect(p.priceStale).toBe(true);
    });

    it('treats a quote row without a price the same as no quote', () => {
        expect(enrichPosition(held, {changePercent: 2}).priceStale).toBe(true);
    });

    it('does not divide by a zero cost basis', () => {
        const p = enrichPosition({...held, avgCost: 0}, {price: 5});
        expect(p.unrealizedPnlPct).toBe(0);
        expect(Number.isFinite(p.unrealizedPnlPct)).toBe(true);
    });

    it('falls back to the symbol when the stored company is blank', () => {
        expect(enrichPosition({...held, company: ''}, {price: 1}).company).toBe('NVDA');
    });
});

describe('unpriced summaries', () => {
    const stale = {priceStale: true};
    const live = {priceStale: false};

    it('counts only the flagged positions', () => {
        expect(countUnpriced([])).toBe(0);
        expect(countUnpriced([live, stale, stale])).toBe(2);
    });

    it('says nothing when every position is priced', () => {
        expect(describeUnpriced(0, 3)).toBeNull();
        expect(describeUnpriced(0, 0)).toBeNull();
    });

    it('labels a ranked return as unpriced only when nothing behind it is live', () => {
        expect(unpricedLabel(0, 3)).toBeNull();
        expect(unpricedLabel(0, 0)).toBeNull();
        expect(unpricedLabel(1, 3)).toBe('partly unpriced');
        expect(unpricedLabel(3, 3)).toBe('unpriced');
        expect(unpricedLabel(1, 1)).toBe('unpriced');
    });

    it('names the partial, total and single-holding cases', () => {
        expect(describeUnpriced(1, 3)).toBe('1 of 3 holdings is unpriced — valued at cost, P&L withheld');
        expect(describeUnpriced(2, 3)).toBe('2 of 3 holdings are unpriced — valued at cost, P&L withheld');
        expect(describeUnpriced(3, 3)).toBe('All 3 holdings are unpriced — valued at cost, P&L withheld');
        expect(describeUnpriced(1, 1)).toBe('This holding is unpriced — valued at cost, P&L withheld');
    });
});
