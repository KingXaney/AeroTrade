import {describe, expect, it} from 'vitest';
import {buildSearchQuery, decodeEntities, parseSearchFeed, searchUrlFor, toSearchArticles} from '@/lib/news/adapters/search';

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>"nvidia" - Google News</title>
<item>
  <title>Nvidia beats on data center demand - Reuters</title>
  <link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link>
  <pubDate>Mon, 25 Aug 2026 14:00:00 GMT</pubDate>
  <description>&lt;a href="https://news.google.com/rss/articles/CBMiAAA?oc=5"&gt;Nvidia beats&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Reuters&lt;/font&gt;</description>
  <source url="https://www.reuters.com">Reuters</source>
</item>
<item>
  <title>Nvidia beats on data center demand - Reuters</title>
  <link>https://news.google.com/rss/articles/CBMiBBB?oc=5</link>
  <pubDate>Mon, 25 Aug 2026 13:00:00 GMT</pubDate>
  <description>dup</description>
  <source url="https://www.reuters.com">Reuters</source>
</item>
<item>
  <title>Chipmaker&amp;#39;s rally isn&amp;rsquo;t over - Bloomberg</title>
  <link>https://news.google.com/rss/articles/CBMiCCC?oc=5</link>
  <pubDate>Mon, 25 Aug 2026 12:00:00 GMT</pubDate>
  <description>x</description>
</item>
<item>
  <title>Bad link - Evil</title>
  <link>javascript:alert(1)</link>
  <pubDate>Mon, 25 Aug 2026 11:00:00 GMT</pubDate>
  <description>x</description>
</item>
<item>
  <title>No date - Nobody</title>
  <link>https://news.google.com/rss/articles/CBMiDDD?oc=5</link>
  <description>x</description>
</item>
</channel></rss>`;

describe('buildSearchQuery', () => {
    it('quotes phrases, ORs terms and appends exclusions', () => {
        expect(buildSearchQuery(['fed rate', 'fomc'], ['crypto'])).toBe('("fed rate" OR fomc) -crypto');
        expect(buildSearchQuery(['nvidia'], [])).toBe('nvidia');
    });

    it('strips operators and returns empty for no include terms', () => {
        expect(buildSearchQuery(['site:x.com "quoted" (paren)'], [])).toBe('"site x.com quoted paren"');
        expect(buildSearchQuery([], ['x'])).toBe('');
    });

    it('never exceeds the length cap and never splits a phrase', () => {
        const query = buildSearchQuery(Array.from({length: 8}, (_, i) => `a very long keyword phrase number ${i}`), ['zzz']);
        expect(query.length).toBeLessThanOrEqual(200);
        expect((query.match(/"/g) ?? []).length % 2).toBe(0);
    });
});

describe('searchUrlFor', () => {
    it('encodes the query', () => {
        expect(searchUrlFor('("fed rate" OR fomc) -crypto & more'))
            .toBe('https://news.google.com/rss/search?q=(%22fed%20rate%22%20OR%20fomc)%20-crypto%20%26%20more&hl=en-US&gl=US&ceid=US:en');
    });
});

describe('decodeEntities', () => {
    it('decodes named and numeric entities and leaves unknown ones alone', () => {
        expect(decodeEntities('A&amp;B &#39;q&#39; &rsquo; &bogus;')).toBe("A&B 'q' ’ &bogus;");
    });
});

describe('parseSearchFeed + toSearchArticles', () => {
    it('splits headline/source, dedupes, decodes and drops unsafe or dateless items', () => {
        const raw = parseSearchFeed(FIXTURE);
        expect(raw.map((a) => a.headline)).toEqual([
            'Nvidia beats on data center demand',
            'Nvidia beats on data center demand',
            "Chipmaker's rally isn’t over",
        ]);
        expect(raw[0].source).toBe('Reuters');
        expect(raw[2].source).toBe('Bloomberg');
        expect(raw[0].summary).toBe(raw[0].headline);

        const articles = toSearchArticles(raw);
        expect(articles).toHaveLength(2);
        expect(articles[0].headline).toBe('Nvidia beats on data center demand');
        expect(articles[0].datetime).toBe(Date.parse('Mon, 25 Aug 2026 14:00:00 GMT') / 1000);
        expect(articles.every((a) => a.sourceType === 'web')).toBe(true);
        expect(articles.every((a) => a.url.startsWith('https://news.google.com/'))).toBe(true);
    });

    it('returns nothing for garbage', () => {
        expect(parseSearchFeed('not xml at all')).toEqual([]);
        expect(toSearchArticles([])).toEqual([]);
    });
});
