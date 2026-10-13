// The /culture legend: every figure comes from the culture brain's and the news brain's
// constants (a mocked constant moves the text), the fading example is decay.ts's own
// arithmetic, and nothing says the brain or a picker works, fails or beats anything.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {cultureLegend} from '@/lib/culture/legend';
import {LIVE_PROFILES} from '@/lib/culture/config';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged|wins?|loses)\b/i;

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
    expect(text, text).not.toMatch(MECHANISM_ONLY);
};

const legendText = (legend: ReturnType<typeof cultureLegend>): string =>
    [legend.summary, ...legend.sections.flatMap((section) => [section.heading, ...section.lines])].join('\n');

describe('cultureLegend', () => {
    it('describes the mechanism in the constants\' own figures', () => {
        const text = legendText(cultureLegend());
        for (const figure of [
            'reads up to 60 new items', 'importance of 0.2',
            'Wikipedia 1, App Store 0.8, Reddit 0.6, YouTube 0.5, Social 0.5, News 0.2',
            'last 7 days of pageviews', 'over the 90 days before', 'climb of 50 places',
            'halves every 5 days', 'halves every 60 days', 'reaches 5,', 'below 40%',
            'the last 28 days\' mean pageviews', 'over the 180 days before them', '90 days of log pageviews', 'stopping at 26',
            'over the last 28 days', '0 at #200 and beyond', 'in the last 7', 'no one brand past 50%', 'its 3 heaviest brands',
            'The Spike picker:', 'price momentum 0.40, attention surprise 0.20', 'The Quiet picker:', 'attention persistence 0.15, quiet attention 0.15',
            '6-month change 0.50, 12-month 0.30, 3-month 0.20', 'most volatile 20%', 'multiplied by 0.8', '126 daily bars',
            'cut at 150', 'the 10 highest scores above 0.15', 'at most 15%', 'with at least 5% kept in cash',
            'drops below 0 ', '30% under the average cost', 'held 21 trading days', 'more than 5% of its account', 'at most 4 trades a week',
            'opened with $100,000',
        ]) {
            expect(text, figure).toContain(figure);
        }
    });

    it('works out the fading example with decay.ts', () => {
        expect(legendText(cultureLegend())).toContain('a slow weight of 10 is 7.1 after 30 days and 5.0 after 60.');
    });

    it('has one section per live picker, in the registry\'s order', () => {
        const headings = cultureLegend().sections.map((section) => section.heading);
        const pickers = headings.filter((heading) => heading.endsWith(' picker'));
        expect(pickers).toEqual(LIVE_PROFILES.map((id) => (id === 'spike' ? 'The Spike picker' : 'The Quiet picker')));
    });

    it('holds every line to the copy tier and to mechanism only', () => {
        const legend = cultureLegend();
        expect(legend.sections).toHaveLength(7);
        for (const section of legend.sections) {
            clean(section.heading);
            expect(section.lines.length).toBeGreaterThan(0);
            for (const line of section.lines) {
                clean(line);
                expect(line.endsWith('.'), line).toBe(true);
            }
        }
        clean(legend.summary);
    });
});

describe('cultureLegend follows the constants', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/culture/config');
        vi.doUnmock('@/lib/brain/config');
        vi.resetModules();
    });

    it('prints every figure from its constant: each one moved to a sentinel moves the text', async () => {
        vi.resetModules();
        vi.doMock('@/lib/culture/config', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/culture/config')>();
            return {
                ...original,
                CULTURE_EXTRACTION_BATCH_SIZE: 17,
                CULTURE_MAX_EXTRACTION_CALLS_PER_DAY: 7,
                FALLBACK_IMPORTANCE: 0.3,
                SOURCE_FOLD_WEIGHTS: {wikipedia: 0.9, appstore: 0.7, reddit: 0.5, youtube: 0.4, social: 0.3, news: 0.1},
                WIKI_RECENT_DAYS: 5,
                WIKI_BASELINE_DAYS: 80,
                APPSTORE_FULL_CLIMB: 40,
                ATTENTION_RECENT_DAYS: 21,
                ATTENTION_BASELINE_DAYS: 150,
                TREND_DAYS: 70,
                PERSISTENCE_CAP_WEEKS: 20,
                PRESS_WINDOW_DAYS: 14,
                APP_RANK_FLOOR: 150,
                APP_RANK_RECENT_DAYS: 5,
                BRAND_SHARE_CAP: 0.4,
                ATTENTION_TOP_BRANDS: 2,
                CULTURE_MOMENTUM_MIX: {r126: 0.41, r252: 0.33, r63: 0.26},
                CULTURE_VOLATILITY_HAIRCUT: 0.7,
                CULTURE_TOP_QUINTILE_FRACTION: 0.15,
                MIN_PRICE_BARS: 111,
                MAX_UNIVERSE_TICKERS: 120,
                CULTURE_STARTING_BALANCE: 50_000,
                CULTURE_RAILS: {
                    ...original.CULTURE_RAILS,
                    maxPositions: 9, entryScoreThreshold: 0.19, maxPositionWeight: 0.17, minCashWeight: 0.13,
                    exitScoreThreshold: -0.05, hardStopDrawdown: 0.23, minHoldingTradingDays: 17, rebalanceBand: 0.07, maxTradesPerWeek: 3,
                },
                CULTURE_PROFILES: {
                    ...original.CULTURE_PROFILES,
                    spike: {...original.CULTURE_PROFILES.spike, weights: {...original.CULTURE_PROFILES.spike.weights, momentumLong: 0.45, attentionAnomaly: 0.15}},
                },
            };
        });
        vi.doMock('@/lib/brain/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/brain/config')>()),
            HALF_LIFE_FAST_DAYS: 4,
            HALF_LIFE_SLOW_DAYS: 90,
            // Out of step with the half-life on purpose (a 45-day half-life): the fading example
            // must come from decay.ts's own daily factor, not a closed form of HALF_LIFE_SLOW_DAYS.
            DAILY_DECAY_SLOW: 0.5 ** (1 / 45),
            THESIS_WEIGHT_THRESHOLD: 7,
            THESIS_EXIT_FRACTION: 0.35,
        }));
        const mocked = await import('@/lib/culture/legend');
        const text = legendText(mocked.cultureLegend());
        for (const figure of [
            'reads up to 119 new items', 'importance of 0.3',
            'Wikipedia 0.9, App Store 0.7, Reddit 0.5, YouTube 0.4, Social 0.3, News 0.1',
            'last 5 days of pageviews', 'over the 80 days before', 'climb of 40 places',
            'the fast layer halves every 4 days', 'the slow layer halves every 90 days',
            'a slow weight of 10 is 5.0 after 45 days and 2.5 after 90.',
            'reaches 7,', 'below 35% of the highest',
            'the last 21 days\' mean pageviews', 'over the 150 days before them', '70 days of log pageviews', 'stopping at 20',
            'over the last 14 days', '0 at #150 and beyond', 'in the last 5', 'no one brand past 40%', 'its 2 heaviest brands',
            'price momentum 0.45, attention surprise 0.15',
            '6-month change 0.41, 12-month 0.33, 3-month 0.26', 'most volatile 15%', 'multiplied by 0.7', '111 daily bars',
            'cut at 120', 'the 9 highest scores above 0.19', 'at most 17%', 'with at least 13% kept in cash',
            'drops below -0.05', '23% under the average cost', 'held 17 trading days', 'more than 7% of its account', 'at most 3 trades a week',
            'opened with $50,000',
        ]) {
            expect(text, figure).toContain(figure);
        }
        for (const stale of ['halves every 5 days', 'halves every 60 days', 'most volatile 20%', 'multiplied by 0.8', '30% under', 'held 21 trading days', 'cut at 150', '$100,000']) {
            expect(text, stale).not.toContain(stale);
        }
    });
});
