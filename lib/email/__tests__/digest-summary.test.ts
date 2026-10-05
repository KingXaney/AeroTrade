// The daily brief's model half: what the model is shown (no links), what is kept of its answer
// (only what cites an article it was shown), and what is mailed when it answered nothing usable.

import {describe, expect, it} from 'vitest';
import {
    articleSymbols,
    DIGEST_FALLBACK_STORIES,
    DIGEST_MAX_BULLETS,
    DIGEST_MAX_STORIES,
    DIGEST_SOURCES_PER_ITEM,
    fallbackDigestSummary,
    parseDigestSummary,
    toDigestPromptArticles,
    type DigestArticle,
} from '@/lib/email/digest-summary';
import {buildDigestPrompt, DAILY_DIGEST_PROMPT} from '@/lib/email/prompts';
import {FIXTURE_ARTICLES, FIXTURE_MODEL_ANSWER, FIXTURE_SYMBOLS} from '@/lib/email/__fixtures__/digest';

const article = (i: number, over: Partial<DigestArticle> = {}): DigestArticle => ({
    headline: `Headline ${i}`, summary: `Summary ${i}. Second sentence. Third sentence.`, source: `Outlet ${i}`,
    url: `https://news.example.com/${i}`, related: '', sourceType: 'finance', ...over,
});

describe('articleSymbols', () => {
    it("names only the reader's symbols, from Finnhub's related field and $CASHTAGS", () => {
        expect(articleSymbols({related: 'NVDA', headline: 'x'}, FIXTURE_SYMBOLS)).toEqual(['NVDA']);
        expect(articleSymbols({related: 'TSLA,aapl', headline: 'x'}, FIXTURE_SYMBOLS)).toEqual(['AAPL']);
        expect(articleSymbols({related: '', headline: 'Why $nvda and $AMD moved'}, FIXTURE_SYMBOLS)).toEqual(['NVDA']);
        // A bare capitalised word is not a ticker mention.
        expect(articleSymbols({related: '', headline: 'NVDA and AAPL in focus'}, FIXTURE_SYMBOLS)).toEqual([]);
        expect(articleSymbols({related: 'NVDA', headline: 'x'}, [])).toEqual([]);
    });
});

describe('the prompt', () => {
    it('numbers the articles and never shows the model a link', () => {
        const shown = toDigestPromptArticles(FIXTURE_ARTICLES, FIXTURE_SYMBOLS);
        expect(shown.map((a) => a.n)).toEqual(FIXTURE_ARTICLES.map((_, i) => i + 1));
        expect(shown[0]).toMatchObject({kind: 'finance', symbols: ['NVDA'], source: 'Reuters'});
        const prompt = buildDigestPrompt(FIXTURE_ARTICLES, FIXTURE_SYMBOLS);
        expect(prompt).not.toMatch(/https?:\/\//);
        expect(prompt).not.toContain('{{');
        expect(prompt).toContain('["NVDA","AAPL","XLE"]');
    });

    it('keeps a "$&" in scraped text literal, and fills the symbols before the articles', () => {
        const prompt = buildDigestPrompt([article(1, {headline: 'Odd $& $` {{symbols}} headline'})], ['NVDA']);
        expect(prompt).toContain('Odd $& $` {{symbols}} headline');
        expect(prompt.split('THE READER HOLDS OR WATCHES: ["NVDA"]').length).toBe(2);
        expect(DAILY_DIGEST_PROMPT.indexOf('{{symbols}}')).toBeLessThan(DAILY_DIGEST_PROMPT.indexOf('{{articles}}'));
    });

    it('clamps what the model is shown of each article', () => {
        const [shown] = toDigestPromptArticles([article(1, {summary: 'x'.repeat(5000), headline: `  spaced\n\nout  `})], []);
        expect(shown.summary.length).toBeLessThanOrEqual(400);
        expect(shown.headline).toBe('spaced out');
    });
});

describe('parseDigestSummary', () => {
    it('keeps a well-formed answer, each point with the articles it cites', () => {
        const summary = parseDigestSummary(FIXTURE_MODEL_ANSWER, FIXTURE_ARTICLES, FIXTURE_SYMBOLS)!;
        expect(summary.fallback).toBe(false);
        expect(summary.headline).toBe('Chipmakers rise on strong orders while the Fed holds rates steady');
        expect(summary.bullets).toHaveLength(3);
        expect(summary.bullets[0].sources.map((s) => s.source)).toEqual(['Reuters', 'Bloomberg']);
        expect(summary.stories[0].sources[0]).toMatchObject({url: 'https://news.example.com/nvidia-orders', kind: 'finance', symbols: ['NVDA']});
        expect(summary.stories[0].why).toContain('bottleneck');
    });

    it('reads an answer inside code fences', () => {
        expect(parseDigestSummary('```json\n' + FIXTURE_MODEL_ANSWER + '\n```', FIXTURE_ARTICLES, FIXTURE_SYMBOLS)).not.toBeNull();
    });

    it('is null for prose, broken JSON, the wrong shape, or nothing that cites an article', () => {
        for (const text of ['', 'Here is your brief!', '{"headline": ', '[1,2]', '{"bullets": "no"}',
            JSON.stringify({headline: 'x', bullets: [{text: 'no source', articles: []}], stories: []})]) {
            expect(parseDigestSummary(text, FIXTURE_ARTICLES, FIXTURE_SYMBOLS), text).toBeNull();
        }
    });

    it('drops citations it was not shown, repeats, and items left citing nothing', () => {
        const answer = JSON.stringify({
            headline: 'h',
            bullets: [
                {text: 'real', articles: [2, 2, 0, 99, 1.5, '1', 1]},
                {text: 'invented source', articles: [42]},
            ],
            stories: [{title: 't', summary: 's', articles: [-1]}, {title: 'kept', summary: 's', articles: [3]}],
        });
        const summary = parseDigestSummary(answer, FIXTURE_ARTICLES, FIXTURE_SYMBOLS)!;
        expect(summary.bullets).toHaveLength(1);
        expect(summary.bullets[0].sources.map((s) => s.url)).toEqual([FIXTURE_ARTICLES[1].url, FIXTURE_ARTICLES[0].url]);
        expect(summary.stories.map((s) => s.title)).toEqual(['kept']);
    });

    it('caps and clamps every field', () => {
        const many = Array.from({length: 20}, (_, i) => article(i));
        const answer = JSON.stringify({
            headline: 'H'.repeat(500),
            bullets: Array.from({length: 12}, () => ({text: 'b'.repeat(900), articles: [1, 2, 3, 4, 5, 6]})),
            stories: Array.from({length: 12}, () => ({title: 't'.repeat(900), summary: 's'.repeat(900), why: 'w'.repeat(900), articles: [1]})),
        });
        const summary = parseDigestSummary(answer, many, [])!;
        expect(summary.headline.length).toBeLessThanOrEqual(140);
        expect(summary.bullets).toHaveLength(DIGEST_MAX_BULLETS);
        expect(summary.bullets[0].text.length).toBeLessThanOrEqual(260);
        expect(summary.bullets[0].sources).toHaveLength(DIGEST_SOURCES_PER_ITEM);
        expect(summary.stories).toHaveLength(DIGEST_MAX_STORIES);
        expect(summary.stories[0].title.length).toBeLessThanOrEqual(140);
        expect(summary.stories[0].summary.length).toBeLessThanOrEqual(360);
        expect(summary.stories[0].why.length).toBeLessThanOrEqual(200);
    });

    it('takes no link from the model, whatever it writes', () => {
        const answer = JSON.stringify({headline: 'h', bullets: [{text: 'see https://evil.example.com', articles: [1], url: 'https://evil.example.com'}], stories: []});
        const summary = parseDigestSummary(answer, FIXTURE_ARTICLES, FIXTURE_SYMBOLS)!;
        expect(summary.bullets[0].sources.map((s) => s.url)).toEqual([FIXTURE_ARTICLES[0].url]);
    });
});

describe('fallbackDigestSummary', () => {
    it("tells the leading stories in their outlets' words, the reader's own stocks first", () => {
        const summary = fallbackDigestSummary(FIXTURE_ARTICLES, FIXTURE_SYMBOLS);
        expect(summary.fallback).toBe(true);
        expect(summary.bullets).toEqual([]);
        expect(summary.stories).toHaveLength(DIGEST_FALLBACK_STORIES);
        expect(summary.stories.slice(0, 4).every((s) => s.sources[0].symbols.length > 0)).toBe(true);
        expect(summary.stories[0].summary).toBe('Nvidia rose 3.1% to $142.10 after two suppliers said orders for its data-center chips still exceed what they can ship this quarter. The company reports results on November 19.');
    });

    it('keeps two sentences of a summary, and skips an article without a headline', () => {
        const summary = fallbackDigestSummary([article(1, {headline: '  '}), article(2)], []);
        expect(summary.stories.map((s) => s.title)).toEqual(['Headline 2']);
        expect(summary.stories[0].summary).toBe('Summary 2. Second sentence.');
    });
});
