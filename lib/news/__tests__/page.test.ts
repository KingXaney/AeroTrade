import {describe, expect, it} from 'vitest';
import {
    filterBriefing,
    NEWS_LEAD_STORIES,
    NEWS_TOPIC_ARTICLES,
    NEWS_TOPICS_SHOWN,
    toNewsPageView,
    type NewsHoldingArticle,
} from '@/lib/news/page';
import type {MarketBriefingView} from '@/lib/news/briefing';
import type {MarketNewsArticle} from '@/lib/news/types';
import type {MergedTopicArticle, TopicOverviewItem, TopicsOverview} from '@/lib/topics/types';

const NO_FILTER = {includeSources: [], excludeSources: []};

const feedArticle = (n: number, source = 'Reuters'): MarketNewsArticle => ({
    id: n, headline: `Feed ${n}`, summary: '', source, url: `https://news.example/f/${n}`, datetime: 1000 + n, category: 'general', related: '',
});

const topic = (slug: string, over: Partial<TopicOverviewItem> = {}): TopicOverviewItem => ({
    id: slug, name: slug.toUpperCase(), slug, keywords: [slug], exclude: [], color: null, keywordSetHash: slug.length,
    createdAt: 0, lastFetchedAt: null, lastSeenAt: null, refreshRequestedAt: null, brief: null,
    unseenCount: 0, articleCount: 0, latest: null,
    ...over,
} as TopicOverviewItem);

const topicArticle = (slug: string, n: number, source = 'CNBC'): MergedTopicArticle => ({
    contentHash: n, headline: `${slug} ${n}`, summary: '', url: `https://news.example/t/${slug}/${n}`, source, sourceType: 'web',
    datetime: 2000 + n, score: 1, matchedTerms: [], topicId: slug, topicName: slug.toUpperCase(), topicSlug: slug, topicColor: null,
});

const holding = (n: number, source = 'Bloomberg'): NewsHoldingArticle => ({
    headline: `Holding ${n}`, source, url: `https://news.example/h/${n}`, datetime: 3000 + n, eventType: 'earnings', symbols: ['AAPL'],
});

const source = (name: string, n: number) => ({headline: `Cited ${n}`, source: name, url: `https://news.example/b/${n}`, datetime: n});
const briefing: MarketBriefingView = {
    date: '2026-10-02',
    generatedAt: 0,
    headline: 'The day',
    bullets: [
        {text: 'From two outlets.', sources: [source('Reuters', 1), source('CNBC', 2)]},
        {text: 'From one outlet.', sources: [source('CNBC', 3)]},
    ],
    stories: [{title: 'A story', summary: 'About it.', eventType: 'macro', tickers: ['AAPL', 'XOM'], sources: [source('CNBC', 4)]}],
};

const overview = (topics: TopicOverviewItem[]): TopicsOverview => ({topics, unseenTotal: 0});
const view = (over: Partial<Parameters<typeof toNewsPageView>[0]> = {}) => toNewsPageView({
    briefing: null, prefs: NO_FILTER, overview: overview([]), topicArticles: [], holdings: [], feed: [], fallback: false, symbols: [],
    ...over,
});

describe('filterBriefing', () => {
    it('hands the briefing back whole when no outlet is filtered', () => {
        expect(filterBriefing(briefing, NO_FILTER)).toEqual(briefing);
        expect(filterBriefing(null, NO_FILTER)).toBeNull();
    });

    it('removes a hidden outlet from every citation, and a point it leaves citing nothing', () => {
        const kept = filterBriefing(briefing, {includeSources: [], excludeSources: ['CNBC']});
        expect(kept?.bullets.map((b) => b.text)).toEqual(['From two outlets.']);
        expect(kept?.bullets[0].sources.map((s) => s.source)).toEqual(['Reuters']);
        expect(kept?.stories).toEqual([]);
    });

    it('is nothing at all when no point survives', () => {
        expect(filterBriefing(briefing, {includeSources: ['Financial Times'], excludeSources: []})).toBeNull();
    });
});

describe('toNewsPageView', () => {
    it('leads with a few stories and keeps the rest behind', () => {
        const feed = Array.from({length: 20}, (_, i) => feedArticle(i));
        const v = view({feed});
        expect(v.lead).toHaveLength(NEWS_LEAD_STORIES);
        expect(v.more).toHaveLength(20 - NEWS_LEAD_STORIES);
        expect(v.lead[0].headline).toBe('Feed 0');
    });

    it('gives each followed topic its newest stories, unread topics first', () => {
        const v = view({
            overview: overview([topic('quiet'), topic('busy', {unseenCount: 3})]),
            topicArticles: [topicArticle('quiet', 1), topicArticle('busy', 1), topicArticle('busy', 2), topicArticle('busy', 3)],
        });
        expect(v.topics.map((t) => t.slug)).toEqual(['busy', 'quiet']);
        expect(v.topics[0].articles).toHaveLength(NEWS_TOPIC_ARTICLES);
        expect(v.topics[0].articles[0].topic?.slug).toBe('busy');
    });

    it('leaves out a topic with neither a brief nor an article, and counts the ones it has no room for', () => {
        const slugs = ['a', 'b', 'c', 'd', 'e', 'f'];
        const v = view({
            overview: overview([...slugs.map((s) => topic(s)), topic('empty')]),
            topicArticles: slugs.map((s) => topicArticle(s, 1)),
        });
        expect(v.topics).toHaveLength(NEWS_TOPICS_SHOWN);
        expect(v.moreTopics).toBe(slugs.length - NEWS_TOPICS_SHOWN);
        expect(v.topics.map((t) => t.slug)).not.toContain('empty');
    });

    it('keeps a topic that has a brief but nothing new', () => {
        const brief = {summary: 'What changed.', bullets: [], date: '2026-10-02', generatedAt: 0};
        const v = view({overview: overview([topic('fed', {brief} as Partial<TopicOverviewItem>)])});
        expect(v.topics.map((t) => [t.slug, t.brief?.summary, t.articles.length])).toEqual([['fed', 'What changed.', 0]]);
    });

    it('prints a story once: a topic article is not repeated under holdings or top stories', () => {
        const shared = 'https://news.example/shared';
        const v = view({
            overview: overview([topic('fed')]),
            topicArticles: [{...topicArticle('fed', 1), url: shared}],
            holdings: [{...holding(1), url: `${shared}?oc=5`}, holding(2)],
            feed: [{...feedArticle(1), url: `${shared}/`}, feedArticle(2)],
        });
        expect(v.topics[0].articles.map((a) => a.url)).toEqual([shared]);
        expect(v.holdings.map((h) => h.headline)).toEqual(['Holding 2']);
        expect(v.lead.map((a) => a.headline)).toEqual(['Feed 2']);
    });

    it('hides a hidden outlet in every section, whichever door it used', () => {
        const prefs = {includeSources: [], excludeSources: ['cnbc']};
        const v = view({
            prefs,
            briefing,
            overview: overview([topic('fed')]),
            topicArticles: [topicArticle('fed', 1, 'CNBC'), topicArticle('fed', 2, 'Reuters')],
            holdings: [holding(1, 'CNBC'), holding(2, 'Bloomberg')],
            feed: [feedArticle(1, 'Reuters')],
        });
        const outlets = [
            ...(v.briefing?.bullets.flatMap((b) => b.sources.map((s) => s.source)) ?? []),
            ...v.topics.flatMap((t) => t.articles.map((a) => a.source)),
            ...v.holdings.map((h) => h.source),
            ...v.lead.map((a) => a.source),
        ];
        expect(outlets).not.toContain('CNBC');
        expect(outlets).toEqual(['Reuters', 'Reuters', 'Bloomberg', 'Reuters']);
    });

    it("says which of the reader's symbols the briefing touches", () => {
        expect(view({briefing, symbols: ['aapl', 'TSLA']}).briefing?.touches).toEqual(['AAPL']);
        expect(view({briefing, symbols: []}).briefing?.touches).toEqual([]);
        expect(view({briefing: null, symbols: ['AAPL']}).briefing).toBeNull();
    });

    it('carries the outage flag and is empty when there is nothing', () => {
        expect(view({fallback: true}).fallback).toBe(true);
        expect(view()).toEqual({briefing: null, topics: [], moreTopics: 0, holdings: [], lead: [], more: [], fallback: false});
    });
});
