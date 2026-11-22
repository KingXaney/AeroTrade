// The public landing page's sentences (lib/learn/copy/landing.ts), held to the 'copy' tier of
// lib/learn/banned.ts — a front door is where "the best way to invest" is most tempting.

import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {findBanned} from '@/lib/learn/banned';
import {LANDING_BALANCE, LANDING_COPY} from '@/lib/learn/copy/landing';
import {GLOSSARY_KEYS} from '@/lib/learn/glossary';
import {glossaryKeysFor} from '@/lib/learn/where';
import {PALETTE_IDS} from '@/lib/theme/palettes';
import {DEFAULT_TOPIC_NAMES} from '@/lib/topics/starters';

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
        const news = LANDING_COPY.pillars.find((p) => p.id === 'news');
        expect(news?.points[0]).toContain(`${DEFAULT_TOPIC_NAMES.length} topics`);
        const learn = LANDING_COPY.pillars.find((p) => p.id === 'learn');
        expect(learn?.points[0]).toContain('each day');
        // The glossary as an account that is not the owner's sees it (lib/learn/where.ts): the
        // page reads no session, so it counts what every account gets.
        const terms = glossaryKeysFor({owner: false}).length;
        expect(terms).toBeGreaterThan(50);
        expect(terms).toBeLessThan(GLOSSARY_KEYS.length);
        expect(learn?.points[1]).toContain(`${terms} terms`);
        expect(learn?.points[1]).not.toContain(`${GLOSSARY_KEYS.length} terms`);
        expect(LANDING_COPY.themesBody).toContain(`${PALETTE_IDS.length} colour palettes`);
    });

    // The app has one look: a theme is a palette and the Reduce motion choice (lib/theme/resolve.ts),
    // so the front door offers palettes and counts no visual styles.
    it('offers palettes to try, and no visual style', () => {
        for (const text of all) {
            expect(text, text).not.toMatch(/\bvisual styles?\b|\bpresets?\b/i);
        }
        expect(LANDING_COPY.themesGroup).toMatch(/palette/);
    });

    // app/layout.tsx gives every page without a description of its own this one — the sign-in
    // and sign-up pages among them, which anyone can open. It once wrote its own, which named the
    // owner's pages; quoting this file holds it to the tests here.
    it("is every other page's description too: the root layout quotes it and writes none of its own", () => {
        const layout = readFileSync(fileURLToPath(new URL('../../../app/layout.tsx', import.meta.url)), 'utf8');
        expect(layout).toMatch(/description:\s*LANDING_COPY\.metaDescription\b/);
        expect(layout).not.toMatch(/description:\s*["'`]/);
    });

    // The strategies, both brains (the AI Navigator and its narratives among them), the trading
    // agent world and the lab are the owner's alone (lib/lab/owner.ts): a new account has no way
    // to open them, so the front door and the auth pages' right column never name them.
    it('describes only what every account can open', () => {
        for (const text of all) {
            expect(text, text).not.toMatch(/\bstrateg(y|ies)\b|\bnavigator\b|\bnarratives?\b|\bbrains?\b|\bagent world\b|\blab\b|\bpickers?\b/i);
        }
    });

    it('says what every account has: its measure, its income, its topics, the games', () => {
        const point = (id: string, i: number): string => LANDING_COPY.pillars.find((p) => p.id === id)?.points[i] ?? '';
        expect(point('practise', 0)).toContain('S&P 500');
        expect(point('practise', 1)).toMatch(/interest/);
        expect(point('practise', 1)).toMatch(/dividends/);
        expect(point('news', 2)).toMatch(/daily email/);
        expect(point('learn', 2)).toMatch(/puzzle/);
        expect(point('learn', 2)).toMatch(/games/);
        expect(point('learn', 2)).toMatch(/poker night/);
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
