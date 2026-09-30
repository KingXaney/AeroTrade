// The what-if lab's pure layer: which knobs each strategy exposes and how far they turn, the
// schema a setting must pass, how a setting becomes a definition the unchanged engine runs
// (without touching the catalog), the fixed nightly grid, the diff a page prints and the
// compact view it draws. That every knob actually moves the engine is whatif-engine.test.ts.

import {describe, expect, it} from 'vitest';
import {STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import {LOOKBACK_BARS} from '@/lib/strategies/config';
import {findParam} from '@/lib/strategies/params';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import type {SimulationResult, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {UNIVERSES} from '@/lib/strategies/universe';
import {visibleSignalColumns} from '@/lib/strategies/views';
import {
    applyOverrides,
    gridFor,
    labKnobs,
    overridesSchema,
    paramDiff,
    PARAM_RANGES,
    toWhatIfView,
    WHATIF_MAX_VARIANTS,
    WHATIF_VIEW_POINTS,
    whatIfLab,
    whatIfPoints,
    type StoredWhatIfVariant,
    type WhatIfBacktest,
} from '@/lib/strategies/whatif';
import {genericContext} from '@/lib/strategies/__tests__/fixtures';

const def = (id: StrategyId): StrategyDefinition => strategyBySlug(id) as StrategyDefinition;
const onStep = (value: number, range: {min: number; step: number}) => {
    const k = (value - range.min) / range.step;
    return Math.abs(k - Math.round(k)) < 1e-9;
};

const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === 'object') {
        for (const inner of Object.values(value)) deepFreeze(inner);
        Object.freeze(value);
    }
    return value;
};

describe('PARAM_RANGES', () => {
    it('covers every strategy; buy and hold has no knob and 60/40 exposes spyWeight only', () => {
        expect(Object.keys(PARAM_RANGES).sort()).toEqual(STRATEGIES.map((d) => d.id).sort());
        expect(PARAM_RANGES['buy-and-hold-spy']).toEqual({});
        expect(Object.keys(PARAM_RANGES['sixty-forty'])).toEqual(['spyWeight']);
    });

    it('every knob is a catalog parameter whose value sits inside its range, on its step', () => {
        for (const d of STRATEGIES) {
            for (const [key, range] of Object.entries(PARAM_RANGES[d.id])) {
                const value = findParam(d, key);
                expect(value, `${d.id}.${key}`).not.toBeNull();
                expect(range.min, `${d.id}.${key}`).toBeLessThan(range.max);
                expect(range.step).toBeGreaterThan(0);
                expect(onStep(range.max, range), `${d.id}.${key} max on step`).toBe(true);
                expect(value as number).toBeGreaterThanOrEqual(range.min);
                expect(value as number).toBeLessThanOrEqual(range.max);
                expect(onStep(value as number, range), `${d.id}.${key} catalog on step`).toBe(true);
            }
        }
    });

    it('every max is at most LOOKBACK_BARS, and at its max each window still reads on LOOKBACK_BARS bars', () => {
        for (const d of STRATEGIES) {
            for (const [key, range] of Object.entries(PARAM_RANGES[d.id])) {
                expect(range.max, `${d.id}.${key}`).toBeLessThanOrEqual(LOOKBACK_BARS);
                // The decision sees exactly LOOKBACK_BARS bars: at the max, some row is still scored
                // and every board column still has a value somewhere.
                const variant = applyOverrides(d, {[key]: range.max});
                const board = STRATEGY_RULES[d.id](variant, genericContext(variant)).board;
                const universeRows = board.filter((row) => UNIVERSES[d.universe].includes(row.symbol));
                expect(universeRows.some((row) => row.state !== 'excluded'), `${d.id}.${key}=${range.max}`).toBe(true);
                expect(visibleSignalColumns(d.signalColumns, board).map((c) => c.key), `${d.id}.${key}=${range.max}`)
                    .toEqual(d.signalColumns.map((c) => c.key));
            }
        }
    });

    it('a `top` knob mirrors the catalog slots, since the engine sizes by def.slots', () => {
        for (const d of STRATEGIES) {
            if ('top' in PARAM_RANGES[d.id]) expect(findParam(d, 'top'), d.id).toBe(d.slots);
        }
    });
});

describe('overridesSchema', () => {
    it('accepts the empty setting, each range end and the catalog value', () => {
        for (const d of STRATEGIES) {
            const schema = overridesSchema(d);
            expect(schema.safeParse({}).success, d.id).toBe(true);
            for (const [key, range] of Object.entries(PARAM_RANGES[d.id])) {
                for (const value of [range.min, range.max, findParam(d, key) as number]) {
                    expect(schema.safeParse({[key]: value}).success, `${d.id}.${key}=${value}`).toBe(true);
                }
            }
        }
    });

    it('refuses unknown keys, values off the range or off the step, and non-numbers', () => {
        expect(overridesSchema(def('buy-and-hold-spy')).safeParse({allocation: 0.5}).success).toBe(false);
        const sixty = overridesSchema(def('sixty-forty'));
        expect(sixty.safeParse({aggWeight: 0.3}).success).toBe(false);
        expect(sixty.safeParse({spyWeight: 1.5}).success).toBe(false);
        expect(sixty.safeParse({spyWeight: 0.65}).success).toBe(false);
        const rsi = overridesSchema(def('rsi2-mean-reversion'));
        expect(rsi.safeParse({entryRsi: 7}).success).toBe(false);
        expect(rsi.safeParse({entryRsi: '5'}).success).toBe(false);
        expect(rsi.safeParse({entryRsi: Number.NaN}).success).toBe(false);
        expect(rsi.safeParse({entryRsi: 5}).success).toBe(true);
    });

    it('keeps the fast average below the slow one, against the catalog value of the other', () => {
        const golden = overridesSchema(def('golden-cross'));
        expect(golden.safeParse({fast: 100, slow: 100}).success).toBe(false);
        expect(golden.safeParse({fast: 150, slow: 100}).success).toBe(false);
        expect(golden.safeParse({fast: 100, slow: 150}).success).toBe(true);
        // Catalog fast is 50: a slow of 60 passes. Catalog slow is 200: a fast of 150 passes.
        expect(golden.safeParse({slow: 60}).success).toBe(true);
        expect(golden.safeParse({fast: 150}).success).toBe(true);
    });

    it('compares a lone knob with the catalog value of its partner, whatever that value is', () => {
        // A catalog whose slow average (120) and lookback (42) sit inside the other knob's range:
        // a lone fast of 150 or a lone skip of 42 is out of order against them, a smaller one is not.
        const golden = def('golden-cross');
        const slow120 = overridesSchema({...golden, params: {...golden.params, slow: 120}});
        expect(slow120.safeParse({fast: 150}).success).toBe(false);
        expect(slow120.safeParse({fast: 120}).success).toBe(false);
        expect(slow120.safeParse({fast: 100}).success).toBe(true);
        const momentum = def('momentum-12-1');
        const lookback42 = overridesSchema({...momentum, params: {...momentum.params, lookback: 42}});
        expect(lookback42.safeParse({skip: 42}).success).toBe(false);
        expect(lookback42.safeParse({skip: 21}).success).toBe(true);
    });
});

describe('applyOverrides', () => {
    it('never mutates the catalog definition, and returns fresh params', () => {
        for (const d of STRATEGIES) {
            const frozen = deepFreeze(structuredClone(d));
            for (const variant of gridFor(frozen)) {
                const applied = applyOverrides(frozen, variant.overrides);
                expect(applied).not.toBe(frozen);
                expect(applied.params).not.toBe(frozen.params);
            }
            expect(frozen).toEqual(d);
        }
        const snapshot = JSON.stringify(STRATEGIES);
        for (const d of STRATEGIES) for (const variant of gridFor(d)) applyOverrides(d, variant.overrides);
        expect(JSON.stringify(STRATEGIES)).toBe(snapshot);
    });

    it('writes a `top` override into slots as well as params', () => {
        const low = applyOverrides(def('low-volatility'), {top: 5});
        expect(low.params.top).toBe(5);
        expect(low.slots).toBe(5);
        const momentum = applyOverrides(def('momentum-12-1'), {top: 16});
        expect([momentum.params.top, momentum.slots]).toEqual([16, 16]);
        // Anything else leaves slots alone.
        expect(applyOverrides(def('momentum-12-1'), {skip: 0}).slots).toBe(8);
    });

    it('keeps the 60/40 legs summing to one: the bond weight follows the stock weight', () => {
        for (let tenths = 1; tenths <= 9; tenths += 1) {
            const applied = applyOverrides(def('sixty-forty'), {spyWeight: tenths / 10});
            expect(applied.params.spyWeight).toBe(tenths / 10);
            expect(Number(applied.params.spyWeight) + Number(applied.params.aggWeight)).toBeCloseTo(1, 12);
        }
        expect(applyOverrides(def('sixty-forty'), {spyWeight: 0.8}).params.aggWeight).toBe(0.2);
    });

    it('an empty setting is the catalog rule; an invalid one throws rather than running', () => {
        const d = def('rsi2-mean-reversion');
        const same = applyOverrides(d, {});
        expect({...same.params, slots: same.slots}).toEqual({...d.params, slots: d.slots});
        expect(() => applyOverrides(d, {entryRsi: 7})).toThrow();
        expect(() => applyOverrides(d, {nope: 1})).toThrow();
        expect(() => applyOverrides(def('golden-cross'), {fast: 150, slow: 100})).toThrow();
    });
});

describe('gridFor', () => {
    it('gives each strategy at most four variants, deterministic, with unique ids', () => {
        for (const d of STRATEGIES) {
            const grid = gridFor(d);
            expect(grid.length, d.id).toBeLessThanOrEqual(WHATIF_MAX_VARIANTS);
            expect(gridFor(d)).toEqual(grid);
            expect(new Set(grid.map((v) => v.id)).size).toBe(grid.length);
        }
        expect(gridFor(def('buy-and-hold-spy'))).toEqual([]);
        expect(STRATEGIES.filter((d) => d.id !== 'buy-and-hold-spy').every((d) => gridFor(d).length > 0)).toBe(true);
    });

    it('every variant parses and differs from the catalog in exactly one knob', () => {
        for (const d of STRATEGIES) {
            for (const variant of gridFor(d)) {
                expect(overridesSchema(d).safeParse(variant.overrides).success, variant.id).toBe(true);
                expect(Object.keys(variant.overrides)).toEqual([variant.knob]);
                expect(variant.overrides[variant.knob]).toBe(variant.value);
                expect(paramDiff(d, variant.overrides), `${d.id} ${variant.id}`).toEqual([
                    {key: variant.knob, from: findParam(d, variant.knob), to: variant.value},
                ]);
                // Raw params: only the knob moves, plus the leg or slot count coupled to it.
                const applied = applyOverrides(d, variant.overrides);
                const moved = Object.keys(d.params).filter((key) => applied.params[key] !== d.params[key]);
                const coupled = variant.knob === 'spyWeight' ? ['spyWeight', 'aggWeight'] : [variant.knob];
                expect(moved.sort(), variant.id).toEqual(coupled.sort());
                expect(applied.slots !== d.slots, variant.id).toBe(variant.knob === 'top');
            }
        }
    });
});

describe('paramDiff', () => {
    it('lists changed knobs in range order, skipping ones equal to the catalog', () => {
        const d = def('rsi2-mean-reversion');
        expect(paramDiff(d, {})).toEqual([]);
        expect(paramDiff(d, {entryRsi: 10})).toEqual([]);
        expect(paramDiff(d, {exitSma: 10, entryRsi: 5})).toEqual([
            {key: 'entryRsi', from: 10, to: 5},
            {key: 'exitSma', from: 5, to: 10},
        ]);
    });
});

describe('toWhatIfView', () => {
    const result = (count: number): SimulationResult => {
        // Values with cents: a decimation that rounded would not keep the ends exact.
        const points = Array.from({length: count}, (_, i) => ({date: `d${String(i).padStart(4, '0')}`, value: 100_000 + i * 7.13}));
        return {
            from: points[0].date, to: points[count - 1].date, fillRule: 'next-open', closeFills: 2, skippedDays: 1,
            points, benchmark: points, trades: [], rejections: [], income: [],
            stats: {totalReturnPct: 1, cagrPct: 1, annualizedVolPct: 1, maxDrawdownPct: 0, winRatePct: null, wins: 0, losses: 0, tradeCount: 0, benchmarkReturnPct: 1, excessReturnPct: 0},
        };
    };

    it('keeps at most 120 points, both ends exact, and the run summary', () => {
        const r = result(757);
        const view = toWhatIfView(r);
        expect(WHATIF_VIEW_POINTS).toBe(120);
        expect(view.points).toHaveLength(WHATIF_VIEW_POINTS);
        expect(view.points[0]).toEqual(r.points[0]);
        expect(view.points.at(-1)).toEqual(r.points.at(-1));
        expect(view).toMatchObject({from: r.from, to: r.to, stats: r.stats, closeFills: 2, skippedDays: 1});
        expect(toWhatIfView(result(40)).points).toHaveLength(40);
    });

    it('draws the stored backtest on the same dates, so the two lines share one axis', () => {
        const r = result(757);
        expect(whatIfPoints(r.points).map((p) => p.date)).toEqual(toWhatIfView(r).points.map((p) => p.date));
    });
});

describe('labKnobs', () => {
    const positions = (id: StrategyId) => Object.fromEntries(labKnobs(def(id)).map((k) => [k.key, k.positions]));

    it('gives a single-knob strategy one five-position control, the catalog value among them', () => {
        expect(positions('sixty-forty')).toEqual({spyWeight: [0.4, 0.5, 0.6, 0.7, 0.8]});
        expect(positions('dual-momentum')).toEqual({lookback: [21, 63, 126, 189, 252]});
    });

    it('gives a two-knob strategy three positions per knob, the catalog in the middle', () => {
        expect(positions('golden-cross')).toEqual({fast: [20, 50, 100], slow: [100, 200, 250]});
        expect(positions('rsi2-mean-reversion')).toEqual({entryRsi: [5, 10, 20], exitSma: [3, 5, 10]});
        expect(positions('donchian-breakout')).toEqual({entryChannel: [20, 55, 100], exitChannel: [10, 20, 55]});
        expect(positions('low-volatility')).toEqual({volWindow: [21, 63, 126], top: [5, 10, 20]});
    });

    it('keeps momentum 12-1 uneven: two positions for lookback and skip, three for positions held', () => {
        expect(positions('momentum-12-1')).toEqual({lookback: [126, 252], skip: [0, 21], top: [4, 8, 16]});
    });

    it('offers every grid value and the catalog value of every knob, in grid order, and nothing for buy and hold', () => {
        expect(labKnobs(def('buy-and-hold-spy'))).toEqual([]);
        for (const d of STRATEGIES) {
            const knobs = labKnobs(d);
            expect(knobs.map((k) => k.key)).toEqual([...new Set(gridFor(d).map((v) => v.knob))]);
            for (const knob of knobs) {
                expect(knob.catalog).toBe(findParam(d, knob.key));
                expect(knob.positions).toContain(knob.catalog);
                expect([...knob.positions].sort((a, b) => a - b)).toEqual(knob.positions);
            }
            for (const variant of gridFor(d)) {
                expect(knobs.find((k) => k.key === variant.knob)?.positions, variant.id).toContain(variant.value);
            }
        }
    });
});

describe('whatIfLab', () => {
    const gc = def('golden-cross');
    const series = (count: number, step: number) =>
        Array.from({length: count}, (_, i) => ({date: `d${String(i).padStart(4, '0')}`, value: 100_000 + i * step}));
    const stats = {totalReturnPct: 1, cagrPct: 1, annualizedVolPct: 1, maxDrawdownPct: 0, winRatePct: null, wins: 0, losses: 0, tradeCount: 0, benchmarkReturnPct: 1, excessReturnPct: 0};
    const BUILT = new Date('2026-09-28T13:40:00Z');
    const stored = (extra: Partial<WhatIfBacktest> = {}): WhatIfBacktest => {
        const points = series(300, 5);
        return {version: '3.1', from: points[0].date, to: points[299].date, points, stats, computedAt: BUILT, ...extra};
    };
    // Variants as the nightly job stores them beside the backtest build they were computed for.
    const beside = {variantsVersion: '3.1', variantsFor: BUILT};
    const variant = (id: string, knob: string, value: number, step = 9): StoredWhatIfVariant => {
        const points = series(300, step);
        return {id, knob, value, from: points[0].date, to: points[299].date, stats: {...stats, totalReturnPct: step}, closeFills: 1, skippedDays: 0, points: whatIfPoints(points)};
    };
    const grid = () => gridFor(gc).map((v, i) => variant(v.id, v.knob, v.value, 10 + i));

    it('has no lab for a strategy without knobs', () => {
        expect(whatIfLab(def('buy-and-hold-spy'), stored())).toBeNull();
    });

    it('shows the controls and nothing computed before the backtest or its variants exist', () => {
        expect(whatIfLab(gc, null)).toEqual({knobs: labKnobs(gc), stored: null, variants: []});
        const lab = whatIfLab(gc, stored());
        expect(lab?.variants).toEqual([]);
        expect(lab?.stored?.dates).toHaveLength(WHATIF_VIEW_POINTS);
    });

    it('draws the stored backtest decimated onto the variants\' dates, and each variant beside it', () => {
        const backtest = stored({variants: grid(), ...beside});
        const lab = whatIfLab(gc, backtest);
        expect(lab?.stored).toMatchObject({from: backtest.from, to: backtest.to, stats});
        expect(lab?.stored?.dates).toEqual(whatIfPoints(backtest.points).map((p) => p.date));
        expect(lab?.stored?.values).toEqual(whatIfPoints(backtest.points).map((p) => p.value));
        expect(lab?.variants.map((v) => v.id)).toEqual(gridFor(gc).map((v) => v.id));
        const fast20 = lab?.variants[0];
        expect(fast20).toMatchObject({knob: 'fast', value: 20, changes: [{key: 'fast', from: 50, to: 20}], closeFills: 1, skippedDays: 0});
        expect(fast20?.stats.totalReturnPct).toBe(10);
        expect(fast20?.values).toHaveLength(lab?.stored?.dates.length ?? -1);
    });

    it('hides variants computed for another version of the backtest', () => {
        expect(whatIfLab(gc, stored({variants: grid(), variantsVersion: '2.1', variantsFor: BUILT}))?.variants).toEqual([]);
        expect(whatIfLab(gc, stored({variants: grid()}))?.variants).toEqual([]);
    });

    it('hides variants computed beside an earlier build of the same version', () => {
        // A resimulate rebuilt the backtest (same version, same window, new data) and the grid
        // was not recomputed: the old variants are not "this line with one setting moved".
        const rebuilt = new Date(BUILT.getTime() + 86_400_000);
        expect(whatIfLab(gc, stored({variants: grid(), ...beside, computedAt: rebuilt}))?.variants).toEqual([]);
        expect(whatIfLab(gc, stored({variants: grid(), variantsVersion: '3.1'}))?.variants).toEqual([]);
        // The same instant however it arrives (a Date from Mongo, ms from a step's JSON).
        expect(whatIfLab(gc, stored({variants: grid(), variantsVersion: '3.1', variantsFor: BUILT.getTime()}))?.variants).toHaveLength(grid().length);
    });

    it('drops a variant off the grid or off the stored calendar, keeping the rest in grid order', () => {
        const [a, b, c, d] = grid();
        const offGrid = variant('fast=30', 'fast', 30);
        const offCalendar = {...c, points: c.points.map((p, i) => (i === 5 ? {...p, date: 'x'} : p))};
        const lab = whatIfLab(gc, stored({variants: [d, offGrid, b, offCalendar, a], ...beside}));
        expect(lab?.variants.map((v) => v.id)).toEqual([a.id, b.id, d.id]);
        const otherWindow = {...a, from: 'd0001'};
        expect(whatIfLab(gc, stored({variants: [otherWindow], ...beside}))?.variants).toEqual([]);
        // The same start and the same dates as far as they go, but another end, or one point short.
        expect(whatIfLab(gc, stored({variants: [{...a, to: 'd0298'}], ...beside}))?.variants).toEqual([]);
        expect(whatIfLab(gc, stored({variants: [{...a, points: a.points.slice(0, -1)}], ...beside}))?.variants).toEqual([]);
        expect(whatIfLab(gc, stored({variants: [a], ...beside}))?.variants.map((v) => v.id)).toEqual([a.id]);
    });
});
