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
        vi.resetModules();
    });

    it('changes when a half-life or a score weight changes', async () => {
        vi.resetModules();
        vi.doMock('@/lib/brain/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/brain/config')>()),
            HALF_LIFE_SLOW_DAYS: 90,
            DAILY_DECAY_SLOW: 0.5 ** (1 / 90),
            THESIS_WEIGHT_THRESHOLD: 7,
        }));
        vi.doMock('@/lib/navigator/config', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/navigator/config')>();
            return {...original, MAX_POSITIONS: 10, SCORE_WEIGHTS: {...original.SCORE_WEIGHTS, momentumLong: 0.4, newsSlow: 0.15}};
        });
        const mocked = await import('@/lib/learn/brain-legend');
        const text = legendText(mocked.brainLegend());
        expect(text).toContain('halves every 90 days');
        expect(text).toContain('a slow weight of 10 is 7.1 after 45 days and 5.0 after 90.');
        expect(text).toContain('reaches 7');
        expect(text).toContain('momentum 0.40');
        expect(text).toContain('news rank 0.15');
        expect(text).toContain('the 10 highest scores');
        expect(text).not.toContain('halves every 60 days');
        expect(text).not.toContain('momentum 0.35');
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
