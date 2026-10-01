// The /brain legend: how the brain turns articles into weights and theses, and how the AI
// Navigator turns those into a score and trades under its rails — every figure read from
// lib/brain/config.ts, lib/navigator/config.ts and scoring.ts, and the fading example worked
// out by lib/brain/decay.ts itself, so a changed constant changes the legend (the test moves
// every one to a sentinel and watches the text follow). Mechanism only; the sentences live in
// lib/learn/copy/brain.ts.
//
// Pure and client-importable.

import {
    EXTRACTION_BATCH_SIZE,
    HALF_LIFE_FAST_DAYS,
    HALF_LIFE_SLOW_DAYS,
    MAX_EXTRACTION_CALLS_PER_DAY,
    THESIS_EXIT_FRACTION,
    THESIS_WEIGHT_THRESHOLD,
} from '@/lib/brain/config';
import {decayEntity, type EntityState} from '@/lib/brain/decay';
import {
    ALWAYS_ELIGIBLE_SYMBOLS,
    ELIGIBILITY_LOOKBACK_DAYS,
    ENTRY_SCORE_THRESHOLD,
    EXIT_SCORE_THRESHOLD,
    HARD_STOP_DRAWDOWN,
    MAX_POSITION_WEIGHT,
    MAX_POSITIONS,
    MAX_TRADES_PER_WEEK,
    MIN_ARTICLES_FOR_ELIGIBILITY,
    MIN_CASH_WEIGHT,
    MIN_DISTINCT_SOURCES,
    MIN_HOLDING_TRADING_DAYS,
    MIN_PRICE_BARS,
    MOMENTUM_MIX,
    REBALANCE_BAND,
    SCORE_WEIGHTS,
    VOLATILITY_HAIRCUT,
} from '@/lib/navigator/config';
import {TOP_QUINTILE_FRACTION} from '@/lib/navigator/scoring';
import {addCalendarDays} from '@/lib/dates';
import {BRAIN_LEGEND_COPY as C} from '@/lib/learn/copy/brain';
import {shareText} from '@/lib/learn/copy/reasons';

type LegendSection = {heading: string; lines: string[]};
export type BrainLegend = {summary: string; sections: LegendSection[]};

const weightText = (weight: number): string => weight.toFixed(2);

// "6-month (0.50), 12-month (0.30) and 3-month (0.20)", heaviest first.
const mixText = (): string => {
    const parts = (Object.keys(MOMENTUM_MIX) as (keyof typeof MOMENTUM_MIX)[])
        .sort((a, b) => MOMENTUM_MIX[b] - MOMENTUM_MIX[a])
        .map((horizon) => `${Math.round(Number(horizon.slice(1)) / 21)}-month (${weightText(MOMENTUM_MIX[horizon])})`);
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('');
};

const EXAMPLE_WEIGHT = 10;
const EXAMPLE_START = '2026-01-01';

// A slow weight left alone for `days`, faded by the brain's own decayEntity.
const fadedAfter = (days: number): string => {
    const state: EntityState = {
        weightFast: 0, sentimentSumFast: 0, weightSlow: EXAMPLE_WEIGHT, sentimentSumSlow: 0,
        decayedTo: EXAMPLE_START, links: [], thesisSince: null, peakSlowWeight: 0,
    };
    return decayEntity(state, addCalendarDays(EXAMPLE_START, days)).weightSlow.toFixed(1);
};

export const brainLegend = (): BrainLegend => {
    const half = Math.max(1, Math.round(HALF_LIFE_SLOW_DAYS / 2));
    return {
        summary: C.summary,
        sections: [
            {heading: C.readingHeading, lines: [C.reading(EXTRACTION_BATCH_SIZE * MAX_EXTRACTION_CALLS_PER_DAY), C.adding()]},
            {
                heading: C.fadingHeading,
                lines: [
                    C.layers(HALF_LIFE_FAST_DAYS, HALF_LIFE_SLOW_DAYS),
                    C.decayExample(EXAMPLE_WEIGHT, {days: half, weight: fadedAfter(half)}, {days: HALF_LIFE_SLOW_DAYS, weight: fadedAfter(HALF_LIFE_SLOW_DAYS)}),
                ],
            },
            {heading: C.thesisHeading, lines: [C.thesis(THESIS_WEIGHT_THRESHOLD, shareText(THESIS_EXIT_FRACTION))]},
            {
                heading: C.scoreHeading,
                lines: [
                    C.score({
                        news: weightText(SCORE_WEIGHTS.newsSlow),
                        sentiment: weightText(SCORE_WEIGHTS.sentimentSlow),
                        momentum: weightText(SCORE_WEIGHTS.momentumLong),
                        thesis: weightText(SCORE_WEIGHTS.thesis),
                        sector: weightText(SCORE_WEIGHTS.sectorSlow),
                    }),
                    C.momentum(mixText()),
                    C.caps(shareText(TOP_QUINTILE_FRACTION), String(VOLATILITY_HAIRCUT)),
                ],
            },
            {
                heading: C.railsHeading,
                lines: [
                    C.entry(MAX_POSITIONS, String(ENTRY_SCORE_THRESHOLD), shareText(MAX_POSITION_WEIGHT), shareText(MIN_CASH_WEIGHT)),
                    C.exit(String(EXIT_SCORE_THRESHOLD), shareText(HARD_STOP_DRAWDOWN), MIN_HOLDING_TRADING_DAYS),
                    C.pace(shareText(REBALANCE_BAND), MAX_TRADES_PER_WEEK),
                    C.eligibility(ALWAYS_ELIGIBLE_SYMBOLS.length, MIN_ARTICLES_FOR_ELIGIBILITY, MIN_DISTINCT_SOURCES, ELIGIBILITY_LOOKBACK_DAYS, MIN_PRICE_BARS),
                ],
            },
        ],
    };
};
