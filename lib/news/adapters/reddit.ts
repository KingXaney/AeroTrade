// Reddit adapter — pulls hot posts from finance subreddits and shapes them into MarketNewsArticle.
// The listing itself comes through lib/news/reddit-client.ts (OAuth; keyless JSON is gone), so
// without REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET this adapter contributes nothing and says so once.

import {formatArticle, validateArticle} from "@/lib/news/article";
import {REDDIT_POST_LIMIT, SUBREDDITS} from "@/lib/news/config";
import {fetchRedditListing, redditConfigured, type RedditPost} from "@/lib/news/reddit-client";
import {hashId, escapeRegExp} from "@/lib/text";
import type {MarketNewsArticle, RawNewsArticle} from '@/lib/news/types';

export type {RedditPost} from "@/lib/news/reddit-client";

const REDDIT_BASE_URL = "https://www.reddit.com";

// Reddit text is attacker-writable and later flows into an LLM prompt whose output
// becomes email HTML — strip markup characters so injected tags can never round-trip.
const stripMarkup = (value: string): string => value.replace(/[<>]/g, "");

export const mapRedditPost = (post: RedditPost, subreddit: string): RawNewsArticle => {
    // Self posts can be empty (link posts) — fall back to the title so validateArticle keeps the article.
    const cleanTitle = stripMarkup(post.title).trim();
    const collapsedBody = stripMarkup(post.selftext ?? "").replace(/\s+/g, " ").trim();
    return {
        id: hashId(post.permalink),
        headline: cleanTitle,
        summary: collapsedBody || cleanTitle,
        url: REDDIT_BASE_URL + post.permalink,
        datetime: Math.floor(post.created_utc),
        source: "r/" + subreddit,
        category: "social",
    };
};

export const matchTickers = (title: string, symbols: string[]): string[] =>
    symbols.filter((symbol) => {
        const escaped = escapeRegExp(symbol);
        // '$SYM' cashtag form or the bare symbol as a whole word — \b keeps 'A' from matching inside other words.
        const pattern = new RegExp(`\\$${escaped}\\b|\\b${escaped}\\b`, "i");
        return pattern.test(title);
    });

export const fetchRedditNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
    if (!redditConfigured()) {
        console.warn("Reddit skipped: REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not set");
        return [];
    }

    const rawArticles: RawNewsArticle[] = [];

    for (const {name, minScore} of SUBREDDITS) {
        // Empty on any failure (logged by the client), so one subreddit never costs the others.
        const posts = await fetchRedditListing(name, {limit: REDDIT_POST_LIMIT});
        for (const post of posts) {
            // Stickied posts are subreddit housekeeping; low-score posts are noise per-subreddit thresholds.
            if (post.stickied || post.score < minScore) {
                continue;
            }
            rawArticles.push(mapRedditPost(post, name));
        }
    }

    const articles: MarketNewsArticle[] = rawArticles
        .filter((raw) => validateArticle(raw))
        .map((raw, index) => ({...formatArticle(raw, false, undefined, index), sourceType: "reddit" as const}));

    if (!symbols || symbols.length === 0) {
        return articles;
    }

    // Stable partition: ticker-relevant posts jump the queue but keep their original relative order.
    const matched: MarketNewsArticle[] = [];
    const unmatched: MarketNewsArticle[] = [];
    for (const article of articles) {
        const tickers = matchTickers(article.headline, symbols);
        if (tickers.length > 0) {
            matched.push({...article, related: tickers.join(",")});
        } else {
            unmatched.push(article);
        }
    }
    return [...matched, ...unmatched];
};
