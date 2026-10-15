// The limits panel's sentences: every one rendered on a sample and held to the 'copy' tier;
// the labels name every kind and every state.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {LIMIT_KIND_LABELS, LIMIT_STATE_LABELS, LIMITS_COPY, providerLine} from '@/lib/learn/copy/limits';
import {LIMIT_PROVIDERS} from '@/lib/limits/registry';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('LIMITS_COPY', () => {
    it('describes, never advises, in every line and every registry sentence', () => {
        const texts = [
            LIMITS_COPY.heading, LIMITS_COPY.lead, ...Object.values(LIMITS_COPY.columns), LIMITS_COPY.noHit, LIMITS_COPY.plannedNone,
            LIMITS_COPY.docs, LIMITS_COPY.dashboard, LIMITS_COPY.dashboardsNote,
            LIMITS_COPY.capAsOf('2026-10-12'), LIMITS_COPY.hits(0, 0), LIMITS_COPY.hits(1, 3), LIMITS_COPY.hits(2, 2),
            LIMITS_COPY.lastHit('quota', '2 hours ago', 'Topic briefs'), LIMITS_COPY.lastHit('rate', 'a day ago', null),
            LIMITS_COPY.jobsLine([]), LIMITS_COPY.jobsLine(['Brain update', 'News email']), LIMITS_COPY.retention(45),
            LIMITS_COPY.summary(0, 0, 16), LIMITS_COPY.summary(0, 2, 16), LIMITS_COPY.summary(1, 2, 16),
            ...Object.values(LIMIT_KIND_LABELS), ...Object.values(LIMIT_STATE_LABELS),
            ...LIMIT_PROVIDERS.flatMap((p) => [providerLine(p), p.cap, p.planned ?? '']),
        ];
        for (const text of texts) clean(text);
        expect(Object.keys(LIMIT_KIND_LABELS).sort()).toEqual(['auth', 'outage', 'quota', 'rate']);
        expect(Object.keys(LIMIT_STATE_LABELS).sort()).toEqual(['clear', 'hit-today', 'hit-week']);
    });

    it('composes the lines the panel prints', () => {
        expect(LIMITS_COPY.hits(1, 3)).toBe('1 hit today · 3 hits in 7 days');
        expect(LIMITS_COPY.lastHit('quota', '2 hours ago', 'Topic briefs')).toBe('quota · 2 hours ago · Topic briefs');
        expect(LIMITS_COPY.summary(1, 2, 16)).toBe('1 service hit today, 2 this week, of 16 tracked');
        expect(LIMITS_COPY.summary(0, 0, 16)).toBe('no hit recorded this week across 16 services');
        expect(providerLine({label: 'Gemini', uses: 'every model call'})).toBe('Gemini — every model call');
    });
});
