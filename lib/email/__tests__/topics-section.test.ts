import {describe, expect, it} from 'vitest';
import {buildTopicsSectionHtml, topicsSectionLinks} from '@/lib/email/sections/topics';

describe('buildTopicsSectionHtml', () => {
    it('returns an empty string when there are no topics', () => {
        expect(buildTopicsSectionHtml([], 'https://app.example.com/topics')).toBe('');
    });

    it('escapes every string and only links http(s) urls', () => {
        const html = buildTopicsSectionHtml([{
            name: 'AI <script>alert(1)</script>',
            slug: 'ai',
            brief: {summary: 'Chips & <b>more</b>', bullets: ['<img src=x onerror=1>']},
            newCount: 2,
            articles: [
                {headline: 'Safe <link>', url: 'https://news.example.com/a?x=1&y=2', source: 'Wire'},
                {headline: 'Bad link', url: 'javascript:alert(1)', source: 'Evil'},
            ],
        }], 'https://app.example.com/topics');

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('Chips &amp; &lt;b&gt;more&lt;/b&gt;');
        expect(html).toContain('href="https://news.example.com/a?x=1&amp;y=2"');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('2 new since yesterday');
        expect(html).toContain('Manage topics');
    });

    it('caps topics, bullets and articles', () => {
        const topics = Array.from({length: 8}, (_, i) => ({
            name: `Topic ${i}`, slug: `t${i}`, newCount: 0,
            brief: {summary: 's', bullets: ['1', '2', '3', '4', '5']},
            articles: Array.from({length: 5}, (_, j) => ({headline: `H${j}`, url: `https://x.test/${j}`, source: 'S'})),
        }));
        const html = buildTopicsSectionHtml(topics, 'https://x.test/topics');
        expect((html.match(/<h3/g) ?? []).length).toBe(6);
        expect((html.match(/<li>/g) ?? []).length).toBe(6 * 4);
        expect((html.match(/https:\/\/x\.test\/\d/g) ?? []).length).toBe(6 * 3);
    });

    it("links each topic's name to its own page, and lists exactly the links it builds", () => {
        const topics = [
            {name: 'AI chips', slug: 'ai chips', newCount: 1, brief: null, articles: [
                {headline: 'One', url: 'https://news.example.com/1', source: 'W'},
                {headline: 'Bad', url: 'javascript:alert(1)', source: 'W'},
            ]},
            {name: 'No slug', slug: '', newCount: 0, brief: null, articles: []},
        ];
        const html = buildTopicsSectionHtml(topics, 'https://app.example.com/topics/');
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
        expect(hrefs).toEqual(['https://app.example.com/topics/ai%20chips', 'https://news.example.com/1', 'https://app.example.com/topics/']);
        expect(new Set(topicsSectionLinks(topics, 'https://app.example.com/topics/'))).toEqual(new Set(hrefs));
        expect(topicsSectionLinks([], 'https://app.example.com/topics')).toEqual([]);
    });
});
