// The /brain legend and the rest of /brain's copy: every figure comes from the brain's and the
// Navigator's constants (a mocked constant moves the text), the fading example is decay.ts's
// own arithmetic, and nothing says the brain or the Navigator works, fails or beats anything.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {brainLegend} from '@/lib/learn/brain-legend';
import {BRAIN_COPY, BRAIN_LEGEND_COPY} from '@/lib/learn/copy/brain';
import {NAVIGATOR_COPY} from '@/lib/learn/copy/navigator';
import {buildTargets} from '@/lib/navigator/allocator';
import {MAX_POSITION_WEIGHT, MIN_CASH_WEIGHT} from '@/lib/navigator/config';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged|wins?|loses)\b/i;

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
    expect(text, text).not.toMatch(MECHANISM_ONLY);
};

const legendText = (legend: ReturnType<typeof brainLegend>): string =>
    [legend.summary, ...legend.sections.flatMap((section) => [section.heading, ...section.lines])].join('\n');

describe('brainLegend', () => {
    it('describes the mechanism in the constants\' own figures', () => {
        const text = legendText(brainLegend());
        for (const figure of ['up to 160 new articles', 'halves every 5 days', 'halves every 60 days', 'reaches 5', 'below 40%',
            'news rank 0.20', 'news sentiment 0.15', 'momentum 0.35', 'thesis 0.20', 'sector standing 0.10',
            '6-month (0.50), 12-month (0.30) and 3-month (0.20)', 'most volatile 20%', 'multiplied by 0.8',
            'the 8 highest scores above 0.15', 'at most 20%', 'with at least 10% kept in cash', 'drops below 0 ', '25% under the average cost',
            'held 21 trading days', 'more than 5% of the account', 'at most 3 trades a week', '13 always-eligible funds',
            '3 articles from 2 sources in 21 days and 126 daily bars']) {
            expect(text, figure).toContain(figure);
        }
    });

    it('states the cash share as the floor it is: three capped picks keep far more than the minimum', () => {
        // Three picks, each capped at MAX_POSITION_WEIGHT, invest 60% and keep 40% in cash: the
        // allocator only ever scales weights down to protect MIN_CASH_WEIGHT, never up to meet it.
        const picks = ['AAA', 'BBB', 'CCC'].map((symbol) => ({symbol, score: 0.9, eligible: true, reasons: []}));
        const targets = buildTargets(picks);
        expect(targets.map((t) => t.weight)).toEqual([MAX_POSITION_WEIGHT, MAX_POSITION_WEIGHT, MAX_POSITION_WEIGHT]);
        const cash = 1 - targets.reduce((sum, t) => sum + t.weight, 0);
        expect(cash).toBeGreaterThan(MIN_CASH_WEIGHT);
        const text = legendText(brainLegend());
        expect(text).toContain(`with at least ${Math.round(MIN_CASH_WEIGHT * 100)}% kept in cash`);
        expect(text).not.toMatch(/with \d+% kept in cash/);
    });

    it('works out the fading example with decay.ts', () => {
        expect(legendText(brainLegend())).toContain('a slow weight of 10 is 7.1 after 30 days and 5.0 after 60.');
    });

    it('holds every line to the copy tier and to mechanism only', () => {
        const legend = brainLegend();
        expect(legend.sections).toHaveLength(5);
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

describe('brainLegend follows the constants', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/brain/config');
        vi.doUnmock('@/lib/navigator/config');
        vi.doUnmock('@/lib/navigator/scoring');
        vi.resetModules();
    });

    it('prints every figure from its constant: each one moved to a sentinel moves the text', async () => {
        vi.resetModules();
        vi.doMock('@/lib/brain/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/brain/config')>()),
            EXTRACTION_BATCH_SIZE: 17,
            MAX_EXTRACTION_CALLS_PER_DAY: 7,
            HALF_LIFE_FAST_DAYS: 4,
            HALF_LIFE_SLOW_DAYS: 90,
            // Out of step with the half-life on purpose (a 45-day half-life): the fading example
            // must come from decay.ts's own daily factor, not a closed form of HALF_LIFE_SLOW_DAYS.
            DAILY_DECAY_SLOW: 0.5 ** (1 / 45),
            THESIS_WEIGHT_THRESHOLD: 7,
            THESIS_EXIT_FRACTION: 0.35,
        }));
        vi.doMock('@/lib/navigator/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/navigator/config')>()),
            MAX_POSITIONS: 9,
            MAX_POSITION_WEIGHT: 0.17,
            MIN_CASH_WEIGHT: 0.13,
            MAX_TRADES_PER_WEEK: 4,
            MIN_HOLDING_TRADING_DAYS: 17,
            REBALANCE_BAND: 0.07,
            ENTRY_SCORE_THRESHOLD: 0.19,
            EXIT_SCORE_THRESHOLD: -0.05,
            HARD_STOP_DRAWDOWN: 0.23,
            MIN_ARTICLES_FOR_ELIGIBILITY: 4,
            MIN_DISTINCT_SOURCES: 5,
            ELIGIBILITY_LOOKBACK_DAYS: 16,
            MIN_PRICE_BARS: 111,
            SCORE_WEIGHTS: {newsSlow: 0.21, sentimentSlow: 0.14, momentumLong: 0.31, thesis: 0.22, sectorSlow: 0.12},
            MOMENTUM_MIX: {r126: 0.41, r252: 0.33, r63: 0.26},
            VOLATILITY_HAIRCUT: 0.7,
            ALWAYS_ELIGIBLE_SYMBOLS: ['SPY', 'QQQ'],
        }));
        vi.doMock('@/lib/navigator/scoring', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/navigator/scoring')>()),
            TOP_QUINTILE_FRACTION: 0.15,
        }));
        const mocked = await import('@/lib/learn/brain-legend');
        const text = legendText(mocked.brainLegend());
        for (const figure of [
            'reads up to 119 new articles',
            'the fast layer halves every 4 days', 'the slow layer halves every 90 days',
            'a slow weight of 10 is 5.0 after 45 days and 2.5 after 90.',
            'reaches 7,', 'below 35% of the highest',
            'news rank 0.21, news sentiment 0.14, momentum 0.31, thesis 0.22, sector standing 0.12',
            '6-month (0.41), 12-month (0.33) and 3-month (0.26)',
            'the most volatile 15% of symbols have a positive score multiplied by 0.7',
            'the 9 highest scores above 0.19', 'at most 17% of the account in one name, with at least 13% kept in cash',
            'drops below -0.05 or its price is 23% under the average cost', 'held 17 trading days',
            'more than 7% of the account from its target', 'at most 4 trades a week',
            'Apart from 2 always-eligible funds, a symbol needs 4 articles from 5 sources in 16 days and 111 daily bars',
        ]) {
            expect(text, figure).toContain(figure);
        }
        for (const stale of ['halves every 5 days', 'halves every 60 days', 'most volatile 20%', 'multiplied by 0.8', '25% under', 'held 21 trading days', '13 always-eligible']) {
            expect(text, stale).not.toContain(stale);
        }
    });
});

describe('the rest of /brain\'s copy', () => {
    it('prints the since-thesis figures side by side, with a true minus', () => {
        expect(BRAIN_COPY.sinceThesisFigures('NVDA', 4.06, 6)).toBe('NVDA +4.1% · SPY +6.0%');
        expect(BRAIN_COPY.sinceThesisFigures('AMD', -2.34, 0.04)).toBe('AMD −2.3% · SPY 0.0%');
        expect(BRAIN_COPY.sinceThesisWindow('2026-09-08', '2026-09-26')).toBe('From the close of Sep 8, 2026 to the close of Sep 26, 2026.');
    });

    it('holds every label and line to the copy tier', () => {
        for (const text of [
            BRAIN_COPY.labelsSummary, BRAIN_COPY.thesisDot(5), BRAIN_COPY.sinceThesisLabel,
            BRAIN_COPY.sinceThesisFigures('NVDA', 4.1, 6), BRAIN_COPY.sinceThesisWindow('2026-09-08', '2026-09-26'),
            NAVIGATOR_COPY.glossSummary, BRAIN_LEGEND_COPY.summary,
        ]) {
            clean(text);
        }
        expect(BRAIN_COPY.thesisDot(5)).toBe('● thesis: the news about this name has stayed strong for weeks (its slow weight reached 5)');
    });
});
