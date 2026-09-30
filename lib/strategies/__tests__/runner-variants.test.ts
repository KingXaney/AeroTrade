// The what-if step with the stores stubbed: it runs every variant on the stored backtest's own
// inputs, simulates on the T-bill points its readiness check read (one read of the series, not
// three), and attaches the grid to the backtest build it was computed beside — never to whatever
// build is stored when the save lands. saveVariants' filter itself runs on Mongo in qa-strategies.

import {beforeEach, describe, expect, it, vi} from 'vitest';

const calls = vi.hoisted(() => ({
    rates: 0,
    saved: [] as {strategyId: string; version: string; computedAt: number; ids: string[]}[],
    simulatedWith: [] as unknown[],
    simulated: [] as {def: unknown; bars: unknown; options: unknown}[],
}));

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
    simulateStrategy: (def: unknown, bars: unknown, options: {rates: unknown}) => {
        calls.simulatedWith.push(options.rates);
        calls.simulated.push({def, bars, options});
        return {from: '2023-01-03', to: '2026-09-29', points: [{date: '2023-01-03', value: 100_000}], stats: {}, closeFills: 0, skippedDays: 0, trades: [], benchmark: [], fillRule: 'next-open', rejections: []};
    },
}));

import {simulateForStrategy, simulateVariantsForStrategy} from '@/lib/strategies/runner';
import {strategyBySlug, effectiveVersion} from '@/lib/strategies/catalog';
import {applyOverrides, gridFor} from '@/lib/strategies/whatif';

const BUILT = Date.parse('2026-09-28T13:40:00Z');

describe('simulateVariantsForStrategy', () => {
    beforeEach(() => {
        calls.rates = 0;
        calls.saved = [];
        calls.simulatedWith = [];
        calls.simulated = [];
    });

    it('runs each variant with exactly the inputs the stored backtest is built with, the setting alone moved', async () => {
        // A variant on another window, balance or rate series would not share the backtest's
        // dates, and the lab would drop it: the same options object, value for value.
        const def = strategyBySlug('golden-cross');
        if (!def) throw new Error('golden-cross missing');
        await simulateForStrategy(def, '2026-09-01');
        expect(calls.simulated).toHaveLength(1);
        const [backtest] = calls.simulated;
        calls.simulated = [];
        await simulateVariantsForStrategy(def, '2026-09-01', BUILT);
        expect(calls.simulated).toHaveLength(gridFor(def).length);
        gridFor(def).forEach((variant, i) => {
            expect(calls.simulated[i].options, variant.id).toEqual(backtest.options);
            expect(calls.simulated[i].bars, variant.id).toEqual(backtest.bars);
            expect(calls.simulated[i].def, variant.id).toEqual(applyOverrides(def, variant.overrides));
        });
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
