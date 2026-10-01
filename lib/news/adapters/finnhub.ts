// Thin adapter over the Finnhub client's news fetch — tags articles with sourceType for the digest aggregator.

import {getNews} from "@/lib/prices/finnhub";

export const fetchFinnhubNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
    try {
        const articles = await getNews(symbols && symbols.length > 0 ? symbols : undefined);
        return articles.map((article) => ({...article, sourceType: "finance" as const}));
    } catch (error) {
        // Finnhub is the digest's floor source — a failure here must degrade gracefully, not kill aggregation.
        console.error("fetchFinnhubNews failed:", error);
        return [];
    }
};
