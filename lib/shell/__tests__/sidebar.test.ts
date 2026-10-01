import {describe, expect, it} from 'vitest';
import {toSidebarPortfolio, toSidebarTopics} from '@/lib/shell/sidebar';
import type {EnrichedPosition, PortfolioSummary} from '@/lib/trading/types';
import type {TopicOverviewItem} from '@/lib/topics/types';

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

describe('toSidebarTopics', () => {
    const topic = (slug: string, unseenCount: number, latest: number | null): TopicOverviewItem => ({
        id: slug, name: slug.toUpperCase(), slug, keywords: [slug], exclude: [], color: null, keywordSetHash: 1,
        createdAt: 0, lastFetchedAt: null, lastSeenAt: null, refreshRequestedAt: null, brief: null,
        unseenCount, articleCount: unseenCount,
        latest: latest === null ? null : {contentHash: 1, headline: '', summary: '', url: '', source: '', sourceType: 'rss', datetime: latest, score: 0, matchedTerms: []},
    });

    it('lists the most unread first, the freshest first among equals, three at most', () => {
        const card = toSidebarTopics({
            topics: [topic('a', 1, 10), topic('b', 4, null), topic('c', 1, 20), topic('d', 0, 30)],
            unseenTotal: 6,
        });
        expect(card.followed).toBe(4);
        expect(card.unseen).toBe(6);
        expect(card.top.map((t) => t.slug)).toEqual(['b', 'c', 'a']);
    });

    it('reads an empty overview as nothing followed', () => {
        expect(toSidebarTopics({topics: [], unseenTotal: 0})).toEqual({followed: 0, unseen: 0, top: []});
    });
});
