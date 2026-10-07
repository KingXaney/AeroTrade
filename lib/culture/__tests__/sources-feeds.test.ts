// The YouTube, Reddit, news and social adapters over fixtures and stubs: what each turns into
// items, what it skips, and that none of them throws.

import {describe, expect, it, vi} from 'vitest';
import {CULTURE_ITEM_BODY_CHARS} from '@/lib/culture/config';
import {CULTURE_SUBREDDITS, fetchCultureReddit, keepPost, toRedditItem} from '@/lib/culture/sources/reddit';
import {categoryQueries, cultureNewsQueries, fetchCultureNews, toNewsItem} from '@/lib/culture/sources/news';
import {resolveSocialAdapter, socialAdapterIds} from '@/lib/culture/sources/social';
import {
    fetchYouTube,
    parseYouTubeVideos,
    toYouTubeItems,
    youtubeChartUrl,
    youtubeConfigured,
    youtubeSearchRotation,
    youtubeSearchesPerDay,
} from '@/lib/culture/sources/youtube';
import {CULTURE_CATEGORIES, type CultureBrand} from '@/lib/culture/types';
import type {MarketNewsArticle} from '@/lib/news/types';
import type {RedditPost} from '@/lib/news/reddit-client';

const chart = (titles: string[]) => ({
    items: titles.map((title, i) => ({
        id: `vid${i}`,
        snippet: {title, description: `about ${title}`, channelTitle: `chan${i}`, publishedAt: '2026-10-05T12:00:00Z'},
        statistics: {viewCount: String(1000 * (i + 1))},
    })),
});

describe('youtube', () => {
    it('is configured by its key and counts searches from the env', () => {
        expect(youtubeConfigured({YOUTUBE_API_KEY: 'k'})).toBe(true);
        expect(youtubeConfigured({})).toBe(false);
        expect(youtubeSearchesPerDay({})).toBe(0);
        expect(youtubeSearchesPerDay({CULTURE_YOUTUBE_SEARCH_PER_DAY: '5'})).toBe(5);
        expect(youtubeSearchesPerDay({CULTURE_YOUTUBE_SEARCH_PER_DAY: 'lots'})).toBe(0);
        expect(youtubeChartUrl('k')).toContain('chart=mostPopular&regionCode=US&maxResults=50&key=k');
    });

    it('parses a chart and a search answer into items with the channel, the views and the link', () => {
        const videos = parseYouTubeVideos(chart(['Trying every energy drink', 'Haul']));
        expect(videos).toHaveLength(2);
        expect(videos[1]).toMatchObject({id: 'vid1', title: 'Haul', channel: 'chan1', views: 2000, position: 2});
        const items = toYouTubeItems(videos);
        expect(items[0]).toEqual({
            source: 'youtube', sourceName: 'chan0', title: 'Trying every energy drink', body: 'about Trying every energy drink',
            url: 'https://www.youtube.com/watch?v=vid0', datetime: Date.parse('2026-10-05T12:00:00Z') / 1000, score: 1000,
        });
        expect(parseYouTubeVideos({items: [{id: {videoId: 'abc'}, snippet: {title: 'from search'}}]})[0].id).toBe('abc');
        expect(parseYouTubeVideos({items: [{snippet: {title: 'no id'}}, null, {id: 'x'}]})).toEqual([]);
        expect(parseYouTubeVideos(null)).toEqual([]);
    });

    it('rotates the searchable brands by the day', () => {
        const brand = (id: string, youtubeQuery?: string): CultureBrand => ({id, name: id, category: 'apps', aliases: [id], owner: null, wikipedia: [id], youtubeQuery});
        const brands = [brand('a', 'a q'), brand('b'), brand('c', 'c q'), brand('d', 'd q')];
        expect(youtubeSearchRotation(brands, 0, 2).map((b) => b.id)).toEqual(['a', 'c']);
        expect(youtubeSearchRotation(brands, 1, 2).map((b) => b.id)).toEqual(['c', 'd']);
        expect(youtubeSearchRotation(brands, 2, 2).map((b) => b.id)).toEqual(['d', 'a']);
        expect(youtubeSearchRotation(brands, 0, 0)).toEqual([]);
        expect(youtubeSearchRotation(brands, 0, 9)).toHaveLength(3);
    });

    it('skips without a key, reads the chart with one, and reports a failed call', async () => {
        expect(await fetchYouTube({env: {}})).toEqual({items: [], ok: true, skipped: true, searches: 0});
        const fetchImpl = (async () => new Response(JSON.stringify(chart(['A'])), {status: 200})) as unknown as typeof fetch;
        const read = await fetchYouTube({env: {YOUTUBE_API_KEY: 'k'}, fetchImpl});
        expect(read.skipped).toBe(false);
        expect(read.items.map((i) => i.title)).toEqual(['A']);
        const failing = (async () => new Response('', {status: 403})) as unknown as typeof fetch;
        expect(await fetchYouTube({env: {YOUTUBE_API_KEY: 'k'}, fetchImpl: failing})).toMatchObject({items: [], ok: false, skipped: false});
    });
});

describe('reddit', () => {
    const post = (over: Partial<RedditPost> = {}): RedditPost =>
        ({title: 'Switched from Prime to Celsius', selftext: 'honestly <b>better</b>  taste', permalink: '/r/energydrinks/comments/1/x/', created_utc: 1_700_000_000.7, score: 80, stickied: false, ...over});

    it('lists twenty youth subreddits with their own thresholds', () => {
        expect(CULTURE_SUBREDDITS.length).toBeGreaterThanOrEqual(15);
        expect(CULTURE_SUBREDDITS.map((s) => s.name)).toContain('GenZ');
        for (const sub of CULTURE_SUBREDDITS) expect(sub.minScore).toBeGreaterThan(0);
    });

    it('turns a post into an item with the markup stripped and the body bounded', () => {
        const item = toRedditItem(post({selftext: 'x'.repeat(5000)}), 'energydrinks');
        expect(item).toMatchObject({source: 'reddit', sourceName: 'r/energydrinks', title: 'Switched from Prime to Celsius', datetime: 1_700_000_000, score: 80});
        expect(item.url).toBe('https://www.reddit.com/r/energydrinks/comments/1/x/');
        expect(item.body).toHaveLength(CULTURE_ITEM_BODY_CHARS);
        expect(toRedditItem(post(), 'x').body).toBe('honestly better taste');
    });

    it('keeps a post above the threshold that is not stickied', () => {
        expect(keepPost(post(), 30)).toBe(true);
        expect(keepPost(post({score: 10}), 30)).toBe(false);
        expect(keepPost(post({stickied: true}), 30)).toBe(false);
        expect(keepPost(post({title: '  '}), 30)).toBe(false);
    });

    it('skips without the app, and otherwise reads every subreddit through the shared client', async () => {
        expect((await fetchCultureReddit({env: {}})).skipped).toBe(true);
        const fetchListing = vi.fn(async (name: string) => (name === 'GenZ' ? [post(), post({score: 1})] : []));
        const result = await fetchCultureReddit({
            env: {REDDIT_CLIENT_ID: 'a', REDDIT_CLIENT_SECRET: 'b'},
            fetchListing: fetchListing as unknown as typeof import('@/lib/news/reddit-client').fetchRedditListing,
            subreddits: [{name: 'GenZ', minScore: 50}, {name: 'snacks', minScore: 30}],
        });
        expect(result).toMatchObject({skipped: false, subreddits: 2, empty: 1});
        expect(result.items).toHaveLength(1);
        expect(fetchListing).toHaveBeenCalledTimes(2);
    });
});

describe('news', () => {
    it('builds one bounded query per angle and per category, each with the day window', () => {
        const queries = cultureNewsQueries();
        expect(queries.length).toBe(8 + CULTURE_CATEGORIES.length);
        for (const query of queries) {
            expect(query.length).toBeLessThanOrEqual(200);
            expect(query).toMatch(/ when:1d$/);
        }
        expect(categoryQueries().map((q) => q.name)).toEqual([...CULTURE_CATEGORIES]);
    });

    it('turns an article into an item from its outlet, its full text and its link', () => {
        const article: MarketNewsArticle = {id: 1, headline: 'Teens pick Hoka', summary: 'short...', fullSummary: 'the  full text', source: 'Outlet', url: 'https://x.test/a', datetime: 5, category: 'general', related: ''};
        expect(toNewsItem(article)).toEqual({source: 'news', sourceName: 'Outlet', title: 'Teens pick Hoka', body: 'the full text', url: 'https://x.test/a', datetime: 5});
    });

    it('skips under the kill switch, dedupes across queries, and survives a failed query', async () => {
        expect(await fetchCultureNews(['a'], {enabled: () => false})).toMatchObject({items: [], skipped: true});
        const article = (headline: string, url: string): MarketNewsArticle => ({id: 1, headline, summary: headline, source: 'O', url, datetime: 1, category: 'g', related: ''});
        const fetchQuery = vi.fn(async (query: string) => {
            if (query === 'bad') throw new Error('blocked');
            return [article('One', 'https://x.test/1'), article('Two', 'https://x.test/2')];
        });
        const result = await fetchCultureNews(['good', 'bad', 'good again'], {fetchQuery: fetchQuery as unknown as typeof import('@/lib/news/adapters/search').fetchNewsForQuery, enabled: () => true});
        expect(result.ok).toBe(false);
        expect(result.items.map((i) => i.title)).toEqual(['One', 'Two']);
    });
});

describe('social slot', () => {
    it('is empty in v1 and resolves nothing without a named adapter', () => {
        expect(socialAdapterIds()).toEqual([]);
        expect(resolveSocialAdapter({})).toBeNull();
        expect(resolveSocialAdapter({CULTURE_SOCIAL_ADAPTER: 'nope'})).toBeNull();
    });
});
