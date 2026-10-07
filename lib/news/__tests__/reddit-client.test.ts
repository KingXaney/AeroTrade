// The Reddit OAuth client: the pure helpers, and the listing fetch over a stubbed fetch —
// one token for many listings, a 401 refreshes it once, and nothing ever throws to a caller.

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    basicAuthHeader,
    fetchRedditListing,
    listingUrl,
    parseListing,
    redditConfigured,
    resetRedditToken,
    tokenIsFresh,
} from "@/lib/news/reddit-client";

const ENV = {REDDIT_CLIENT_ID: 'id-123', REDDIT_CLIENT_SECRET: 'secret-456'};

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

const listing = (titles: string[]) => ({
    data: {
        children: titles.map((title, i) => ({
            data: {title, selftext: '', permalink: `/r/stocks/comments/${i}/x/`, created_utc: 1_700_000_000 + i, score: 100 + i, stickied: false},
        })),
    },
});

describe('redditConfigured', () => {
    it('needs both the id and the secret, and ignores blanks', () => {
        expect(redditConfigured(ENV)).toBe(true);
        expect(redditConfigured({REDDIT_CLIENT_ID: 'id'})).toBe(false);
        expect(redditConfigured({REDDIT_CLIENT_ID: '  ', REDDIT_CLIENT_SECRET: 's'})).toBe(false);
        expect(redditConfigured({})).toBe(false);
    });
});

describe('basicAuthHeader', () => {
    it('is the base64 of id:secret', () => {
        expect(basicAuthHeader('id-123', 'secret-456')).toBe('Basic ' + Buffer.from('id-123:secret-456').toString('base64'));
    });
});

describe('listingUrl', () => {
    it('reads the OAuth host, hot by default, with raw_json on', () => {
        expect(listingUrl('stocks', {limit: 25})).toBe('https://oauth.reddit.com/r/stocks/hot?limit=25&raw_json=1');
        expect(listingUrl('GenZ', {limit: 10, sort: 'new'})).toBe('https://oauth.reddit.com/r/GenZ/new?limit=10&raw_json=1');
    });

    it("bounds the limit to Reddit's own ceiling and encodes the name", () => {
        expect(listingUrl('stocks', {limit: 500})).toContain('limit=100');
        expect(listingUrl('stocks', {limit: 0})).toContain('limit=1');
        expect(listingUrl('stocks', {limit: 7.9})).toContain('limit=7');
        expect(listingUrl('a b', {limit: 5})).toContain('/r/a%20b/');
    });
});

describe('tokenIsFresh', () => {
    it('expires a token a minute early, and never trusts a missing one', () => {
        const now = 1_000_000;
        expect(tokenIsFresh(null, now)).toBe(false);
        expect(tokenIsFresh({token: 't', expiresAt: now + 120_000}, now)).toBe(true);
        expect(tokenIsFresh({token: 't', expiresAt: now + 60_000}, now)).toBe(false);
        expect(tokenIsFresh({token: 't', expiresAt: now - 1}, now)).toBe(false);
    });
});

describe('parseListing', () => {
    it('reads the posts and skips what is not one', () => {
        const parsed = parseListing({
            data: {
                children: [
                    {data: {title: 'A', selftext: 'body', permalink: '/r/x/1/', created_utc: 1, score: 5, stickied: true, subreddit: 'x'}},
                    {data: {title: 'no permalink', created_utc: 1, score: 5}},
                    {data: {title: 'no score', permalink: '/r/x/2/', created_utc: 1}},
                    null,
                    {data: {title: 'B', permalink: '/r/x/3/', created_utc: 2, score: 6}},
                ],
            },
        });
        expect(parsed).toEqual([
            {title: 'A', selftext: 'body', permalink: '/r/x/1/', created_utc: 1, score: 5, stickied: true, subreddit: 'x'},
            {title: 'B', selftext: undefined, permalink: '/r/x/3/', created_utc: 2, score: 6, stickied: false, subreddit: undefined},
        ]);
    });

    it('is empty for anything that is not a listing', () => {
        expect(parseListing(null)).toEqual([]);
        expect(parseListing({})).toEqual([]);
        expect(parseListing({data: {children: 'nope'}})).toEqual([]);
        expect(parseListing('403 page')).toEqual([]);
    });
});

describe('fetchRedditListing', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        resetRedditToken();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('is empty without a configured app, and asks Reddit nothing', async () => {
        expect(await fetchRedditListing('stocks', {limit: 5}, {})).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('takes one token for many listings and sends it as a bearer', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({access_token: 'tok-1', expires_in: 3600}))
            .mockResolvedValueOnce(jsonResponse(listing(['one'])))
            .mockResolvedValueOnce(jsonResponse(listing(['two'])));

        const first = await fetchRedditListing('stocks', {limit: 5}, ENV);
        const second = await fetchRedditListing('wallstreetbets', {limit: 5}, ENV);

        expect(first.map((p) => p.title)).toEqual(['one']);
        expect(second.map((p) => p.title)).toEqual(['two']);
        expect(fetchMock).toHaveBeenCalledTimes(3);

        const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
        expect(tokenUrl).toBe('https://www.reddit.com/api/v1/access_token');
        expect(tokenInit?.method).toBe('POST');
        expect(tokenInit?.body).toBe('grant_type=client_credentials');
        expect((tokenInit?.headers as Record<string, string>).Authorization).toBe(basicAuthHeader('id-123', 'secret-456'));

        const [listUrl, listInit] = fetchMock.mock.calls[1];
        expect(listUrl).toBe('https://oauth.reddit.com/r/stocks/hot?limit=5&raw_json=1');
        expect((listInit?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
        expect((listInit?.headers as Record<string, string>)['User-Agent']).toContain('AeroTrade');
    });

    it('refreshes the token once on a 401 and retries the listing', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({access_token: 'stale', expires_in: 3600}))
            .mockResolvedValueOnce(new Response('', {status: 401}))
            .mockResolvedValueOnce(jsonResponse({access_token: 'fresh', expires_in: 3600}))
            .mockResolvedValueOnce(jsonResponse(listing(['after refresh'])));

        const posts = await fetchRedditListing('stocks', {limit: 5}, ENV);

        expect(posts.map((p) => p.title)).toEqual(['after refresh']);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect((fetchMock.mock.calls[3][1]?.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
    });

    it('is empty, not thrown, when the token is refused or the listing fails', async () => {
        fetchMock.mockResolvedValueOnce(new Response('', {status: 403}));
        expect(await fetchRedditListing('stocks', {limit: 5}, ENV)).toEqual([]);

        fetchMock
            .mockResolvedValueOnce(jsonResponse({access_token: 'tok', expires_in: 3600}))
            .mockResolvedValueOnce(new Response('', {status: 429}));
        expect(await fetchRedditListing('stocks', {limit: 5}, ENV)).toEqual([]);

        fetchMock.mockRejectedValueOnce(new Error('network down'));
        expect(await fetchRedditListing('stocks', {limit: 5}, ENV)).toEqual([]);
    });
});
