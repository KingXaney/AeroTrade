import {describe, expect, it} from 'vitest';
import {toSidebarNews, toSidebarPortfolio} from '@/lib/shell/sidebar';
import {outletAllowed} from '@/lib/news/feed';
import type {MarketBriefingView} from '@/lib/news/briefing';
import type {EnrichedPosition, PortfolioSummary} from '@/lib/trading/types';
import type {TopicArticleView, TopicOverviewItem} from '@/lib/topics/types';

const position = (symbol: string, marketValue: number, priceStale = false): EnrichedPosition => ({
    symbol, company: symbol, quantity: 10, avgCost: 10, costBasis: 100, marketValue,
    unrealizedPnl: marketValue - 100, unrealizedPnlPct: marketValue - 100, priceStale,
});

const summary: PortfolioSummary = {
    startingBalance: 10_000, cash: 9_000, holdingsValue: 1_000, totalValue: 10_000, totalReturnAbs: 0, totalReturnPct: 0,
    positions: [position('AAPL', 400), position('MSFT', 300, true), position('NVDA', 200), position('XOM', 100, true)],
};

describe('toSidebarPortfolio', () => {
    it('keeps the top three holdings and counts every unpriced one', () => {
        const card = toSidebarPortfolio(summary, 2);
        expect(card).toMatchObject({totalValue: 10_000, totalReturnPct: 0, cash: 9_000, accountsCount: 2, unpriced: 2});
        expect(card.top).toEqual([
            {symbol: 'AAPL', quantity: 10, unrealizedPnlPct: 300, priceStale: false},
            {symbol: 'MSFT', quantity: 10, unrealizedPnlPct: 200, priceStale: true},
            {symbol: 'NVDA', quantity: 10, unrealizedPnlPct: 100, priceStale: false},
        ]);
    });
});

describe('toSidebarNews', () => {
    const article = (datetime: number, source = 'Reuters', headline = 'A headline'): TopicArticleView => ({
        contentHash: datetime, headline, summary: '', url: `https://news.example/${datetime}`, source, sourceType: 'rss',
        datetime, score: 0, matchedTerms: [],
    });
    const topic = (slug: string, unseenCount: number, latest: TopicArticleView | null, lastSeenAt: number | null = null): TopicOverviewItem => ({
        id: slug, name: slug.toUpperCase(), slug, keywords: [slug], exclude: [], color: null, keywordSetHash: 1,
        createdAt: 0, lastFetchedAt: null, lastSeenAt, refreshRequestedAt: null, brief: null,
        unseenCount, articleCount: unseenCount, latest,
    });
    const EVERYTHING: (source: string | undefined) => boolean = () => true;
    // The store hands over outletAllowed(prefs) — the same rule the news page applies.
    const hiding = (outlet: string) => outletAllowed({includeSources: [], excludeSources: [outlet]});
    const source = (name: string, n: number) => ({headline: `Cited ${n}`, source: name, url: `https://news.example/b/${n}`, datetime: n});
    const briefing: MarketBriefingView = {
        date: '2026-10-02',
        generatedAt: 0,
        headline: 'The day',
        bullets: [{text: 'From two outlets.', sources: [source('Reuters', 1), source('CNBC', 2)]}],
        stories: [],
    };
    const news = (over: Partial<Parameters<typeof toSidebarNews>[0]> = {}) => toSidebarNews({
        overview: {topics: [], unseenTotal: 0}, briefing: null, allowed: EVERYTHING, newsSeenAt: null, ...over,
    });

    it('lists the most unseen first, the freshest first among equals, three at most', () => {
        const card = news({overview: {
            topics: [topic('a', 1, article(10)), topic('b', 4, null), topic('c', 1, article(20)), topic('d', 0, article(30))],
            unseenTotal: 6,
        }});
        expect(card.followed).toBe(4);
        expect(card.top.map((t) => t.slug)).toEqual(['b', 'c', 'a']);
    });

    it("puts each topic's newest headline and its time on the row, from an outlet the reader has not hidden", () => {
        const topics = [topic('a', 2, article(10, 'Reuters', 'Rates hold')), topic('b', 1, article(20, 'CNBC', 'Chips rally')), topic('c', 0, null)];
        const open = news({overview: {topics, unseenTotal: 3}});
        expect(open.top[0]).toEqual({slug: 'a', name: 'A', color: null, unseenCount: 2, headline: 'Rates hold', datetime: 10});
        expect(open.top[1]).toMatchObject({slug: 'b', headline: 'Chips rally', datetime: 20});
        expect(open.top[2]).toMatchObject({slug: 'c', unseenCount: 0, headline: null, datetime: null});

        const hidden = news({overview: {topics, unseenTotal: 3}, allowed: hiding('CNBC')});
        expect(hidden.top[1]).toEqual({slug: 'b', name: 'B', color: null, unseenCount: 1, headline: null, datetime: null});
    });

    it('keeps the briefing headline as handed over, and never an empty one', () => {
        expect(news({briefing}).briefing).toEqual({headline: 'The day', date: '2026-10-02'});
        expect(news({briefing: null}).briefing).toBeNull();
        expect(news({briefing: {...briefing, headline: ''}}).briefing).toBeNull();
    });

    it('counts the topics with an article newer than the last look at News or at that topic', () => {
        const never = [topic('a', 1, article(4_000)), topic('b', 1, article(6_000)), topic('c', 0, null)];
        expect(news({overview: {topics: never, unseenTotal: 2}}).newTopics).toBe(2);

        const looked = (topics: TopicOverviewItem[], allowed = EVERYTHING) =>
            news({overview: {topics, unseenTotal: 0}, newsSeenAt: 5_000_000, allowed}).newTopics;
        expect(looked([topic('a', 1, article(4_000))])).toBe(0);
        expect(looked([topic('a', 1, article(6_000))])).toBe(1);
        // Opened the topic itself after its newest article: nothing new there.
        expect(looked([topic('a', 1, article(6_000), 7_000_000)])).toBe(0);
        // A hidden outlet never lights the dot.
        expect(looked([topic('a', 1, article(6_000, 'CNBC'))], hiding('CNBC'))).toBe(0);
    });

    it('passes the stamp through', () => {
        expect(news({newsSeenAt: 123}).seenAt).toBe(123);
        expect(news().seenAt).toBeNull();
    });

    it('reads an empty overview as nothing followed', () => {
        expect(news()).toEqual({followed: 0, briefing: null, seenAt: null, newTopics: 0, top: []});
    });
});
