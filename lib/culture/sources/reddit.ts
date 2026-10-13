// The youth subreddits, through the OAuth client both brains share (lib/news/reddit-client.ts).
// A post becomes an item: its title, its text, its score. Stickied and low-score posts are
// subreddit housekeeping and noise; the thresholds are per subreddit, since r/gaming's front
// page and r/energydrinks' are different sizes.

import {CULTURE_ITEM_BODY_CHARS, CULTURE_SUBREDDIT_POST_LIMIT} from "@/lib/culture/config";
import {fetchRedditListing, redditConfigured, type RedditPost} from "@/lib/news/reddit-client";
import type {CultureItemInput} from "@/lib/culture/types";

export const CULTURE_SUBREDDITS: readonly {name: string; minScore: number}[] = [
    {name: 'teenagers', minScore: 150},
    {name: 'GenZ', minScore: 100},
    {name: 'sneakers', minScore: 100},
    {name: 'streetwear', minScore: 100},
    {name: 'malefashionadvice', minScore: 100},
    {name: 'femalefashionadvice', minScore: 100},
    {name: 'SkincareAddiction', minScore: 100},
    {name: 'MakeupAddiction', minScore: 100},
    {name: 'energydrinks', minScore: 30},
    {name: 'fastfood', minScore: 50},
    {name: 'snacks', minScore: 30},
    {name: 'gaming', minScore: 300},
    {name: 'NintendoSwitch', minScore: 150},
    {name: 'PS5', minScore: 150},
    {name: 'xbox', minScore: 100},
    {name: 'iphone', minScore: 100},
    {name: 'Fitness', minScore: 100},
    {name: 'running', minScore: 100},
    {name: 'Costco', minScore: 100},
    {name: 'TikTokCringe', minScore: 500},
];

const REDDIT_BASE_URL = 'https://www.reddit.com';

// Reddit text is attacker-writable and reaches a model prompt: tags are dropped whole, and a
// stray angle bracket never round-trips.
const stripMarkup = (value: string): string => value.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '');

export const toRedditItem = (post: RedditPost, subreddit: string): CultureItemInput => ({
    source: 'reddit',
    sourceName: `r/${subreddit}`,
    title: stripMarkup(post.title).trim(),
    body: stripMarkup(post.selftext ?? '').replace(/\s+/g, ' ').trim().slice(0, CULTURE_ITEM_BODY_CHARS),
    url: REDDIT_BASE_URL + post.permalink,
    datetime: Math.floor(post.created_utc),
    score: post.score,
});

export const keepPost = (post: RedditPost, minScore: number): boolean => !post.stickied && post.score >= minScore && post.title.trim().length > 0;

export type RedditFetch = {items: CultureItemInput[]; skipped: boolean; subreddits: number; empty: number};

type FetchOptions = {
    fetchListing?: typeof fetchRedditListing;
    env?: Readonly<Record<string, string | undefined>>;
    subreddits?: readonly {name: string; minScore: number}[];
};

export const fetchCultureReddit = async ({
    fetchListing = fetchRedditListing,
    env = process.env,
    subreddits = CULTURE_SUBREDDITS,
}: FetchOptions = {}): Promise<RedditFetch> => {
    if (!redditConfigured(env)) return {items: [], skipped: true, subreddits: subreddits.length, empty: subreddits.length};
    const items: CultureItemInput[] = [];
    let empty = 0;
    for (const {name, minScore} of subreddits) {
        // Empty on any failure (the client logs it), so one subreddit never costs the others.
        const posts = await fetchListing(name, {limit: CULTURE_SUBREDDIT_POST_LIMIT}, env);
        if (posts.length === 0) empty++;
        for (const post of posts) {
            if (keepPost(post, minScore)) items.push(toRedditItem(post, name));
        }
    }
    return {items, skipped: false, subreddits: subreddits.length, empty};
};
