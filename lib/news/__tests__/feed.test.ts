// The personal news feed's pure core. Two things matter: a stored or posted preference
// can never produce an unusable feed, and the merge gives every chosen feed a fair share
// without ever letting a URL built from user text escape Google News.

import {describe, expect, it} from 'vitest';
import {
    DEFAULT_NEWS_FEED,
    MAX_FEED_CATEGORIES,
    MAX_FEED_KEYWORDS,
    MAX_FEED_OUTLETS,
    MAX_FEED_REGIONS,
    NEWS_CATEGORIES,
    NEWS_REGIONS,
    NewsFeedSchema,
    defaultNewsFeed,
    describeNewsFeed,
    feedRequestsFor,
    feedUrlKey,
    filterBySources,
    isDefaultNewsFeed,
    mergeFeed,
    newsFeedEqual,
    normalizeNewsFeed,
    outletKey,
    pickDigestArticles,
    planFeedSlots,
    type NewsFeedPrefs,
} from '@/lib/news/feed';
import {FEED_DIGEST_CAP, GOOGLE_NEWS_BASE, MAX_FEED_REQUESTS, RSS_FEEDS, TOTAL_ARTICLE_CAP, yahooSymbolFeed} from '@/lib/news/config';

const NOW = 1_800_000_000;

const article = (over: Partial<MarketNewsArticle> = {}): MarketNewsArticle => ({
    id: 1,
    headline: 'Headline',
    summary: 'Headline',
    source: 'Reuters',
    url: 'https://news.google.com/rss/articles/CBMiAAA?oc=5',
    datetime: NOW - 60,
    category: 'general',
    related: '',
    sourceType: 'web',
    ...over,
});

const prefs = (over: Partial<NewsFeedPrefs> = {}): NewsFeedPrefs => ({...defaultNewsFeed(), ...over});

describe('normalizeNewsFeed', () => {
    it('turns garbage into a fresh default', () => {
        expect(normalizeNewsFeed(undefined)).toEqual(DEFAULT_NEWS_FEED);
        expect(normalizeNewsFeed('nope')).toEqual(DEFAULT_NEWS_FEED);
        expect(normalizeNewsFeed(null)).not.toBe(DEFAULT_NEWS_FEED);
        expect(normalizeNewsFeed({})).toEqual(DEFAULT_NEWS_FEED);
    });

    it('drops unknown ids and re-sorts the rest into canonical order', () => {
        const out = normalizeNewsFeed({categories: ['world', 'bogus', 'top', 42, 'world'], regions: ['GB', 'XX', 'US']});
        expect(out.categories).toEqual(['top', 'world']);
        expect(out.regions).toEqual(['US', 'GB']);
    });

    it('caps every list', () => {
        const out = normalizeNewsFeed({
            categories: NEWS_CATEGORIES.map((c) => c.id),
            regions: NEWS_REGIONS.map((r) => r.id),
            includeSources: Array.from({length: 40}, (_, i) => `Outlet ${i}`),
            excludeSources: Array.from({length: 40}, (_, i) => `Hidden ${i}`),
            keywords: Array.from({length: 20}, (_, i) => `term${i}`),
        });
        expect(out.categories).toHaveLength(MAX_FEED_CATEGORIES);
        expect(out.regions).toHaveLength(MAX_FEED_REGIONS);
        expect(out.includeSources).toHaveLength(MAX_FEED_OUTLETS);
        expect(out.excludeSources).toHaveLength(MAX_FEED_OUTLETS);
        expect(out.keywords).toHaveLength(MAX_FEED_KEYWORDS);
    });

    it('normalises keywords like topics do: lowercase, trimmed, deduped, sorted', () => {
        expect(normalizeNewsFeed({keywords: [' Fed  Rate ', 'fed rate', 'AI', 'x', 'Climate']}).keywords).toEqual(['ai', 'climate', 'fed rate']);
    });

    it('dedupes outlets by identity and keeps the first spelling', () => {
        const out = normalizeNewsFeed({includeSources: ['The Guardian', 'theguardian.com', 'Guardian', '  Reuters  ', 'reuters.com']});
        expect(out.includeSources).toEqual(['The Guardian', 'Reuters']);
    });

    it('lets include win when an outlet is in both lists', () => {
        const out = normalizeNewsFeed({includeSources: ['Reuters'], excludeSources: ['reuters.com', 'BBC']});
        expect(out.excludeSources).toEqual(['BBC']);
    });

    it('never produces an empty feed', () => {
        expect(normalizeNewsFeed({categories: [], regions: []})).toEqual(DEFAULT_NEWS_FEED);
        expect(normalizeNewsFeed({categories: [], keywords: ['climate']}).categories).toEqual([]);
        expect(normalizeNewsFeed({categories: [], includeWatchlist: true}).categories).toEqual([]);
        expect(normalizeNewsFeed({categories: ['world'], regions: ['bogus']}).regions).toEqual(['US']);
    });

    it('coerces includeWatchlist to a real boolean', () => {
        expect(normalizeNewsFeed({includeWatchlist: 'true'}).includeWatchlist).toBe(false);
        expect(normalizeNewsFeed({includeWatchlist: 1}).includeWatchlist).toBe(false);
        expect(normalizeNewsFeed({includeWatchlist: true}).includeWatchlist).toBe(true);
    });
});

describe('NewsFeedSchema', () => {
    it('rejects shapes that cannot be meant and strips unknown keys', () => {
        expect(NewsFeedSchema.safeParse({categories: 'top'}).success).toBe(false);
        expect(NewsFeedSchema.safeParse({keywords: Array.from({length: 33}, () => 'x')}).success).toBe(false);
        expect(NewsFeedSchema.safeParse({includeSources: ['x'.repeat(61)]}).success).toBe(false);
        const parsed = NewsFeedSchema.safeParse({categories: ['top'], userId: 'someone-else'});
        expect(parsed.success).toBe(true);
        expect(parsed.success && 'userId' in parsed.data).toBe(false);
    });

    it('fills in every list so a partial payload is still a whole preference', () => {
        const parsed = NewsFeedSchema.parse({});
        expect(parsed).toEqual({categories: [], regions: [], includeSources: [], excludeSources: [], keywords: [], includeWatchlist: false});
    });
});

describe('isDefaultNewsFeed / newsFeedEqual', () => {
    it('recognises fresh copies of the default', () => {
        expect(isDefaultNewsFeed(defaultNewsFeed())).toBe(true);
        expect(isDefaultNewsFeed(normalizeNewsFeed({regions: ['US']}))).toBe(true);
    });

    it('sees every field', () => {
        expect(isDefaultNewsFeed(prefs({categories: ['top', 'world']}))).toBe(false);
        expect(isDefaultNewsFeed(prefs({regions: ['GB']}))).toBe(false);
        expect(isDefaultNewsFeed(prefs({includeSources: ['BBC']}))).toBe(false);
        expect(isDefaultNewsFeed(prefs({excludeSources: ['BBC']}))).toBe(false);
        expect(isDefaultNewsFeed(prefs({keywords: ['ai']}))).toBe(false);
        expect(isDefaultNewsFeed(prefs({includeWatchlist: true}))).toBe(false);
    });

    it('ignores order and outlet spelling', () => {
        expect(newsFeedEqual(prefs({categories: ['world', 'top'], includeSources: ['reuters.com']}), prefs({categories: ['top', 'world'], includeSources: ['Reuters']}))).toBe(true);
        expect(newsFeedEqual(prefs({includeSources: ['Reuters']}), prefs({includeSources: ['BBC']}))).toBe(false);
    });
});

describe('describeNewsFeed', () => {
    it('reads as one line', () => {
        expect(describeNewsFeed(defaultNewsFeed())).toBe('Top stories · US');
        expect(describeNewsFeed(prefs({
            categories: ['top', 'world', 'business'], regions: ['US', 'GB'], keywords: ['ai', 'rates'],
            excludeSources: ['Fox'], includeWatchlist: true,
        }))).toBe('Top stories, World & Business · US, GB · 2 keywords · 1 outlet hidden · + watchlist');
        expect(describeNewsFeed(prefs({categories: [], keywords: ['ai'], includeSources: ['BBC', 'NPR']}))).toBe('Your keywords · US · only 2 outlets');
        expect(describeNewsFeed(prefs({categories: ['top', 'world']}))).toBe('Top stories & World · US');
    });
});

describe('planFeedSlots', () => {
    it('is one front-page request by default', () => {
        expect(planFeedSlots(defaultNewsFeed())).toEqual({slots: [{kind: 'top', region: 'US'}], dropped: 0});
    });

    it('puts keywords first, then categories by region, then markets and the watchlist', () => {
        const {slots, dropped} = planFeedSlots(prefs({categories: ['top', 'world', 'markets'], regions: ['US', 'GB'], keywords: ['ai'], includeWatchlist: true}));
        expect(slots).toEqual([
            {kind: 'search'},
            {kind: 'top', region: 'US'}, {kind: 'top', region: 'GB'},
            {kind: 'section', category: 'world', region: 'US'}, {kind: 'section', category: 'world', region: 'GB'},
            {kind: 'markets'},
            {kind: 'watchlist'},
        ]);
        expect(dropped).toBe(0);
    });

    it('truncates to the request budget and reports what fell off', () => {
        const {slots, dropped} = planFeedSlots(prefs({categories: ['top', 'world', 'business', 'technology', 'science', 'health'], regions: ['US', 'GB', 'CA', 'AU']}));
        expect(slots).toHaveLength(MAX_FEED_REQUESTS);
        expect(dropped).toBe(6 * 4 - MAX_FEED_REQUESTS);
        expect(slots[0]).toEqual({kind: 'top', region: 'US'});
    });
});

describe('feedRequestsFor', () => {
    it('builds the exact Google News URLs', () => {
        const [top] = feedRequestsFor(defaultNewsFeed());
        expect(top).toMatchObject({kind: 'top', region: 'US', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', keepFeedOrder: true});
        const requests = feedRequestsFor(prefs({categories: ['world'], regions: ['GB'], keywords: ['fed rate', 'fomc']}));
        expect(requests.map((r) => r.kind)).toEqual(['search', 'section']);
        expect(requests[0].url).toBe('https://news.google.com/rss/search?q=(%22fed%20rate%22%20OR%20fomc)&hl=en-GB&gl=GB&ceid=GB:en');
        expect(requests[0].keepFeedOrder).toBe(false);
        expect(requests[1].url).toBe('https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-GB&gl=GB&ceid=GB:en');
        expect(requests[1].label).toBe('World · GB');
    });

    it('never lets user text out of the query parameter, and never leaves Google News', () => {
        const requests = feedRequestsFor(prefs({keywords: ['evil&hl=xx', 'site:example.com', '../../etc']}));
        for (const r of requests) {
            expect(r.url?.startsWith(GOOGLE_NEWS_BASE)).toBe(true);
            expect(new URL(r.url as string).searchParams.get('hl')).toBe('en-US');
        }
        expect(requests[0].url).not.toContain('example.com&');
    });

    it('marks the non-Google slots with a null URL', () => {
        const requests = feedRequestsFor(prefs({categories: ['markets'], includeWatchlist: true}));
        expect(requests).toEqual([
            {kind: 'markets', url: null, label: 'Markets', keepFeedOrder: false},
            {kind: 'watchlist', url: null, label: 'Your watchlist', keepFeedOrder: false},
        ]);
    });
});

describe('outletKey', () => {
    it('treats names, domains and URLs of one outlet as one', () => {
        expect(outletKey('reuters.com')).toBe(outletKey('Reuters'));
        expect(outletKey('https://www.reuters.com/')).toBe(outletKey('REUTERS'));
        expect(outletKey('theguardian.com')).toBe(outletKey('The Guardian'));
        expect(outletKey('Guardian')).toBe(outletKey('The Guardian'));
        expect(outletKey('apnews.com')).toBe(outletKey('AP News'));
        expect(outletKey('bbc.co.uk')).toBe(outletKey('BBC'));
        expect(outletKey('The New York Times')).toBe('newyorktimes');
    });

    it('does not pretend abbreviations match full names', () => {
        expect(outletKey('latimes.com')).not.toBe(outletKey('Los Angeles Times'));
    });
});

describe('filterBySources', () => {
    const list = [article({source: 'Reuters'}), article({source: 'BBC News', url: 'https://x/b'}), article({source: 'bbc.co.uk', url: 'https://x/c'})];

    it('hands back the same array when there is nothing to do', () => {
        expect(filterBySources(list, {includeSources: [], excludeSources: []})).toBe(list);
    });

    it('narrows to preferred outlets, case-insensitively', () => {
        expect(filterBySources(list, {includeSources: ['reuters'], excludeSources: []}).map((a) => a.source)).toEqual(['Reuters']);
    });

    it('hides outlets by identity, so a domain hides the named outlet', () => {
        expect(filterBySources(list, {includeSources: [], excludeSources: ['BBC']}).map((a) => a.source)).toEqual(['Reuters', 'BBC News']);
        expect(filterBySources(list, {includeSources: [], excludeSources: ['bbc.co.uk']}).map((a) => a.source)).toEqual(['Reuters', 'BBC News']);
    });

    it('hides the markets wires by the same outlet name the chips use', () => {
        // The RSS adapter stamps articles with feed.outlet, not the feed title
        // ("CNBC Top News"), so "hide CNBC" reaches the CNBC wire too.
        const wires = RSS_FEEDS.map((f) => article({source: f.outlet, url: `https://x/${f.outlet}`}));
        expect(filterBySources(wires, {includeSources: [], excludeSources: ['CNBC', 'MarketWatch']}).map((a) => a.source)).toEqual(['Yahoo Finance']);
        expect(yahooSymbolFeed('aapl').outlet).toBe('Yahoo Finance');
    });

    it('applies both: include narrows, then hide removes', () => {
        expect(filterBySources(list, {includeSources: ['Reuters', 'BBC News'], excludeSources: ['BBC News']}).map((a) => a.source)).toEqual(['Reuters']);
    });
});

describe('mergeFeed', () => {
    const batch = (kind: 'top' | 'section' | 'search', prefix: string, n: number, over: Partial<MarketNewsArticle> = {}) => ({
        kind,
        articles: Array.from({length: n}, (_, i) => article({headline: `${prefix} ${i}`, url: `https://news.google.com/rss/articles/${prefix}${i}?oc=5`, datetime: NOW - i, ...over})),
    });

    it('round-robins across batches in priority order and keeps each batch\'s own order', () => {
        const out = mergeFeed([batch('search', 'S', 2), batch('top', 'T', 3), batch('section', 'W', 3)], {limit: 8, now: NOW});
        expect(out.map((a) => a.headline)).toEqual(['S 0', 'T 0', 'W 0', 'S 1', 'T 1', 'W 1', 'T 2', 'W 2']);
    });

    it('stops at the limit and skips empty batches', () => {
        const out = mergeFeed([batch('search', 'S', 0), batch('top', 'T', 5)], {limit: 3, now: NOW});
        expect(out.map((a) => a.headline)).toEqual(['T 0', 'T 1', 'T 2']);
    });

    it('gives a huge batch no more than its rotation share while others still have items', () => {
        const out = mergeFeed([batch('top', 'T', 70), batch('section', 'W', 4)], {limit: 8, now: NOW});
        expect(out.filter((a) => a.headline.startsWith('T'))).toHaveLength(4);
        expect(out.filter((a) => a.headline.startsWith('W'))).toHaveLength(4);
    });

    it('dedupes the same story across feeds by URL and by headline', () => {
        const sameUrl = article({headline: 'Different words', url: 'https://news.google.com/rss/articles/T0?oc=5'});
        const sameHeadline = article({headline: 'T 0!', url: 'https://news.google.com/rss/articles/OTHER?oc=5'});
        const out = mergeFeed([batch('top', 'T', 1), {kind: 'section', articles: [sameUrl, sameHeadline]}], {limit: 8, now: NOW});
        expect(out).toHaveLength(1);
    });

    it('keeps Google\'s case-sensitive ids apart while ignoring the query string', () => {
        expect(feedUrlKey('https://news.google.com/rss/articles/CBMiAAA?oc=5')).toBe('https://news.google.com/rss/articles/CBMiAAA');
        const a = article({headline: 'One', url: 'https://news.google.com/rss/articles/abc?oc=5'});
        const b = article({headline: 'Two', url: 'https://news.google.com/rss/articles/ABC?oc=5'});
        expect(mergeFeed([{kind: 'top', articles: [a, b]}], {limit: 8, now: NOW})).toHaveLength(2);
    });

    it('drops stale items using the injected clock', () => {
        const fresh = article({headline: 'fresh', datetime: NOW - 3600});
        const stale = article({headline: 'stale', url: 'https://news.google.com/rss/articles/OLD?oc=5', datetime: NOW - 4 * 86400});
        expect(mergeFeed([{kind: 'top', articles: [stale, fresh]}], {limit: 8, now: NOW}).map((a) => a.headline)).toEqual(['fresh']);
    });

    it('gives every article a unique id', () => {
        const out = mergeFeed([batch('top', 'T', 3), batch('section', 'W', 3)], {limit: 6, now: NOW});
        expect(new Set(out.map((a) => a.id)).size).toBe(6);
    });
});

describe('pickDigestArticles', () => {
    const market = (n: number) => Array.from({length: n}, (_, i) => article({headline: `Market ${i}`, url: `https://cnbc.com/${i}`, sourceType: 'finance'}));
    const feed = Array.from({length: 10}, (_, i) => article({headline: `World ${i}`, url: `https://news.google.com/rss/articles/F${i}?oc=5`}));
    const isFeed = (a: MarketNewsArticle) => a.sourceType === 'web';

    it('appends at most FEED_DIGEST_CAP feed stories after a small market pool', () => {
        const out = pickDigestArticles(market(4), feed);
        expect(out).toHaveLength(4 + FEED_DIGEST_CAP);
        expect(out.slice(0, 4).map((a) => a.headline)).toEqual(market(4).map((a) => a.headline));
        expect(out.slice(4).map((a) => a.headline)).toEqual(feed.slice(0, FEED_DIGEST_CAP).map((a) => a.headline));
    });

    it("reserves the feed's slots when the market pool already fills the total cap", () => {
        // getAggregatedNews returns exactly TOTAL_ARTICLE_CAP when every wire is healthy —
        // the normal case. Appending and re-slicing would drop every feed story.
        const out = pickDigestArticles(market(TOTAL_ARTICLE_CAP), feed);
        expect(out).toHaveLength(TOTAL_ARTICLE_CAP);
        expect(out.filter(isFeed)).toHaveLength(FEED_DIGEST_CAP);
        expect(out.slice(0, TOTAL_ARTICLE_CAP - FEED_DIGEST_CAP).map((a) => a.headline))
            .toEqual(market(TOTAL_ARTICLE_CAP - FEED_DIGEST_CAP).map((a) => a.headline));
        expect(out.slice(-FEED_DIGEST_CAP).every(isFeed)).toBe(true);
    });

    it('leaves a full pool untouched when the feed is empty or failed', () => {
        expect(pickDigestArticles(market(TOTAL_ARTICLE_CAP), []).map((a) => a.headline)).toEqual(market(TOTAL_ARTICLE_CAP).map((a) => a.headline));
    });

    it('does not let a story the pool already has cost a market slot', () => {
        const dup = [article({headline: 'Market 0', url: 'https://elsewhere/0'}), ...feed.slice(0, 1)];
        const out = pickDigestArticles(market(TOTAL_ARTICLE_CAP), dup);
        expect(out).toHaveLength(TOTAL_ARTICLE_CAP);
        expect(out.filter(isFeed)).toHaveLength(1);
        expect(out.filter((a) => a.headline === 'Market 0')).toHaveLength(1);
    });
});
