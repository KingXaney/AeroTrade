// The daily brief, laid out: every link in the HTML is one the view holds (or a section's own),
// every model-written string arrives as text, the plain-text part spells out every link, and the
// whole email stays under Gmail's clipping size.

import {describe, expect, it} from 'vitest';
import {buildDigestView} from '@/lib/email/digest-view';
import {renderDigestBody, renderDigestHtml, renderDigestText} from '@/lib/email/digest-render';
import {parseDigestSummary, type DigestArticle} from '@/lib/email/digest-summary';
import {buildTopicsSectionHtml, topicsSectionLinks} from '@/lib/email/sections/topics';
import {FIXTURE_APP, FIXTURE_ARTICLES, FIXTURE_DAY, FIXTURE_MODEL_ANSWER, FIXTURE_NAVIGATOR, FIXTURE_SYMBOLS, FIXTURE_TOPICS} from '@/lib/email/__fixtures__/digest';

const hrefsOf = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

const topicsHtml = buildTopicsSectionHtml(FIXTURE_TOPICS, `${FIXTURE_APP}/topics`);
const view = (articles: DigestArticle[] = FIXTURE_ARTICLES, answer = FIXTURE_MODEL_ANSWER) => buildDigestView({
    day: FIXTURE_DAY, appUrl: FIXTURE_APP, summary: parseDigestSummary(answer, articles, FIXTURE_SYMBOLS)!,
    readerSymbols: FIXTURE_SYMBOLS, navigator: FIXTURE_NAVIGATOR, topicsHtml, lessonHtml: '',
});

describe('renderDigestHtml', () => {
    it('links only to what the view and the topics section allow', () => {
        const v = view();
        const html = renderDigestHtml(v);
        const allowed = new Set([...v.allowedUrls, ...topicsSectionLinks(FIXTURE_TOPICS, `${FIXTURE_APP}/topics`)]);
        const hrefs = hrefsOf(html);
        expect(hrefs.length).toBeGreaterThan(15);
        for (const href of hrefs) expect(allowed.has(href), href).toBe(true);
    });

    it('lays out every part of the brief, in order', () => {
        const html = renderDigestHtml(view());
        const order = ['Chipmakers rise on strong orders', 'In 30 seconds', 'Your stocks', 'Why it matters:', 'Markets',
            'From your news feed', 'What people are posting', 'AI Navigator', 'Your topics', 'All of today’s news on AeroTrade', 'Email preferences'];
        const at = order.map((text) => html.indexOf(text));
        for (const [i, position] of at.entries()) expect(position, order[i]).toBeGreaterThan(-1);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        expect(html).toContain('Monday, October 5, 2026');
        expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('prints what the model and the outlets wrote as text, never as markup', () => {
        const hostile: DigestArticle[] = [{
            headline: '<img src=x onerror=alert(1)>', summary: 's', source: '<b>Wire</b>', url: 'javascript:alert(1)', related: 'NVDA', sourceType: 'finance',
        }];
        const answer = JSON.stringify({headline: '<script>alert(1)</script>', bullets: [{text: '<a href="https://evil.example.com">win</a>', articles: [1]}], stories: [
            {title: '<h1>big</h1>', summary: 'ok', why: '"quoted" & <i>this</i>', articles: [1]},
        ]});
        const html = renderDigestBody(view(hostile, answer));
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img');
        expect(html).not.toContain('evil.example.com"');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('&lt;b&gt;Wire&lt;/b&gt;');
        expect(html).toContain('&quot;quoted&quot; &amp; &lt;i&gt;this&lt;/i&gt;');
    });

    it('stays well under the size at which Gmail clips a message', () => {
        const many: DigestArticle[] = Array.from({length: 30}, (_, i) => ({
            headline: `Story ${i} ${'headline '.repeat(10)}`, summary: 'summary '.repeat(60), source: `Outlet ${i}`,
            url: `https://news.example.com/${i}?ref=${'x'.repeat(80)}`, related: i % 2 ? 'NVDA' : '', sourceType: 'finance',
        }));
        const answer = JSON.stringify({
            headline: 'h'.repeat(200),
            bullets: Array.from({length: 5}, () => ({text: 'b'.repeat(260), articles: [1, 2, 3]})),
            stories: Array.from({length: 8}, (_, i) => ({title: 't'.repeat(140), summary: 's'.repeat(360), why: 'w'.repeat(200), articles: [i * 3 + 1, i * 3 + 2, i * 3 + 3]})),
        });
        const html = renderDigestHtml(view(many, answer));
        expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(100_000);
    });
});

describe('renderDigestText', () => {
    it('spells out every article, chip and app link the HTML carries', () => {
        const v = view();
        const text = renderDigestText(v);
        for (const url of v.allowedUrls) expect(text, url).toContain(url);
        expect(text).toContain('Chipmakers rise on strong orders while the Fed holds rates steady');
        expect(text).toContain('Why it matters: When orders outrun supply');
        expect(text).toContain(`AI chips (${FIXTURE_APP}/topics/ai-chips)`);
        expect(text).not.toMatch(/<[a-z/]/i);
    });
});
