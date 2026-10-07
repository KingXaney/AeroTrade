// Every sentence the culture brain shows, held to the no-advice list: the glosses at the
// advice tier (narration of what a picker did), the labels and profile copy at the copy tier.

import {describe, expect, it} from 'vitest';
import {CULTURE_PROFILES, CULTURE_TERMS, PROFILE_IDS} from '@/lib/culture/config';
import {findBanned} from '@/lib/learn/banned';
import {CULTURE_GLOSS, PROFILE_COPY, TERM_LABELS} from '@/lib/learn/copy/culture';

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
