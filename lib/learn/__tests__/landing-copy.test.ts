// The public landing page's sentences (lib/learn/copy/landing.ts), held to the 'copy' tier of
// lib/learn/banned.ts — a front door is where "the best way to invest" is most tempting.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {LANDING_BALANCE, LANDING_COPY} from '@/lib/learn/copy/landing';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {GLOSSARY_KEYS} from '@/lib/learn/glossary';

const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
};

describe('LANDING_COPY', () => {
    const all = strings(LANDING_COPY);

    it('never advises, in any line', () => {
        expect(all.length).toBeGreaterThan(30);
        for (const text of all) {
            expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('quotes no return, no user count and no testimonial', () => {
        for (const text of all) {
            expect(text, text).not.toMatch(/\d\s?%/);
            expect(text, text).not.toMatch(/\b(users|traders|investors) (trust|love|use)\b/i);
            expect(text, text).not.toMatch(/[“"][^”"]{20,}[”"]\s*[—-]/);
        }
    });

    it('takes its numbers from the constants the app uses', () => {
        expect(LANDING_BALANCE).toBe('$100,000.00');
        expect(LANDING_COPY.subtitle).toContain('$100,000');
        const practise = LANDING_COPY.pillars.find((p) => p.id === 'practise');
        expect(practise?.points[0]).toContain(`${STRATEGIES.length} rule-based strategies`);
        const learn = LANDING_COPY.pillars.find((p) => p.id === 'learn');
        expect(learn?.points[0]).toContain(`${GLOSSARY_KEYS.length} terms`);
    });

    it('says plainly that no real money is involved', () => {
        expect(LANDING_COPY.subtitle).toMatch(/No real money/);
        expect(LANDING_COPY.disclaimer).toMatch(/never gives financial advice/);
    });

    it('has the three pillars the page is built on', () => {
        expect(LANDING_COPY.pillars.map((p) => p.id)).toEqual(['news', 'learn', 'practise']);
        for (const pillar of LANDING_COPY.pillars) expect(pillar.points.length).toBe(3);
    });
});
