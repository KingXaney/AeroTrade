// Reddit adapter — pulls hot posts from finance subreddits and shapes them into MarketNewsArticle.

import {formatArticle, validateArticle} from "@/lib/utils";
import {FEED_REVALIDATE_SECONDS, hashId, REDDIT_POST_LIMIT, redditUserAgent, SUBREDDITS} from "@/lib/news/config";

export type RedditPost = {
    title: string;
    selftext?: string;
    permalink: string;
    created_utc: number;
    score: number;
    stickied?: boolean;
    subreddit?: string;
};

type RedditListing = {
    data?: {
        children?: {data: RedditPost}[];
    };
};

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

// Regex metacharacters must be escaped so symbols like BRK.B match literally.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const matchTickers = (title: string, symbols: string[]): string[] =>
    symbols.filter((symbol) => {
        const escaped = escapeRegExp(symbol);
        // '$SYM' cashtag form or the bare symbol as a whole word — \b keeps 'A' from matching inside other words.
        const pattern = new RegExp(`\\$${escaped}\\b|\\b${escaped}\\b`, "i");
        return pattern.test(title);
    });

export const fetchRedditNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
    const rawArticles: RawNewsArticle[] = [];

    for (const {name, minScore} of SUBREDDITS) {
        try {
            const url = `${REDDIT_BASE_URL}/r/${name}/hot.json?limit=${REDDIT_POST_LIMIT}&raw_json=1`;
            const response = await fetch(url, {
                headers: {"User-Agent": redditUserAgent()},
                next: {revalidate: FEED_REVALIDATE_SECONDS},
            });
            if (!response.ok) {
                throw new Error(`Reddit responded with status ${response.status} for r/${name}`);
            }

            const listing = (await response.json()) as RedditListing;
            const posts = listing.data?.children ?? [];

            for (const child of posts) {
                const post = child.data;
                // Stickied posts are subreddit housekeeping; low-score posts are noise per-subreddit thresholds.
                if (post.stickied || post.score < minScore) {
                    continue;
                }
                rawArticles.push(mapRedditPost(post, name));
            }
        } catch (error) {
            console.error(`Error fetching Reddit posts from r/${name}:`, error);
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
