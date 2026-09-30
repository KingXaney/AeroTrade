// The what-if step with the stores stubbed: it simulates on the T-bill points its readiness
// check read (one read of the series, not three), and attaches the grid to the backtest build it
// was computed beside — never to whatever build is stored when the save lands.

import {beforeEach, describe, expect, it, vi} from 'vitest';

const calls = vi.hoisted(() => ({rates: 0, saved: [] as {strategyId: string; version: string; computedAt: number; ids: string[]}[], simulatedWith: [] as unknown[]}));

vi.mock('@/lib/prices/store', () => ({
    symbolsLackingDividendCoverage: async () => [],
    getRatePoints: async () => {
        calls.rates += 1;
        return [{date: '2020-01-02', discountPct: 4}, {date: '2026-09-29', discountPct: 4}];
    },
}));
vi.mock('@/lib/strategies/store', () => ({
    loadDecisionInput: vi.fn(),
    savePlannedRun: vi.fn(),
    saveBacktest: vi.fn(),
    loadSimulationBars: async () => new Map(),
    saveVariants: async (strategyId: string, version: string, computedAt: number, variants: {id: string}[]) => {
        calls.saved.push({strategyId, version, computedAt, ids: variants.map((v) => v.id)});
        return true;
    },
}));
vi.mock('@/lib/strategies/simulate', () => ({
    simulateStrategy: (_def: unknown, _bars: unknown, options: {rates: unknown}) => {
        calls.simulatedWith.push(options.rates);
        return {from: '2023-01-03', to: '2026-09-29', points: [{date: '2023-01-03', value: 100_000}], stats: {}, closeFills: 0, skippedDays: 0, trades: [], benchmark: [], fillRule: 'next-open', rejections: []};
    },
}));

import {simulateVariantsForStrategy} from '@/lib/strategies/runner';
import {strategyBySlug, effectiveVersion} from '@/lib/strategies/catalog';
import {gridFor} from '@/lib/strategies/whatif';

const BUILT = Date.parse('2026-09-28T13:40:00Z');

describe('simulateVariantsForStrategy', () => {
    beforeEach(() => {
        calls.rates = 0;
        calls.saved = [];
        calls.simulatedWith = [];
    });

    it('reads the T-bill series once and simulates every variant on the points it checked', async () => {
        const def = strategyBySlug('golden-cross');
        if (!def) throw new Error('golden-cross missing');
        const result = await simulateVariantsForStrategy(def, '2026-09-01', BUILT);
        expect(result.computed).toBe(gridFor(def).length);
        expect(calls.rates).toBe(1);
        expect(calls.simulatedWith).toHaveLength(gridFor(def).length);
        expect(new Set(calls.simulatedWith).size).toBe(1);
        expect(calls.saved).toEqual([{strategyId: def.id, version: effectiveVersion(def), computedAt: BUILT, ids: gridFor(def).map((v) => v.id)}]);
    });

    it('computes nothing without a stored build to attach the grid to', async () => {
        const def = strategyBySlug('golden-cross');
        if (!def) throw new Error('golden-cross missing');
        expect(await simulateVariantsForStrategy(def, '2026-09-01', null)).toEqual({computed: 0});
        expect(calls.rates).toBe(0);
        expect(calls.saved).toEqual([]);
    });
});
