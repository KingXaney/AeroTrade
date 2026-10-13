import {describe, expect, it} from 'vitest';
import {cultureBacktestDue, toBacktestView, type StoredCultureBacktest} from '@/lib/culture/backtest';
import type {SeriesStats} from '@/lib/strategies/types';

const stats = (totalReturnPct: number, benchmarkReturnPct: number): SeriesStats => ({
    totalReturnPct, cagrPct: 1, annualizedVolPct: 10, maxDrawdownPct: 5, winRatePct: null, wins: 0, losses: 0, tradeCount: 0, benchmarkReturnPct, excessReturnPct: totalReturnPct - benchmarkReturnPct,
});

describe('cultureBacktestDue', () => {
    const stamp = {version: '1', catalogHash: 'abc', computedAt: 1};

    it('rebuilds before any build, on a new version, a changed catalog, or a resimulate', () => {
        expect(cultureBacktestDue(null, {version: '1', catalogHash: 'abc', resimulate: false})).toBe(true);
        expect(cultureBacktestDue(stamp, {version: '2', catalogHash: 'abc', resimulate: false})).toBe(true);
        expect(cultureBacktestDue(stamp, {version: '1', catalogHash: 'def', resimulate: false})).toBe(true);
        expect(cultureBacktestDue(stamp, {version: '1', catalogHash: 'abc', resimulate: true})).toBe(true);
    });

    it('keeps a build whose version and catalog still hold', () => {
        expect(cultureBacktestDue(stamp, {version: '1', catalogHash: 'abc', resimulate: false})).toBe(false);
    });
});

describe('toBacktestView', () => {
    const stored: StoredCultureBacktest = {
        version: '1', catalogHash: 'abc', feeds: ['price', 'wikipedia'], from: '2021-10-04', to: '2026-10-03',
        benchmark: [{date: '2021-10-04', value: 400}, {date: '2021-10-05', value: 404}],
        computedAt: 1_700_000_000_000,
        variants: [
            {profile: 'quiet', weeks: 260, turnoverPct: 80, closeFills: 0, tradeCount: 40, points: [{date: '2021-10-04', value: 100_000}, {date: '2021-10-05', value: 101_000}], stats: stats(1, 1)},
            {profile: 'price', weeks: 260, turnoverPct: 20, closeFills: 1, tradeCount: 10, points: [{date: '2021-10-04', value: 100_000}, {date: '2021-10-05', value: 102_000}], stats: stats(2, 1)},
            {profile: 'spike', weeks: 260, turnoverPct: 90, closeFills: 0, tradeCount: 60, points: [{date: '2021-10-04', value: 100_000}, {date: '2021-10-05', value: 99_000}], stats: stats(-1, 1)},
        ],
    };

    it('orders the variants by the registry, never by return, and draws each as a return series against SPY', () => {
        const view = toBacktestView(stored);
        expect(view.variants.map((v) => v.profile)).toEqual(['spike', 'quiet', 'price']);
        expect(view.variants.map((v) => v.label)).toEqual(['Spike', 'Quiet', 'Price only']);
        expect(view.benchmarkReturnPct).toBe(1);
        expect(view.feeds).toEqual(['price', 'wikipedia']);
        const spike = view.variants[0];
        expect(spike.series[0].accountPct).toBe(0);
        expect(spike.series[1].accountPct).toBeCloseTo(-1, 9);
        expect(spike.series[0].benchmarkPct).toBe(0);
        expect(spike.series[1].benchmarkPct).toBeCloseTo(1, 9);
        expect(spike.from).toBe('2021-10-04');
        expect(spike.to).toBe('2021-10-05');
        expect(spike.tradeCount).toBe(60);
    });

    it('skips a stored profile the registry no longer knows', () => {
        const view = toBacktestView({...stored, variants: [{...stored.variants[0], profile: 'retired'}]});
        expect(view.variants).toEqual([]);
        expect(view.benchmarkReturnPct).toBeNull();
    });
});
