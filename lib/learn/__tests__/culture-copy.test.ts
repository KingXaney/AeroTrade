// Every sentence the culture brain shows, held to the no-advice list: the glosses at the
// advice tier (narration of what a picker did), the labels and profile copy at the copy tier.

import {describe, expect, it} from 'vitest';
import {CULTURE_PROFILES, CULTURE_TERMS, PROFILE_IDS} from '@/lib/culture/config';
import {CULTURE_SOURCES} from '@/lib/culture/types';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {
    BRAND_BOARD_TERMS,
    COMPARISON_TERMS,
    CULTURE_COPY,
    CULTURE_GLOSS,
    CULTURE_LEGEND_COPY,
    CULTURE_PICKS_COPY,
    CULTURE_RECORD_COPY,
    CULTURE_SYSTEM_COPY,
    CULTURE_WIDGET_COPY,
    PICKS_TERMS,
    PROFILE_COPY,
    RISING_TERMS,
    SOURCE_LABELS,
    TERM_LABELS,
} from '@/lib/learn/copy/culture';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged)\b/i;

const clean = (text: string, tier: 'advice' | 'copy' = 'copy') => {
    expect(text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, tier), text).toEqual([]);
};

describe('the culture glosses', () => {
    it('narrate mechanism only, each ending in a full stop, without advice', () => {
        const samples: Record<string, unknown[]> = {
            picker: ['Spike', PROFILE_COPY.spike, 'price momentum 0.40, attention surprise 0.20'],
            surprise: ['+42.0%', 28, 180],
            rank: ['attention surprise', '3', '118', '0.20 in Spike, 0 in Quiet'],
            neutral: ['attention surprise', '0.20 in Spike, 0 in Quiet'],
            trend: ['+18.0%', 90],
            persistence: ['9', 26],
            quiet: ['+31.0%', 28],
            share: ['+2.1 pts', 28, 180],
            sinceReport: ['+25.0%'],
            noReport: ['0 in Spike, 0.05 in Quiet'],
            slowAttention: ['3.2', 60, 3],
            noCoverage: ['0.10 in Spike, 0.05 in Quiet'],
            sentiment: ['+0.3', '0.05 in Spike, 0.05 in Quiet'],
            appRank: ['12', 200, '0.05 in Spike, 0 in Quiet'],
            momentum: ['+12.0%', 126, 6, '0.40 in Spike, 0.35 in Quiet', '6-month change 0.50, 12-month 0.30, 3-month 0.20'],
            momentumMissing: [64],
            thesis: ['Celsius', '0.10 in Spike, 0.10 in Quiet'],
            trendCap: [],
            volHaircut: ['20%', '0.8'],
            ineligible: [126, '40', 'quoted', 'no attention series'],
            exit: [21],
            exitScore: ['-0.20', '0'],
            thesisBroken: [],
            hardStop: ['35%', '30%'],
            rebalanceBand: ['5%', 21],
            rebalanceUnder: ['10%'],
            rebalanceOver: ['10%'],
            target: ['15%', '15%', '5%'],
            enter: [],
            enterScore: ['0.42', '0.15', 10, '0'],
            holding: [],
        };
        for (const [name, fn] of Object.entries(CULTURE_GLOSS)) {
            expect(samples, `no sample for ${name}`).toHaveProperty(name);
            const text = (fn as (...a: unknown[]) => string)(...samples[name]);
            expect(text.endsWith('.'), name).toBe(true);
            expect(text, name).not.toMatch(MECHANISM_ONLY);
            clean(text, 'advice');
        }
        // Every gloss has a sample, and every sample a gloss.
        expect(Object.keys(samples).sort()).toEqual(Object.keys(CULTURE_GLOSS).sort());
    });
});

describe('the term labels and the profile copy', () => {
    it('name every term and every profile, in words that describe', () => {
        for (const term of CULTURE_TERMS) {
            expect(TERM_LABELS[term].length).toBeGreaterThan(2);
            clean(TERM_LABELS[term]);
        }
        for (const id of PROFILE_IDS) {
            expect(PROFILE_COPY[id].endsWith('.')).toBe(true);
            clean(PROFILE_COPY[id]);
            expect(CULTURE_PROFILES[id].label.length).toBeGreaterThan(2);
            clean(CULTURE_PROFILES[id].label);
        }
    });
});

// Every string of a copy object, and every function rendered on its sample arguments.
const rendered = (copy: Record<string, unknown>, samples: Record<string, unknown[]>): string[] =>
    Object.entries(copy).flatMap(([name, value]) => {
        if (typeof value === 'string') return [value];
        if (typeof value === 'function') {
            expect(samples, `no sample for ${name}`).toHaveProperty(name);
            return [(value as (...a: unknown[]) => string)(...samples[name])];
        }
        if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
        return [];
    });

describe('the /culture page copy', () => {
    it('holds every sentence of every view to the copy tier', () => {
        const pageSamples = {
            thesisMark: [5], unpricedMark: ['2026-10-05'], evidenceFor: ['Celsius', 21], suggestionRow: [3, '2026-10-01'],
        };
        const picksSamples = {
            profileLead: ['Spike', PROFILE_COPY.spike], accountLine: ['Culture Brain · Spike', '2026-10-05'], sinceLaunch: ['2026-10-05'],
            decisionLine: ['2026-10-05', 118, 131], feedsLine: [['price', 'wikipedia']],
            simulatedLine: ['2021-10-04', '2026-10-01', 260], simulatedFills: [12],
        };
        const recordSamples = {
            liveLine: ['2026-10-05', 3, '+1.20%', '+0.40%'], liveStarts: ['2026-10-05'], simulatedLine: ['2021-10-04', '2026-10-01', 2],
        };
        const systemSamples = {
            brandsHint: [160, 30], itemsHint: [40], driftAlarm: [['celsius', 'poppi'], 10], driftClear: [10], earnings: [90],
            universe: ['2026-10-05', 118, 131], accountLine: ['Spike', '2026-10-05', '2026-10-12'],
        };
        const widgetSamples = {picksLine: [[{label: 'Spike', ret: '+1.20%'}, {label: 'Quiet', ret: '-0.30%'}], '2026-10-05'], decisions: [12, '2026-10-05']};
        for (const text of [
            ...rendered(CULTURE_COPY, pageSamples),
            ...rendered(CULTURE_PICKS_COPY, picksSamples),
            ...rendered(CULTURE_RECORD_COPY, recordSamples),
            ...rendered(CULTURE_SYSTEM_COPY, systemSamples),
            ...rendered(CULTURE_WIDGET_COPY, widgetSamples),
            ...Object.values(SOURCE_LABELS),
        ]) {
            clean(text);
        }
        expect(Object.keys(SOURCE_LABELS).sort()).toEqual([...CULTURE_SOURCES].sort());
    });

    it('composes the lines the page prints', () => {
        expect(CULTURE_PICKS_COPY.decisionLine('2026-10-05', 118, 131)).toBe('2026-10-05 · 118 of 131 owners quoted');
        expect(CULTURE_RECORD_COPY.liveLine('2026-10-05', 1, '+1.20%', '+0.40%')).toBe('Live since 2026-10-05 · 1 daily snapshot at 16:10 ET · return +1.20% vs SPY +0.40%');
        expect(CULTURE_RECORD_COPY.simulatedLine('2021-10-04', '2026-10-01', 0)).toBe('2021-10-04 → 2026-10-01 · weekly decisions · next-open fills · no fees or slippage · interest and dividends included');
        expect(CULTURE_SYSTEM_COPY.driftAlarm(['celsius'], 10)).toBe('1 brand has no Wikipedia views in the last 10 days — a renamed article or a title the catalog misspells: celsius');
        expect(CULTURE_SYSTEM_COPY.earnings(0)).toMatch(/neutral/);
        expect(CULTURE_WIDGET_COPY.picksLine([{label: 'Spike', ret: '+1.20%'}, {label: 'Quiet', ret: '-0.30%'}], '2026-10-05')).toBe('Spike +1.20% · Quiet -0.30% · since 2026-10-05');
        expect(CULTURE_COPY.suggestionRow(1, '2026-10-01')).toBe('1 mention · first seen 2026-10-01');
    });

    it('lists only glossary keys in every panel\'s term list', () => {
        for (const keys of [BRAND_BOARD_TERMS, RISING_TERMS, PICKS_TERMS, COMPARISON_TERMS]) {
            expect(keys.length).toBeGreaterThan(0);
            for (const key of keys) expect(GLOSSARY[key], key).toBeTruthy();
        }
    });

    it('holds the legend\'s sentences to the copy tier and to mechanism only', () => {
        const samples = {
            reading: [60, '0.2'], sources: ['Wikipedia 1, News 0.2'], surprises: [7, 90, 50], layers: [5, 60],
            decayExample: [10, {days: 30, weight: '7.1'}, {days: 60, weight: '5.0'}], thesis: [5, '40%'],
            surprise: [28, 180], trend: [90], persistence: [26], quiet: [28], share: [28, 180], sinceReport: [], appRank: [200, 7], rollup: ['50%', 3],
            profileHeading: ['Spike'], profile: ['Spike', PROFILE_COPY.spike, 'price momentum 0.40'],
            momentum: ['6-month change 0.50, 12-month 0.30, 3-month 0.20'], caps: ['20%', '0.8'], eligibility: [126],
            universe: [150], entry: [10, '0.15', '15%', '5%'], exit: ['0', '30%', 21], pace: ['5%', 4], accounts: ['$100,000'],
        };
        for (const text of rendered(CULTURE_LEGEND_COPY, samples)) {
            clean(text);
            expect(text).not.toMatch(MECHANISM_ONLY);
        }
    });
});
