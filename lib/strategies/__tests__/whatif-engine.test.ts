// Every knob the what-if lab exposes must move the real engine: each range key, at each end
// of its range (one step in where an end is the catalog value) and at every grid value,
// changes what simulateStrategy produces on a seeded synthetic universe. A knob the rule never reads (buy and hold's `allocation`, say) would
// produce the catalog's run exactly and fail here.

import {describe, expect, it} from 'vitest';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {WARMUP_BARS} from '@/lib/strategies/config';
import {findParam} from '@/lib/strategies/params';
import {simulateStrategy} from '@/lib/strategies/simulate';
import type {SimulationResult, StrategyDefinition} from '@/lib/strategies/types';
import {applyOverrides, gridFor, overridesSchema, PARAM_RANGES, type WhatIfOverrides} from '@/lib/strategies/whatif';
import {SYNTHETIC_LAUNCH, syntheticMarket} from '@/lib/strategies/__tests__/synthetic-universe';

// About a year of results after the full warm-up: enough monthly and quarterly checks for a
// slow knob to show, short enough to keep the file to a few seconds.
const RESULT_BARS = 250;
const market = syntheticMarket(WARMUP_BARS + RESULT_BARS + 1);

const run = (def: StrategyDefinition): SimulationResult =>
    simulateStrategy(def, market.bars, {startingBalance: 100_000, launchDate: SYNTHETIC_LAUNCH, resultBars: RESULT_BARS, rates: market.rates});

// What a learner would see differ: the fills and the equity curve.
const fingerprint = (r: SimulationResult): string =>
    JSON.stringify({
        trades: r.trades.map((t) => [t.date, t.symbol, t.side, t.quantity]),
        values: r.points.map((p) => Math.round(p.value * 100)),
    });

describe('each what-if knob changes the engine output', () => {
    for (const def of STRATEGIES) {
        const ranges = PARAM_RANGES[def.id];
        if (Object.keys(ranges).length === 0) continue;

        it(`${def.id}: ${Object.keys(ranges).join(', ')}`, () => {
            const catalog = run(def);
            expect(catalog.trades.length, `${def.id} trades at the catalog setting`).toBeGreaterThan(0);
            const base = fingerprint(catalog);

            // Both ends of each range; an end that IS the catalog value is the catalog run, so
            // its one-step-inward neighbour stands in for it.
            const ends = (key: string, range: {min: number; max: number; step: number}): number[] =>
                [range.min, range.max].map((end) => {
                    if (end !== findParam(def, key)) return end;
                    return end === range.min ? end + range.step : end - range.step;
                });
            const settings: WhatIfOverrides[] = [
                ...Object.entries(ranges).flatMap(([key, range]) => ends(key, range).map((value) => ({[key]: value}))),
                ...gridFor(def).map((variant) => variant.overrides),
            ];
            const distinct = [...new Map(settings.map((o) => [JSON.stringify(o), o])).values()];
            for (const overrides of distinct) {
                expect(overridesSchema(def).safeParse(overrides).success, JSON.stringify(overrides)).toBe(true);
                const changed = run(applyOverrides(def, overrides));
                expect(fingerprint(changed), `${def.id} ${JSON.stringify(overrides)} left the run unchanged`).not.toBe(base);
            }
        });
    }
});
