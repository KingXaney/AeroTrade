'use server';

import {getDateRange, validateArticle, formatArticle} from "@/lib/utils";

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

// Generic fetch wrapper — caches the response if revalidateSeconds is provided, otherwise always fetches fresh
const fetchJSON = async <T>(url: string, revalidateSeconds?: number): Promise<T> => {
    const options: RequestInit = revalidateSeconds
        ? {cache: 'force-cache', next: {revalidate: revalidateSeconds}}
        : {cache: 'no-store'};

    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
};

// Fetches up to 6 news articles — personalized per watchlist symbols, or general market news as fallback
export const getNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
    try {
        // Date range: last 5 days of news
        const {from, to} = getDateRange(5);

        // If the user has watchlist symbols, fetch company-specific news
        if (symbols && symbols.length > 0) {
            const cleanedSymbols = symbols.map((s) => s.trim().toUpperCase());
            const articles: MarketNewsArticle[] = [];

            // Round-robin through symbols for 6 iterations, picking one valid article per round
            for (let i = 0; i < 6; i++) {
                const symbol = cleanedSymbols[i % cleanedSymbols.length];
                const url = `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
                const data = await fetchJSON<RawNewsArticle[]>(url);

                const validArticle = data.find(validateArticle);
                if (validArticle) {
                    articles.push(formatArticle(validArticle, true, symbol, i));
                }
            }

            // Most recent articles first
            articles.sort((a, b) => b.datetime - a.datetime);
            return articles;
        }

        // No watchlist — fall back to general market news
        const url = `${FINNHUB_BASE_URL}/news?category=general&token=${FINNHUB_API_KEY}`;
        const data = await fetchJSON<RawNewsArticle[]>(url);

        // Deduplicate by id + url + headline combo
        const seen = new Set<string>();
        const unique = data.filter((article) => {
            if (!validateArticle(article)) return false;
            const key = `${article.id}-${article.url}-${article.headline}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Take the first 6 unique articles
        return unique.slice(0, 6).map((article, index) => formatArticle(article, false, undefined, index));
    } catch (error) {
        console.error('Error fetching news:', error);
        throw new Error('Failed to fetch news');
    }
};