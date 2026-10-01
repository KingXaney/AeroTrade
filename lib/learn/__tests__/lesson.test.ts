import {describe, expect, it} from 'vitest';
import {GLOSSARY, conceptForTerm} from '@/lib/learn/glossary';
import {STARTER_TOPICS} from '@/lib/topics/starters';
import {
    CONCEPT_KEYS,
    CONCEPT_TERMS,
    LESSON_HEADLINES,
    dayOfYear,
    pickLesson,
    safeArticleUrl,
    termCountsFromRows,
    type LessonHeadline,
} from '@/lib/learn/lesson';

const h = (contentHash: number, datetime: number, headline = `Headline ${contentHash}`): LessonHeadline =>
    ({contentHash, headline, url: `https://example.com/${contentHash}`, source: 'Example', datetime});

describe('CONCEPT_TERMS', () => {
    it('is every spelling that names a concept, and nothing else', () => {
        expect(CONCEPT_TERMS.length).toBeGreaterThan(CONCEPT_KEYS.length);
        for (const term of CONCEPT_TERMS) {
            expect(conceptForTerm(term), term).not.toBeNull();
            expect(term, term).toBe(term.toLowerCase());
        }
        expect(CONCEPT_TERMS).toContain('fomc');
        expect(CONCEPT_TERMS).toContain('trade war');
        expect(CONCEPT_TERMS).not.toContain('max drawdown');
        expect(new Set(CONCEPT_TERMS).size).toBe(CONCEPT_TERMS.length);
    });

    it('covers the concept keywords the starter topics match on', () => {
        const starterTerms = STARTER_TOPICS.flatMap((topic) => topic.keywords).filter((k) => conceptForTerm(k) !== null);
        expect(starterTerms.length).toBeGreaterThan(5);
        for (const term of starterTerms) expect(CONCEPT_TERMS, term).toContain(term);
    });

    it('lists the concept keys in glossary order', () => {
        expect(CONCEPT_KEYS.every((key) => GLOSSARY[key].kind === 'concept')).toBe(true);
        expect(CONCEPT_KEYS[0]).toBe('fomc');
    });
});

describe('termCountsFromRows', () => {
    it('maps matched terms to concepts and counts distinct articles', () => {
        const counts = termCountsFromRows([
            {term: 'tariffs', hashes: [1, 2], headlines: [h(1, 100), h(2, 200)]},
            {term: 'trade war', hashes: [2, 3], headlines: [h(2, 200), h(3, 300)]},
            {term: 'fomc', hashes: [4], headlines: [h(4, 50)]},
        ]);
        expect(counts.map((c) => [c.key, c.count])).toEqual([['tariffs', 3], ['fomc', 1]]);
        expect(counts[0].headlines.map((x) => x.contentHash)).toEqual([3, 2, 1]);
    });

    it('skips names that are not concepts, and never matches by substring', () => {
        const counts = termCountsFromRows([
            {term: 'nvidia', hashes: [1], headlines: [h(1, 1)]},
            {term: 'fomc minutes', hashes: [2], headlines: [h(2, 2)]},
            {term: '.*', hashes: [3], headlines: [h(3, 3)]},
        ]);
        expect(counts).toEqual([]);
    });

    it('keeps the newest three headlines per concept', () => {
        const rows = [{term: 'opec', hashes: [1, 2, 3, 4, 5], headlines: [1, 2, 3, 4, 5].map((n) => h(n, n * 10))}];
        const [opec] = termCountsFromRows(rows);
        expect(LESSON_HEADLINES).toBe(3);
        expect(opec.headlines.map((x) => x.contentHash)).toEqual([5, 4, 3]);
        expect(opec.count).toBe(5);
    });

    it('drops a syndicated copy that repeats a headline', () => {
        const [fomc] = termCountsFromRows([{term: 'fomc', hashes: [1, 2], headlines: [h(1, 10, 'Fed holds rates'), h(2, 20, 'Fed Holds Rates')]}]);
        expect(fomc.headlines).toHaveLength(1);
    });

    it('breaks equal counts by glossary key', () => {
        const counts = termCountsFromRows([
            {term: 'opec', hashes: [1], headlines: [h(1, 1)]},
            {term: 'fomc', hashes: [2], headlines: [h(2, 2)]},
        ]);
        expect(counts.map((c) => c.key)).toEqual(['fomc', 'opec']);
    });
});

describe('pickLesson', () => {
    it('teaches the concept the day\'s articles used most', () => {
        const counts = termCountsFromRows([
            {term: 'fomc', hashes: [1, 2], headlines: [h(1, 1), h(2, 2)]},
            {term: 'opec', hashes: [3], headlines: [h(3, 3)]},
        ]);
        const lesson = pickLesson(counts, '2026-09-29');
        expect(lesson).toMatchObject({mode: 'feed', key: 'fomc', count: 2});
        expect(lesson.headlines).toHaveLength(2);
    });

    it('rotates between concepts tied for the most articles, by the day', () => {
        const counts = termCountsFromRows([
            {term: 'fomc', hashes: [1], headlines: [h(1, 1)]},
            {term: 'opec', hashes: [2], headlines: [h(2, 2)]},
        ]);
        const picks = new Set(['2026-09-28', '2026-09-29'].map((d) => pickLesson(counts, d).key));
        expect(picks).toEqual(new Set(['fomc', 'opec']));
    });

    it('falls back to the day-of-year concept with no headlines', () => {
        const lesson = pickLesson([], '2026-01-01');
        expect(lesson).toEqual({mode: 'day', key: CONCEPT_KEYS[1 % CONCEPT_KEYS.length], count: 0, headlines: []});
        expect(pickLesson([], '2026-01-02').key).toBe(CONCEPT_KEYS[2 % CONCEPT_KEYS.length]);
        expect(pickLesson([], '2026-09-29', ['opec']).key).toBe('opec');
    });

    it('counts days of the year from January 1st', () => {
        expect(dayOfYear('2026-01-01')).toBe(1);
        expect(dayOfYear('2026-12-31')).toBe(365);
        expect(dayOfYear('2028-12-31')).toBe(366);
    });
});

describe('safeArticleUrl', () => {
    it('links only http and https URLs', () => {
        expect(safeArticleUrl('https://news.example.com/a?b=1')).toBe('https://news.example.com/a?b=1');
        expect(safeArticleUrl('http://example.com')).toBe('http://example.com/');
        expect(safeArticleUrl('javascript:alert(1)')).toBeNull();
        expect(safeArticleUrl('data:text/html,<b>x</b>')).toBeNull();
        expect(safeArticleUrl('not a url')).toBeNull();
        expect(safeArticleUrl('')).toBeNull();
    });
});
