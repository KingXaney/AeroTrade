// The digest's dedupe rule, on its own so the pure feed maths (lib/news/feed.ts) can share
// it without importing aggregate.ts, whose adapters reach the database connection.
// Wires get republished across outlets: one URL or one headline is one story.

import {normalizeUrl} from "@/lib/news/config";

export const dedupeArticles = (articles: MarketNewsArticle[]): MarketNewsArticle[] => {
    const seenUrls = new Set<string>();
    const seenHeadlines = new Set<string>();
    const unique: MarketNewsArticle[] = [];

    for (const article of articles) {
        const urlKey = normalizeUrl(article.url);
        const headlineKey = article.headline.trim().toLowerCase();

        if (seenUrls.has(urlKey) || seenHeadlines.has(headlineKey)) {
            continue;
        }

        seenUrls.add(urlKey);
        seenHeadlines.add(headlineKey);
        unique.push(article);
    }

    return unique;
};
