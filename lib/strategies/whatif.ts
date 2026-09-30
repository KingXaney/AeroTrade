// The what-if parameter lab, pure layer: which knobs a learner may turn on each strategy and
// how far, the schema a setting must pass, how a setting becomes a definition the UNCHANGED
// engine runs, the fixed grid the nightly strategies job precomputes, the diff a page prints,
// the compact view it draws and the lab's props (whatIfLab). No DB and no engine import: the
// job (runner.simulateVariantsForStrategy) hands applyOverrides(def, variant.overrides) to
// simulateStrategy itself, with the same bars, launch date and rates as the stored backtest,
// so a variant differs from the stored run by its setting alone.
//
// Server-side module (it pulls zod); a client component imports only its types.

import {z} from 'zod';
import {findParam} from '@/lib/strategies/params';
import type {SeriesPoint, SeriesStats, SimulationResult, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {downsample} from '@/lib/strategies/views';

// Values a knob takes: min, min + step, …, max.
export type ParamRange = {min: number; max: number; step: number};

// Every max is at most LOOKBACK_BARS (the decision never sees more bars than that), and the
// indicator each window feeds still reads at its max (the test runs every rule there). Knobs
// are only what the rule reads: buy and hold reads none of its params, and 60/40 exposes the
// stock leg alone — the bond leg is what is left of it.
export const PARAM_RANGES: Readonly<Record<StrategyId, Readonly<Record<string, ParamRange>>>> = {
    'buy-and-hold-spy': {},
    'sixty-forty': {
        spyWeight: {min: 0.1, max: 0.9, step: 0.1},
    },
    'golden-cross': {
        fast: {min: 10, max: 150, step: 5},
        slow: {min: 60, max: 250, step: 10},
    },
    'dual-momentum': {
        lookback: {min: 21, max: 252, step: 21},
    },
    'momentum-12-1': {
        lookback: {min: 84, max: 252, step: 21},
        skip: {min: 0, max: 63, step: 21},
        top: {min: 2, max: 20, step: 1},
    },
    'rsi2-mean-reversion': {
        rsiPeriod: {min: 2, max: 6, step: 1},
        entryRsi: {min: 5, max: 30, step: 5},
        exitSma: {min: 3, max: 20, step: 1},
        trendSma: {min: 50, max: 250, step: 10},
    },
    'donchian-breakout': {
        entryChannel: {min: 10, max: 250, step: 5},
        exitChannel: {min: 5, max: 100, step: 5},
    },
    'low-volatility': {
        volWindow: {min: 21, max: 252, step: 21},
        top: {min: 2, max: 20, step: 1},
    },
};

// Pairs whose first knob must stay strictly below the second, compared after the setting is
// laid over the catalog: a moving-average cross needs a faster and a slower average, and a
// lagged return needs its skip inside its lookback.
const ORDERED_KNOBS: readonly (readonly [lower: string, upper: string])[] = [
    ['fast', 'slow'],
    ['skip', 'lookback'],
];

export type WhatIfOverrides = Readonly<Record<string, number>>;

const onStep = (value: number, range: ParamRange): boolean => {
    const steps = (value - range.min) / range.step;
    return Math.abs(steps - Math.round(steps)) < 1e-9;
};

const resolved = (def: StrategyDefinition, overrides: Readonly<Record<string, number | undefined>>, key: string): number | null =>
    overrides[key] ?? findParam(def, key);

// A strict object of this strategy's knobs, each optional; unknown keys, values off the range
// or off the step, and an out-of-order pair are refused.
export const overridesSchema = (def: StrategyDefinition) => {
    const ranges = PARAM_RANGES[def.id];
    const shape = Object.fromEntries(Object.entries(ranges).map(([key, range]) => [
        key,
        z.number().min(range.min).max(range.max)
            .refine((value) => onStep(value, range), {message: `${key} moves in steps of ${range.step} from ${range.min}`})
            .optional(),
    ]));
    return z.strictObject(shape).superRefine((overrides, ctx) => {
        for (const [lower, upper] of ORDERED_KNOBS) {
            if (!(lower in ranges) || !(upper in ranges)) continue;
            const low = resolved(def, overrides, lower);
            const high = resolved(def, overrides, upper);
            if (low !== null && high !== null && low >= high) {
                ctx.addIssue({code: 'custom', message: `${lower} must stay below ${upper}`, path: [lower]});
            }
        }
    });
};

// Weights are tenths; rounding keeps 1 − 0.7 from printing as 0.30000000000000004.
const complement = (weight: number): number => Math.round((1 - weight) * 1e9) / 1e9;

// The catalog definition with a setting laid over it, as a NEW object (the catalog is never
// touched). Invalid settings throw: nothing unchecked reaches the engine. Two knobs carry a
// coupled field: `top` is also the slot count (the engine sizes and counts by def.slots), and
// the 60/40 bond leg is whatever the stock leg leaves.
export const applyOverrides = (def: StrategyDefinition, overrides: WhatIfOverrides): StrategyDefinition => {
    const parsed = overridesSchema(def).parse(overrides);
    const params: Record<string, number | string> = {...def.params};
    let slots = def.slots;
    for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined) continue;
        params[key] = value;
        if (key === 'top') slots = value;
        if (key === 'spyWeight') params.aggWeight = complement(value);
    }
    return {...def, params, slots};
};

// ── The nightly grid ────────────────────────────────────────────────────────────
// At most four variants per strategy, each ONE knob moved off its catalog value, in a fixed
// order. A knob that appears twice gets a three-position control (one value each side of the
// catalog where the range allows); a single-knob strategy gets a slider over its values.

export const WHATIF_MAX_VARIANTS = 4;

const GRID: Readonly<Record<StrategyId, readonly (readonly [knob: string, value: number])[]>> = {
    'buy-and-hold-spy': [],
    'sixty-forty': [['spyWeight', 0.4], ['spyWeight', 0.5], ['spyWeight', 0.7], ['spyWeight', 0.8]],
    'golden-cross': [['fast', 20], ['fast', 100], ['slow', 100], ['slow', 250]],
    'dual-momentum': [['lookback', 21], ['lookback', 63], ['lookback', 126], ['lookback', 189]],
    'momentum-12-1': [['lookback', 126], ['skip', 0], ['top', 4], ['top', 16]],
    'rsi2-mean-reversion': [['entryRsi', 5], ['entryRsi', 20], ['exitSma', 3], ['exitSma', 10]],
    'donchian-breakout': [['entryChannel', 20], ['entryChannel', 100], ['exitChannel', 10], ['exitChannel', 55]],
    'low-volatility': [['volWindow', 21], ['volWindow', 126], ['top', 5], ['top', 20]],
};

export type WhatIfVariant = {
    // Stable across nights, e.g. "entryRsi=5". Store variants as an array: the id holds a dot
    // for weights, so it is never a Mongo field name.
    id: string;
    knob: string;
    value: number;
    overrides: WhatIfOverrides;
};

export const gridFor = (def: StrategyDefinition): WhatIfVariant[] =>
    GRID[def.id].map(([knob, value]) => ({id: `${knob}=${value}`, knob, value, overrides: {[knob]: value}}));

// ── What a page prints and draws ────────────────────────────────────────────────

export type ParamChange = {key: string; from: number; to: number};

// The knobs a setting moves off the catalog, in PARAM_RANGES order; a knob set to its
// catalog value is not a change. Coupled fields (aggWeight, slots) are never listed.
export const paramDiff = (def: StrategyDefinition, overrides: WhatIfOverrides): ParamChange[] =>
    Object.keys(PARAM_RANGES[def.id]).flatMap((key) => {
        const to = overrides[key];
        const from = findParam(def, key);
        return to === undefined || from === null || to === from ? [] : [{key, from, to}];
    });

export const WHATIF_VIEW_POINTS = 120;

// The one decimation for both lines of the what-if chart. A variant and the stored backtest
// walk the same calendar (same bars, same launch date), so the same index decimation lands
// on the same dates; both endpoints are kept, so the last point is the printed total.
export const whatIfPoints = (points: readonly SeriesPoint[]): SeriesPoint[] =>
    downsample(points, WHATIF_VIEW_POINTS).map((point) => ({date: point.date, value: point.value}));

export type WhatIfView = {
    from: string;
    to: string;
    stats: SeriesStats;
    closeFills: number;
    skippedDays: number;
    points: SeriesPoint[];
};

export const toWhatIfView = (result: SimulationResult): WhatIfView => ({
    from: result.from,
    to: result.to,
    stats: result.stats,
    closeFills: result.closeFills,
    skippedDays: result.skippedDays,
    points: whatIfPoints(result.points),
});

// ── The lab on a strategy page ──────────────────────────────────────────────────

// One precomputed variant as the nightly job stores it: StrategyBacktest.variants is an ARRAY
// of these (the ids hold dots, so they are never Mongo keys).
export type StoredWhatIfVariant = {id: string; knob: string; value: number} & WhatIfView;

// A knob's control: every value the grid visits plus the catalog value, ascending. A
// single-knob strategy gets five positions; a two-knob one three per knob; momentum 12-1's
// lookback and skip only move one way, so they get two.
export type LabKnob = {key: string; catalog: number; positions: number[]};

export const labKnobs = (def: StrategyDefinition): LabKnob[] => {
    const grid = gridFor(def);
    return [...new Set(grid.map((variant) => variant.knob))].flatMap((key) => {
        const catalog = findParam(def, key);
        if (catalog === null) return [];
        const values = new Set([catalog, ...grid.filter((variant) => variant.knob === key).map((variant) => variant.value)]);
        return [{key, catalog, positions: [...values].sort((a, b) => a - b)}];
    });
};

// What the detail page reads: the stored backtest and whatever variants were stored with it.
export type WhatIfBacktest = {
    version: string;
    from: string;
    to: string;
    points: readonly SeriesPoint[];
    stats: SeriesStats;
    variants?: readonly StoredWhatIfVariant[];
    variantsVersion?: string;
};

export type WhatIfLabVariant = {
    id: string;
    knob: string;
    value: number;
    changes: ParamChange[];
    stats: SeriesStats;
    closeFills: number;
    skippedDays: number;
    // On the stored line's dates, one value per date.
    values: number[];
};

export type WhatIfLabView = {
    knobs: LabKnob[];
    // The stored backtest through whatIfPoints: its dates are the chart's one axis.
    stored: {from: string; to: string; dates: string[]; values: number[]; stats: SeriesStats} | null;
    // Empty until the nightly job has computed them for this backtest.
    variants: WhatIfLabVariant[];
};

// The lab's props, built on the server so a client control can switch variants without a
// round trip. A variant is shown only beside the backtest it was computed with: the same
// version, the same window and the same decimated dates (anything else is not "the same rule
// with one setting moved" and waits for the next night's grid). Null: the rule has no knob.
export const whatIfLab = (def: StrategyDefinition, backtest: WhatIfBacktest | null): WhatIfLabView | null => {
    const grid = gridFor(def);
    if (grid.length === 0) return null;
    const knobs = labKnobs(def);
    if (backtest === null) return {knobs, stored: null, variants: []};
    const points = whatIfPoints(backtest.points);
    const dates = points.map((point) => point.date);
    const current = backtest.variantsVersion === backtest.version ? (backtest.variants ?? []) : [];
    const variants = grid.flatMap(({id}) => {
        const found = current.find((variant) => variant.id === id);
        const aligned = found !== undefined && found.from === backtest.from && found.to === backtest.to
            && found.points.length === dates.length && found.points.every((point, i) => point.date === dates[i]);
        if (!aligned) return [];
        return [{
            id: found.id,
            knob: found.knob,
            value: found.value,
            changes: paramDiff(def, {[found.knob]: found.value}),
            stats: found.stats,
            closeFills: found.closeFills,
            skippedDays: found.skippedDays,
            values: found.points.map((point) => point.value),
        }];
    });
    return {
        knobs,
        stored: {from: backtest.from, to: backtest.to, dates, values: points.map((point) => point.value), stats: backtest.stats},
        variants,
    };
};
