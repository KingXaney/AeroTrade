'use server';

import {
    getDateRange,
    validateArticle,
    formatArticle,
    formatPrice,
    formatChangePercent,
    formatMarketCapValue,
} from "@/lib/utils";
import {POPULAR_STOCK_SYMBOLS} from "@/lib/constants";
import {getWatchlistSymbolsByUserId} from "@/lib/actions/watchlist.actions";

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

// ============================================================================
// --- News ---
// ============================================================================

// Fetches up to 6 news articles — personalized per watchlist symbols, or general market news as fallback
export const getNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
    try {
        // Date range: last 5 days of news
        const {from, to} = getDateRange(5);

        // If the user has watchlist symbols, fetch company-specific news
        if (symbols && symbols.length > 0) {
            const cleanedSymbols = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()))).filter(Boolean);

            // Fetch each symbol's company news once and stash valid articles per symbol
            const perSymbol = new Map<string, RawNewsArticle[]>();
            for (const symbol of cleanedSymbols) {
                const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
                try {
                    const data = await fetchJSON<RawNewsArticle[]>(url);
                    perSymbol.set(symbol, (data || []).filter(validateArticle));
                } catch (e) {
                    console.error(`Failed to fetch company news for ${symbol}:`, e);
                    perSymbol.set(symbol, []);
                }
            }

            // Round-robin through symbols, picking the next unseen article from each
            const cursor = new Map<string, number>(cleanedSymbols.map((s) => [s, 0]));
            const seen = new Set<string>();
            const articles: MarketNewsArticle[] = [];
            let madeProgress = true;

            while (articles.length < 6 && madeProgress) {
                madeProgress = false;
                for (const symbol of cleanedSymbols) {
                    if (articles.length >= 6) break;
                    const list = perSymbol.get(symbol) || [];
                    let idx = cursor.get(symbol) ?? 0;
                    while (idx < list.length) {
                        const candidate = list[idx++];
                        const key = `${candidate.url}-${candidate.headline}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            articles.push(formatArticle(candidate, true, symbol, articles.length));
                            madeProgress = true;
                            break;
                        }
                    }
                    cursor.set(symbol, idx);
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

// ============================================================================
// --- Search ---
// ============================================================================

// Map a raw Finnhub search hit to our Stock shape, dropping the exchange prefix from the symbol.
const toStock = (hit: FinnhubSearchResult): Stock => {
    const rawSymbol = hit.displaySymbol || hit.symbol;
    const symbol = rawSymbol.includes(':') ? rawSymbol.split(':').pop()! : rawSymbol;
    return {
        symbol: symbol.toUpperCase(),
        name: hit.description,
        exchange: hit.symbol.includes(':') ? hit.symbol.split(':')[0] : '',
        type: hit.type || 'Common Stock',
    };
};

// Searches Finnhub for stocks matching the query. Empty query → POPULAR_STOCK_SYMBOLS as a curated default.
// Joins results with the caller's watchlist to populate `isInWatchlist`.
export const searchStocks = async (
    query?: string,
    userId?: string,
): Promise<StockWithWatchlistStatus[]> => {
    try {
        const watchlistSymbols = userId
            ? new Set(await getWatchlistSymbolsByUserId(userId))
            : new Set<string>();

        const q = (query || '').trim();
        if (!q) {
            // Fallback: present popular symbols as cards. We don't burn API calls for names here —
            // the user can click through to /stocks/[symbol] to load the full profile.
            return POPULAR_STOCK_SYMBOLS.slice(0, 15).map((symbol) => ({
                symbol,
                name: symbol,
                exchange: '',
                type: 'Common Stock',
                isInWatchlist: watchlistSymbols.has(symbol),
            }));
        }

        const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(q)}&token=${FINNHUB_API_KEY}`;
        const data = await fetchJSON<FinnhubSearchResponse>(url, 60); // 60s cache for hot queries
        const hits = data.result || [];

        // De-dupe by base symbol; cap at 25 results
        const seen = new Set<string>();
        const out: StockWithWatchlistStatus[] = [];
        for (const hit of hits) {
            const stock = toStock(hit);
            if (!stock.symbol || seen.has(stock.symbol)) continue;
            seen.add(stock.symbol);
            out.push({ ...stock, isInWatchlist: watchlistSymbols.has(stock.symbol) });
            if (out.length >= 25) break;
        }
        return out;
    } catch (error) {
        console.error('Error searching stocks:', error);
        return [];
    }
};

// ============================================================================
// --- Quote / profile / financials ---
// ============================================================================

export const getQuote = async (symbol: string): Promise<QuoteData> => {
    try {
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${FINNHUB_API_KEY}`;
        return await fetchJSON<QuoteData>(url, 30);
    } catch (error) {
        console.error(`Error fetching quote for ${symbol}:`, error);
        return {};
    }
};

export const getCompanyProfile = async (symbol: string): Promise<ProfileData> => {
    try {
        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${FINNHUB_API_KEY}`;
        return await fetchJSON<ProfileData>(url, 60 * 60 * 24); // profile is stable; cache a day
    } catch (error) {
        console.error(`Error fetching profile for ${symbol}:`, error);
        return {};
    }
};

export const getFinancials = async (symbol: string): Promise<FinancialsData> => {
    try {
        const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol.toUpperCase())}&metric=all&token=${FINNHUB_API_KEY}`;
        return await fetchJSON<FinancialsData>(url, 60 * 60); // metrics change slowly; cache an hour
    } catch (error) {
        console.error(`Error fetching financials for ${symbol}:`, error);
        return {};
    }
};

// Fans out quote + profile + financials per symbol in parallel and packs into StockWithData.
// Callers (e.g. watchlist page) layer their own company/addedAt on top of these rows.
export const getStocksWithData = async (symbols: string[]): Promise<StockWithData[]> => {
    if (!symbols || symbols.length === 0) return [];
    const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()))).filter(Boolean);

    const rows = await Promise.all(
        unique.map(async (symbol) => {
            const [quote, profile, financials] = await Promise.all([
                getQuote(symbol),
                getCompanyProfile(symbol),
                getFinancials(symbol),
            ]);

            const peRatio = financials.metric?.peTTM ?? financials.metric?.peBasicExclExtraTTM;
            const marketCapUsd = (profile.marketCapitalization ?? 0) * 1_000_000; // Finnhub returns millions

            return {
                userId: '',
                symbol,
                company: profile.name || symbol,
                addedAt: new Date(0),
                currentPrice: quote.c,
                changePercent: quote.dp,
                priceFormatted: typeof quote.c === 'number' ? formatPrice(quote.c) : undefined,
                changeFormatted: formatChangePercent(quote.dp) || undefined,
                marketCap: profile.marketCapitalization ? formatMarketCapValue(marketCapUsd) : undefined,
                peRatio: typeof peRatio === 'number' && Number.isFinite(peRatio) ? peRatio.toFixed(2) : undefined,
            } satisfies StockWithData;
        }),
    );

    return rows;
};