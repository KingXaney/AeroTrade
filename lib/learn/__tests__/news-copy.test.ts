// The news page's own sentences (lib/learn/copy/news.ts), held to the 'copy' tier of
// lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {NEWS_COPY} from '@/lib/learn/copy/news';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('NEWS_COPY', () => {
    it('never advises', () => {
        for (const value of Object.values(NEWS_COPY)) {
            if (typeof value === 'string') clean(value);
        }
        for (const text of [
            NEWS_COPY.briefingCaveat('2026-10-02'), NEWS_COPY.touches(['AAPL', 'NVDA']), NEWS_COPY.moreSources(2),
            NEWS_COPY.moreTopics(1), NEWS_COPY.moreTopics(3), NEWS_COPY.moreHeadlines(18),
        ]) clean(text);
    });

    it('counts in words that agree', () => {
        expect(NEWS_COPY.moreTopics(1)).toBe('+1 more topic');
        expect(NEWS_COPY.moreTopics(3)).toBe('+3 more topics');
        expect(NEWS_COPY.moreSources(2)).toBe('+2 more');
        expect(NEWS_COPY.moreHeadlines(18)).toBe('More headlines (18)');
        expect(NEWS_COPY.touches(['AAPL', 'NVDA'])).toBe('Touches what you hold or watch: AAPL, NVDA');
    });

    it('labels the briefing as a model wrote it, with its date', () => {
        expect(NEWS_COPY.briefingCaveat('2026-10-02')).toBe('2026-10-02 · AI summary · may contain errors');
    });
});
