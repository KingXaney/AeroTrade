// The one way the app reads Reddit. Reddit stopped answering keyless `.json` listings in May
// 2026 (403 on every request), so every listing now goes through an OAuth "script" app:
// REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET from https://www.reddit.com/prefs/apps, exchanged for
// an application-only bearer token (client_credentials) that this module caches for its lifetime
// and refreshes once on a 401. Shared by the news digest's finance subreddits
// (lib/news/adapters/reddit.ts) and the culture brain's youth subreddits, so both read Reddit
// with one app and one allowance (100 requests a minute per client id).
//
// Nothing here throws to a caller: an unconfigured app, a refused token or a failed listing all
// come back as an empty list with one logged line, so a Reddit outage never costs a run its
// other sources. The helpers above `fetchRedditListing` are pure and unit-tested.

import {redditUserAgent} from "@/lib/news/config";

export type RedditPost = {
    title: string;
    selftext?: string;
    permalink: string;
    created_utc: number;
    score: number;
    stickied?: boolean;
    subreddit?: string;
};

export type RedditSort = 'hot' | 'new' | 'top';

export type RedditListingOptions = {limit: number; sort?: RedditSort};

export type RedditTokenCache = {token: string; expiresAt: number};

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_BASE = 'https://oauth.reddit.com';
// A token is treated as expired this long before Reddit says so, so a request never leaves
// with a token that expires in flight.
const TOKEN_SAFETY_MS = 60_000;
// Reddit's own ceiling on a listing; a bigger ask is silently cut there anyway.
const LISTING_LIMIT_MAX = 100;
const DEFAULT_TOKEN_SECONDS = 3600;

type RedditEnv = Readonly<Record<string, string | undefined>>;

export const redditConfigured = (env: RedditEnv = process.env): boolean =>
    Boolean(env.REDDIT_CLIENT_ID?.trim() && env.REDDIT_CLIENT_SECRET?.trim());

export const basicAuthHeader = (clientId: string, clientSecret: string): string =>
    'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

export const listingUrl = (subreddit: string, {limit, sort = 'hot'}: RedditListingOptions): string => {
    const bounded = Math.max(1, Math.min(LISTING_LIMIT_MAX, Math.floor(limit)));
    return `${OAUTH_BASE}/r/${encodeURIComponent(subreddit)}/${sort}?limit=${bounded}&raw_json=1`;
};

export const tokenIsFresh = (cache: RedditTokenCache | null, nowMs: number): boolean =>
    cache !== null && cache.expiresAt - TOKEN_SAFETY_MS > nowMs;

// A listing's posts, tolerant of the shape Reddit may not keep: a missing `data`, a missing
// `children`, or a child without the fields a post needs is skipped, never thrown on.
export const parseListing = (json: unknown): RedditPost[] => {
    const children = (json as {data?: {children?: unknown[]}} | null)?.data?.children;
    if (!Array.isArray(children)) return [];
    const posts: RedditPost[] = [];
    for (const child of children) {
        const data = (child as {data?: Record<string, unknown>} | null)?.data;
        if (!data || typeof data.title !== 'string' || typeof data.permalink !== 'string') continue;
        if (typeof data.created_utc !== 'number' || typeof data.score !== 'number') continue;
        posts.push({
            title: data.title,
            selftext: typeof data.selftext === 'string' ? data.selftext : undefined,
            permalink: data.permalink,
            created_utc: data.created_utc,
            score: data.score,
            stickied: data.stickied === true,
            subreddit: typeof data.subreddit === 'string' ? data.subreddit : undefined,
        });
    }
    return posts;
};

let tokenCache: RedditTokenCache | null = null;

// Test seam: forget the cached token so the next listing asks for a new one.
export const resetRedditToken = (): void => {
    tokenCache = null;
};

const requestToken = async (env: RedditEnv): Promise<string> => {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: basicAuthHeader(env.REDDIT_CLIENT_ID ?? '', env.REDDIT_CLIENT_SECRET ?? ''),
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': redditUserAgent(),
        },
        body: 'grant_type=client_credentials',
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Reddit token request failed with status ${response.status}`);
    const body = (await response.json()) as {access_token?: unknown; expires_in?: unknown};
    if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('Reddit token response carried no access token');
    const seconds = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : DEFAULT_TOKEN_SECONDS;
    tokenCache = {token: body.access_token, expiresAt: Date.now() + seconds * 1000};
    return body.access_token;
};

const getToken = async (env: RedditEnv): Promise<string> =>
    tokenIsFresh(tokenCache, Date.now()) ? (tokenCache as RedditTokenCache).token : requestToken(env);

const requestListing = (subreddit: string, options: RedditListingOptions, token: string): Promise<Response> =>
    fetch(listingUrl(subreddit, options), {
        headers: {Authorization: `Bearer ${token}`, 'User-Agent': redditUserAgent()},
        cache: 'no-store',
    });

// One subreddit's listing as Reddit returns it (stickied posts included — the caller decides
// what counts). Empty when the app is not configured or anything fails; a 401 refreshes the
// token once and retries.
export const fetchRedditListing = async (
    subreddit: string,
    options: RedditListingOptions,
    env: RedditEnv = process.env,
): Promise<RedditPost[]> => {
    if (!redditConfigured(env)) return [];
    try {
        let response = await requestListing(subreddit, options, await getToken(env));
        if (response.status === 401) {
            tokenCache = null;
            response = await requestListing(subreddit, options, await getToken(env));
        }
        if (!response.ok) throw new Error(`Reddit responded with status ${response.status} for r/${subreddit}`);
        return parseListing(await response.json());
    } catch (error) {
        console.error(`Error fetching Reddit posts from r/${subreddit}:`, error);
        return [];
    }
};
