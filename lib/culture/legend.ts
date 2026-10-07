// The /culture legend: how the brain turns sources into attention and theses, what the pickers
// measure, how each profile weighs it, and the rails both trade under — every figure read from
// lib/culture/config.ts and lib/brain/config.ts, the fading example worked out by
// lib/brain/decay.ts itself, so a changed constant changes the legend (the test moves every one
// to a sentinel and watches the text follow). Mechanism only; the sentences live in
// lib/learn/copy/culture.ts. lib/brain/legend.ts is the news brain's twin.
//
// Pure and client-importable.

import {HALF_LIFE_FAST_DAYS, HALF_LIFE_SLOW_DAYS, THESIS_EXIT_FRACTION, THESIS_WEIGHT_THRESHOLD} from '@/lib/brain/config';
import {decayEntity, type EntityState} from '@/lib/brain/decay';
import {
    APP_RANK_FLOOR,
    APP_RANK_RECENT_DAYS,
    APPSTORE_FULL_CLIMB,
    ATTENTION_BASELINE_DAYS,
    ATTENTION_RECENT_DAYS,
    ATTENTION_TOP_BRANDS,
    BRAND_SHARE_CAP,
    CULTURE_EXTRACTION_BATCH_SIZE,
    CULTURE_MAX_EXTRACTION_CALLS_PER_DAY,
    CULTURE_PROFILES,
    CULTURE_RAILS,
    CULTURE_STARTING_BALANCE,
    CULTURE_TOP_QUINTILE_FRACTION,
    CULTURE_VOLATILITY_HAIRCUT,
    FALLBACK_IMPORTANCE,
    LIVE_PROFILES,
    MAX_UNIVERSE_TICKERS,
    MIN_PRICE_BARS,
    PERSISTENCE_CAP_WEEKS,
    PRESS_WINDOW_DAYS,
    SOURCE_FOLD_WEIGHTS,
    TREND_DAYS,
    WIKI_BASELINE_DAYS,
    WIKI_RECENT_DAYS,
} from '@/lib/culture/config';
import {CULTURE_SOURCES} from '@/lib/culture/types';
import {addCalendarDays} from '@/lib/dates';
import {CULTURE_LEGEND_COPY as C, PROFILE_COPY, SOURCE_LABELS} from '@/lib/learn/copy/culture';
import {momentumMixText, profileWeightsText} from '@/lib/learn/culture-reasons';
import {shareText} from '@/lib/learn/copy/reasons';

type LegendSection = {heading: string; lines: string[]};
export type CultureLegend = {summary: string; sections: LegendSection[]};

const EXAMPLE_WEIGHT = 10;
const EXAMPLE_START = '2026-01-01';

// A slow weight left alone for `days`, faded by the brain's own decayEntity — the culture
// brain folds through the same maths (lib/culture/fold.ts).
const fadedAfter = (days: number): string => {
    const state: EntityState = {
        weightFast: 0, sentimentSumFast: 0, weightSlow: EXAMPLE_WEIGHT, sentimentSumSlow: 0,
        decayedTo: EXAMPLE_START, links: [], thesisSince: null, peakSlowWeight: 0,
    };
    return decayEntity(state, addCalendarDays(EXAMPLE_START, days)).weightSlow.toFixed(1);
};

// "Wikipedia 1, App Store 0.8, Reddit 0.6, YouTube 0.5, Social 0.5, News 0.2", heaviest first.
const sourceWeightsText = (): string =>
    [...CULTURE_SOURCES]
        .sort((a, b) => SOURCE_FOLD_WEIGHTS[b] - SOURCE_FOLD_WEIGHTS[a])
        .map((source) => `${SOURCE_LABELS[source]} ${SOURCE_FOLD_WEIGHTS[source]}`)
        .join(', ');

const money = (amount: number): string => `$${amount.toLocaleString('en-US')}`;

export const cultureLegend = (): CultureLegend => {
    const half = Math.max(1, Math.round(HALF_LIFE_SLOW_DAYS / 2));
    return {
        summary: C.summary,
        sections: [
            {
                heading: C.readingHeading,
                lines: [
                    C.reading(CULTURE_EXTRACTION_BATCH_SIZE * CULTURE_MAX_EXTRACTION_CALLS_PER_DAY, String(FALLBACK_IMPORTANCE)),
                    C.sources(sourceWeightsText()),
                ],
            },
            {
                heading: C.attentionHeading,
                lines: [
                    C.surprises(WIKI_RECENT_DAYS, WIKI_BASELINE_DAYS, APPSTORE_FULL_CLIMB),
                    C.layers(HALF_LIFE_FAST_DAYS, HALF_LIFE_SLOW_DAYS),
                    C.decayExample(EXAMPLE_WEIGHT, {days: half, weight: fadedAfter(half)}, {days: HALF_LIFE_SLOW_DAYS, weight: fadedAfter(HALF_LIFE_SLOW_DAYS)}),
                    C.thesis(THESIS_WEIGHT_THRESHOLD, shareText(THESIS_EXIT_FRACTION)),
                ],
            },
            {
                heading: C.featuresHeading,
                lines: [
                    C.surprise(ATTENTION_RECENT_DAYS, ATTENTION_BASELINE_DAYS),
                    C.trend(TREND_DAYS),
                    C.persistence(PERSISTENCE_CAP_WEEKS),
                    C.quiet(PRESS_WINDOW_DAYS),
                    C.share(ATTENTION_RECENT_DAYS, ATTENTION_BASELINE_DAYS),
                    C.sinceReport(),
                    C.appRank(APP_RANK_FLOOR, APP_RANK_RECENT_DAYS),
                    C.rollup(shareText(BRAND_SHARE_CAP), ATTENTION_TOP_BRANDS),
                ],
            },
            ...LIVE_PROFILES.map((id) => ({
                heading: C.profileHeading(CULTURE_PROFILES[id].label),
                lines: [C.profile(CULTURE_PROFILES[id].label, PROFILE_COPY[id], profileWeightsText(id))],
            })),
            {
                heading: C.priceHeading,
                lines: [
                    C.momentum(momentumMixText()),
                    C.caps(shareText(CULTURE_TOP_QUINTILE_FRACTION), String(CULTURE_VOLATILITY_HAIRCUT)),
                    C.eligibility(MIN_PRICE_BARS),
                ],
            },
            {
                heading: C.railsHeading,
                lines: [
                    C.universe(MAX_UNIVERSE_TICKERS),
                    C.entry(CULTURE_RAILS.maxPositions, String(CULTURE_RAILS.entryScoreThreshold), shareText(CULTURE_RAILS.maxPositionWeight), shareText(CULTURE_RAILS.minCashWeight)),
                    C.exit(String(CULTURE_RAILS.exitScoreThreshold), shareText(CULTURE_RAILS.hardStopDrawdown), CULTURE_RAILS.minHoldingTradingDays),
                    C.pace(shareText(CULTURE_RAILS.rebalanceBand), CULTURE_RAILS.maxTradesPerWeek),
                    C.accounts(money(CULTURE_STARTING_BALANCE)),
                ],
            },
        ],
    };
};
