// Fan-in for the multi-source news digest: fetch every adapter, survive partial failures,
// dedupe overlap (wires get republished across outlets), then cap and order for the email.

import {fetchFinnhubNews} from "@/lib/news/adapters/finnhub";
import {fetchRedditNews} from "@/lib/news/adapters/reddit";
import {fetchRssNews} from "@/lib/news/adapters/rss";
import {fetchSecFilings} from "@/lib/news/adapters/sec";
import {SOURCE_CAPS, TOTAL_ARTICLE_CAP} from "@/lib/news/config";

// Email sections render in this order — finance wires lead, social chatter closes.
const SECTION_ORDER: NewsSourceType[] = ["finance", "rss", "sec", "reddit"];

// When over the total cap, sacrifice the noisiest sources first; finance is the floor.
const TRIM_ORDER: NewsSourceType[] = ["reddit", "rss", "sec", "finance"];

// Articles that predate sourceType stamping are treated as finance so they still render.
const DEFAULT_SOURCE_TYPE: NewsSourceType = "finance";

export const normalizeUrl = (url: string): string => {
    // Query strings carry tracking params (utm_*) that make identical stories look distinct.
    const withoutQuery = url.toLowerCase().split("?")[0];
    return withoutQuery.replace(/\/+$/, "");
};

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

export const capAndOrder = (
    articles: MarketNewsArticle[],
    caps: Record<NewsSourceType, number> = SOURCE_CAPS,
    totalCap: number = TOTAL_ARTICLE_CAP,
): MarketNewsArticle[] => {
    const groups: Record<NewsSourceType, MarketNewsArticle[]> = {finance: [], rss: [], reddit: [], sec: []};

    for (const article of articles) {
        groups[article.sourceType ?? DEFAULT_SOURCE_TYPE].push(article);
    }

    // Sort newest-first before slicing so per-source caps keep the freshest stories.
    for (const type of SECTION_ORDER) {
        groups[type] = groups[type]
            .sort((a, b) => b.datetime - a.datetime)
            .slice(0, caps[type]);
    }

    let overflow = SECTION_ORDER.reduce((count, type) => count + groups[type].length, 0) - totalCap;

    for (const type of TRIM_ORDER) {
        if (overflow <= 0) {
            break;
        }
        const removeCount = Math.min(overflow, groups[type].length);
        // Groups are sorted newest-first, so trimming the tail drops the oldest articles.
        groups[type] = groups[type].slice(0, groups[type].length - removeCount);
        overflow -= removeCount;
    }

    return SECTION_ORDER.flatMap((type) => groups[type]);
};

export const getAggregatedNews = async (
    {symbols, mode, caps, totalCap}: {
        symbols?: string[];
        mode: "personalized" | "general";
        // The news brain ingests with wider caps than the email digest.
        caps?: Record<NewsSourceType, number>;
        totalCap?: number;
    }
): Promise<MarketNewsArticle[]> => {
    // General mode is a market-wide digest — holdings must not skew any adapter.
    const adapterSymbols = mode === "personalized" ? symbols : undefined;

    const sources: {name: string; request: Promise<MarketNewsArticle[]>}[] = [
        {name: "finnhub", request: fetchFinnhubNews(adapterSymbols)},
        {name: "rss", request: fetchRssNews(adapterSymbols)},
        {name: "reddit", request: fetchRedditNews(adapterSymbols)},
    ];

    // Filings only make sense for held tickers, so SEC joins solely in personalized mode.
    if (mode === "personalized" && symbols && symbols.length > 0) {
        sources.push({name: "sec", request: fetchSecFilings(symbols)});
    }

    const results = await Promise.allSettled(sources.map((source) => source.request));

    const collected: MarketNewsArticle[] = [];
    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            collected.push(...result.value);
        } else {
            // One dead source must never kill the digest — Finnhub alone is the floor.
            console.error("News source failed:", sources[index].name, result.reason);
        }
    });

    return capAndOrder(dedupeArticles(collected), caps ?? SOURCE_CAPS, totalCap ?? TOTAL_ARTICLE_CAP);
};
