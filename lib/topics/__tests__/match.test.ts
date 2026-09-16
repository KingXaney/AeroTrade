import {describe, expect, it} from 'vitest';
import {escapeRegExp, matchArticles, scoreArticle, termPattern} from '@/lib/topics/match';

const article = (headline: string, summary = '', datetime = 1_700_000_000) =>
    ({headline, summary, url: `https://example.com/${datetime}`, source: 'Test', datetime});

describe('termPattern', () => {
    it('matches whole words only', () => {
        expect(termPattern('AI').test('AI chips are hot')).toBe(true);
        expect(termPattern('AI').test('He said so')).toBe(false);
        expect(termPattern('Nvidia').test('Nvidian shares')).toBe(false);
    });

    it('is case-insensitive and handles phrases', () => {
        expect(termPattern('fed rate').test('The FED RATE decision')).toBe(true);
    });

    it('treats regex metacharacters literally', () => {
        expect(termPattern('C++').test('Learning C++ today')).toBe(true);
        expect(termPattern('.NET').test('Microsoft .NET 9 ships')).toBe(true);
        expect(termPattern('S&P 500').test('S&P 500 hits a record')).toBe(true);
        expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
    });

    it('supports cashtags and unicode boundaries', () => {
        expect(termPattern('$nvda').test('Loading up on $NVDA')).toBe(true);
        expect(termPattern('nvda').test('$NVDA')).toBe(false);
        expect(termPattern('café').test('Le café ouvre')).toBe(true);
        expect(termPattern('東京').test('東京 市場')).toBe(true);
    });
});

describe('scoreArticle', () => {
    it('weights headline hits 3 and summary hits 1, capping summary hits', () => {
        const scored = scoreArticle(article('Nvidia beats', 'nvidia nvidia nvidia nvidia nvidia nvidia nvidia'), ['nvidia'], []);
        expect(scored).toEqual({score: 3 + 5, matchedTerms: ['nvidia']});
    });

    it('returns null with no include hit or any exclude hit', () => {
        expect(scoreArticle(article('Nothing here'), ['nvidia'], [])).toBeNull();
        expect(scoreArticle(article('Nvidia crypto mining'), ['nvidia'], ['crypto'])).toBeNull();
    });
});

describe('matchArticles', () => {
    it('sorts by score then recency and applies the cap', () => {
        const items = [
            article('Fed holds', 'fed', 100),
            article('Fed cuts rates', 'fed fed', 200),
            article('Fed pauses', '', 300),
            article('Unrelated', '', 400),
        ];
        const result = matchArticles(items, ['fed'], [], {cap: 2});
        expect(result.map((r) => r.article.headline)).toEqual(['Fed cuts rates', 'Fed holds']);
    });

    it('handles a very large input quickly', () => {
        const big = article('Nothing', 'lorem ipsum '.repeat(10_000));
        const started = performance.now();
        expect(scoreArticle(big, ['nvidia', 'amd', 'tsmc'], ['crypto'])).toBeNull();
        expect(performance.now() - started).toBeLessThan(50);
    });
});
