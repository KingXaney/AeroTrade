import {describe, expect, it} from 'vitest';
import {
    BRIEFING_MAX_BULLETS,
    BRIEFING_MAX_STORIES,
    briefingTouches,
    parseBriefingText,
    toPromptArticles,
    type BriefingArticle,
} from '@/lib/news/briefing';
import {buildMarketBriefingPrompt, MARKET_BRIEFING_PROMPT} from '@/lib/news/prompts';

const article = (n: number, over: Partial<BriefingArticle> = {}): BriefingArticle => ({
    headline: `Headline ${n}`,
    source: `Outlet ${n}`,
    url: `https://example.com/a/${n}`,
    datetime: 1_700_000_000 + n,
    eventType: 'macro',
    tickers: [],
    ...over,
});
const ARTICLES = [article(1), article(2, {eventType: 'earnings', tickers: ['NVDA']}), article(3, {tickers: ['AAPL', 'NVDA']})];
const answer = (value: unknown) => JSON.stringify(value);

describe('toPromptArticles', () => {
    it('numbers from one and hands the model no link', () => {
        const shown = toPromptArticles(ARTICLES);
        expect(shown.map((a) => a.n)).toEqual([1, 2, 3]);
        expect(shown[1]).toEqual({n: 2, headline: 'Headline 2', source: 'Outlet 2', kind: 'earnings'});
        expect(JSON.stringify(shown)).not.toContain('http');
    });

    it('keeps URLs out of the built prompt', () => {
        const prompt = buildMarketBriefingPrompt(ARTICLES);
        expect(prompt).toContain('"headline": "Headline 1"');
        expect(prompt).not.toContain('example.com');
        expect(prompt).not.toContain('{{articles}}');
    });

    it('does not let a headline rewrite the prompt around it', () => {
        const prompt = buildMarketBriefingPrompt([article(1, {headline: 'Rates $& hold $` steady'})]);
        expect(prompt).toContain('Rates $& hold $` steady');
        expect(prompt.match(/OUTPUT RULES:/g)).toHaveLength(1);
    });

    it('caps what it asks for at what the parser keeps', () => {
        expect(MARKET_BRIEFING_PROMPT).toContain(`at most ${BRIEFING_MAX_BULLETS}`);
        expect(MARKET_BRIEFING_PROMPT).toContain(`at most ${BRIEFING_MAX_STORIES}`);
    });
});

describe('parseBriefingText', () => {
    it('keeps text and resolves each citation to the article it names', () => {
        const parsed = parseBriefingText(answer({
            headline: 'Rates and chips lead the day',
            bullets: [{text: 'The central bank held rates.', articles: [1, 3]}],
            stories: [{title: 'Chip earnings', summary: 'A chip maker reported.', articles: [2, 3]}],
        }), ARTICLES);
        expect(parsed?.headline).toBe('Rates and chips lead the day');
        expect(parsed?.bullets[0].sources.map((s) => s.url)).toEqual(['https://example.com/a/1', 'https://example.com/a/3']);
        expect(parsed?.stories[0]).toMatchObject({title: 'Chip earnings', eventType: 'earnings', tickers: ['NVDA', 'AAPL']});
    });

    it('reads through code fences', () => {
        const parsed = parseBriefingText('```json\n' + answer({bullets: [{text: 'A point.', articles: [1]}]}) + '\n```', ARTICLES);
        expect(parsed?.bullets).toHaveLength(1);
        expect(parsed?.headline).toBe('');
    });

    it('drops a citation that names no article, and a point left with none', () => {
        const parsed = parseBriefingText(answer({
            bullets: [
                {text: 'Stands on an article.', articles: [0, 2, 99, 2.5, '1', -1]},
                {text: 'Stands on nothing.', articles: [7]},
                {text: 'Cites nothing at all.'},
            ],
            stories: [{title: 'No article', summary: 'Invented.', articles: [42]}],
        }), ARTICLES);
        expect(parsed?.bullets.map((b) => b.text)).toEqual(['Stands on an article.']);
        expect(parsed?.bullets[0].sources.map((s) => s.url)).toEqual(['https://example.com/a/2']);
        expect(parsed?.stories).toEqual([]);
    });

    it('never takes a link from the model', () => {
        const parsed = parseBriefingText(answer({
            bullets: [{text: 'See https://evil.example/phish', articles: [1], url: 'https://evil.example', sources: [{url: 'https://evil.example'}]}],
        }), ARTICLES);
        expect(parsed?.bullets[0].sources).toEqual([{headline: 'Headline 1', source: 'Outlet 1', url: 'https://example.com/a/1', datetime: 1_700_000_001}]);
    });

    it('cites each article once and at most four per point', () => {
        const many = Array.from({length: 8}, (_, i) => article(i + 1));
        const parsed = parseBriefingText(answer({bullets: [{text: 'Many.', articles: [1, 1, 2, 3, 4, 5, 6]}]}), many);
        expect(parsed?.bullets[0].sources.map((s) => s.headline)).toEqual(['Headline 1', 'Headline 2', 'Headline 3', 'Headline 4']);
    });

    it('trims an over-long answer instead of throwing it away', () => {
        const parsed = parseBriefingText(answer({
            headline: 'h'.repeat(500),
            bullets: Array.from({length: 9}, (_, i) => ({text: `Point ${i} ${'x'.repeat(400)}`, articles: [1]})),
            stories: Array.from({length: 12}, (_, i) => ({title: `Story ${i}`, summary: 's'.repeat(900), articles: [2]})),
        }), ARTICLES);
        expect(parsed?.headline.length).toBe(140);
        expect(parsed?.bullets).toHaveLength(BRIEFING_MAX_BULLETS);
        expect(parsed?.bullets[0].text.length).toBe(260);
        expect(parsed?.stories).toHaveLength(BRIEFING_MAX_STORIES);
        expect(parsed?.stories[0].summary.length).toBe(320);
    });

    it('collapses whitespace, so a newline cannot fake a second line of text', () => {
        const parsed = parseBriefingText(answer({bullets: [{text: '  One\n\n  line.  ', articles: [1]}]}), ARTICLES);
        expect(parsed?.bullets[0].text).toBe('One line.');
    });

    it('is nothing when no point stands, or when the answer is not the shape asked for', () => {
        expect(parseBriefingText(answer({headline: 'Quiet', bullets: [], stories: []}), ARTICLES)).toBeNull();
        expect(parseBriefingText(answer({bullets: [{text: 'Unsupported.', articles: []}]}), ARTICLES)).toBeNull();
        expect(parseBriefingText('The market rose today.', ARTICLES)).toBeNull();
        expect(parseBriefingText(answer(['a', 'b']), ARTICLES)).toBeNull();
        expect(parseBriefingText(answer({bullets: 'no'}), ARTICLES)).toBeNull();
        expect(parseBriefingText('', ARTICLES)).toBeNull();
        expect(parseBriefingText(answer({bullets: [{text: 'A point.', articles: [1]}]}), [])).toBeNull();
    });
});

describe('briefingTouches', () => {
    const briefing = {stories: [
        {title: 'a', summary: 'a', eventType: '', tickers: ['NVDA', 'AAPL'], sources: []},
        {title: 'b', summary: 'b', eventType: '', tickers: ['aapl', 'XOM'], sources: []},
    ]};

    it('lists the symbols a reader holds or watches that the stories name, once each', () => {
        expect(briefingTouches(briefing, ['aapl', 'XOM', 'TSLA'])).toEqual(['AAPL', 'XOM']);
    });

    it('is empty when none match', () => {
        expect(briefingTouches(briefing, [])).toEqual([]);
        expect(briefingTouches(briefing, ['TSLA'])).toEqual([]);
    });
});
