// The Finnhub client: quotes, company profiles, financials, symbol search and company news.
// A plain server module, NOT 'use server' — every export of a 'use server' file is a public
// endpoint, and lib code (trading, news, dashboard, chat, jobs) calls these directly. Client
// components reach the search, and the quote sheet's price for one symbol, through
// lib/actions/stocks.actions.ts.
//
// A quote is never read from here by a page or a job: fetchQuote is the raw call, and
// lib/prices/quote-store.ts is its one caller (the quote sheet, and the fresh read a fill or a
// snapshot acts on). lib/prices/__tests__/quote-guard.test.ts holds that.

import {validateArticle, formatArticle} from "@/lib/news/article";
import {reportLimit, responseSignal} from "@/lib/limits/report";
import {POPULAR_STOCK_SYMBOLS} from "@/lib/stocks/popular";
import {FINANCIALS_REVALIDATE_SECONDS, PROFILE_REVALIDATE_SECONDS, QUOTE_FETCH_TIMEOUT_MS} from "@/lib/prices/config";
import type {MarketNewsArticle, RawNewsArticle} from '@/lib/news/types';
import type {FinnhubSearchResult, QuoteData} from '@/lib/prices/types';
import type {Stock} from '@/lib/stocks/types';

type ProfileData = {
    name?: string;
    marketCapitalization?: number;
};

type FinancialsData = {
    metric?: { [key: string]: number };
};

type FinnhubSearchResponse = {
    count: number;
    result: FinnhubSearchResult[];
};

const FINNHUB_DEFAULT_URL = 'https://finnhub.io/api/v1';
// Overridable so the browser QA can stand a server in for Finnhub (scripts/qa/start-finnhub-stub.mjs);
// unset everywhere else. The culture earnings calendar (lib/culture/sources/earnings.ts) reads it too.
export const finnhubBaseUrl = (env: Record<string, string | undefined> = process.env): string =>
    (env.FINNHUB_API_URL ?? '').trim().replace(/\/+$/, '') || FINNHUB_DEFAULT_URL;
const FINNHUB_BASE_URL = finnhubBaseUrl();
// Server-only. NEXT_PUBLIC_FINNHUB_API_KEY is still honoured for existing deployments.
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

// Whether a quote can be asked for at all: without a key every answer is the same empty one.
export const finnhubConfigured = (): boolean => FINNHUB_API_KEY !== '';

// Generic fetch wrapper — caches the response if revalidateSeconds is provided, otherwise always fetches fresh
const fetchJSON = async <T>(url: string, revalidateSeconds?: number): Promise<T> => {
    const options: RequestInit = revalidateSeconds
        ? {cache: 'force-cache', next: {revalidate: revalidateSeconds}}
        : {cache: 'no-store'};

    const response = await fetch(url, options);

    if (!response.ok) {
        // A 429 is the free plan's minute; a 401 or 403 the key (lib/limits).
        await reportLimit('finnhub', await responseSignal(response, url.replace(/[?&]token=[^&]*/, '')));
        throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
};

// ============================================================================
// --- News ---
// ============================================================================

// The last `days` days as Finnhub's from/to query dates.
const getDateRange = (days: number) => {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - days);
    return {
        to: toDate.toISOString().split('T')[0],
        from: fromDate.toISOString().split('T')[0],
    };
};

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
// Takes no user id: client components call it through lib/actions/stocks.actions, a public endpoint, and an id
// passed in would let anyone read another user's watchlist. The chat tool joins its own user's.
export const searchStocks = async (query?: string): Promise<Stock[]> => {
    try {
        const q = (query || '').trim();
        if (!q) {
            // Fallback: present popular symbols as cards. We don't burn API calls for names here —
            // the user can click through to /stocks/[symbol] to load the full profile.
            return POPULAR_STOCK_SYMBOLS.map((symbol) => ({
                symbol,
                name: symbol,
                exchange: '',
                type: 'Common Stock',
            }));
        }

        const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(q)}&token=${FINNHUB_API_KEY}`;
        const data = await fetchJSON<FinnhubSearchResponse>(url, 60); // 60s cache for hot queries
        const hits = data.result || [];

        // De-dupe by base symbol; cap at 25 results
        const seen = new Set<string>();
        const out: Stock[] = [];
        for (const hit of hits) {
            const stock = toStock(hit);
            if (!stock.symbol || seen.has(stock.symbol)) continue;
            seen.add(stock.symbol);
            out.push(stock);
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

// What asking Finnhub for one quote came to. 'off': there is no key, nothing was asked (the
// answer is the same empty quote, so the round trip and its error are skipped). 'answer': HTTP
// 200 with a JSON object — which may still hold no price: an unknown symbol reads `c: 0`, and
// the free plan answers a burst with an empty body. 'refused': any other status (429 past the
// minute, 401 or 403 for the key). 'failed': the call threw — the network, or no answer within
// QUOTE_FETCH_TIMEOUT_MS.
export type QuoteAnswer =
    | {kind: 'off'}
    | {kind: 'answer'; body: QuoteData}
    | {kind: 'refused'; status: number; detail: string}
    | {kind: 'failed'; error: unknown};

// One quote, asked now: never cached (a price a fill or a snapshot acts on must be this
// moment's, and Next's fetch cache serves a stale entry of any age), never retried, never
// logged or filed here — the caller knows whether a refusal is one of thirty or the only one.
export const fetchQuote = async (symbol: string): Promise<QuoteAnswer> => {
    if (!FINNHUB_API_KEY) return {kind: 'off'};
    const path = `/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
    try {
        const response = await fetch(`${FINNHUB_BASE_URL}${path}&token=${FINNHUB_API_KEY}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(QUOTE_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) return {kind: 'refused', status: response.status, detail: (await responseSignal(response, path)).message};
        const body: unknown = await response.json();
        return {kind: 'answer', body: typeof body === 'object' && body !== null && !Array.isArray(body) ? body as QuoteData : {}};
    } catch (error) {
        return {kind: 'failed', error};
    }
};

export const getCompanyProfile = async (symbol: string): Promise<ProfileData> => {
    // Keyless, the answer is the same empty profile: skip the certain 401 and its error log
    // (the stock page renders keyless for every symbol a strategy watches).
    if (!FINNHUB_API_KEY) return {};
    try {
        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${FINNHUB_API_KEY}`;
        return await fetchJSON<ProfileData>(url, PROFILE_REVALIDATE_SECONDS); // profile is stable; cache a day
    } catch (error) {
        console.error(`Error fetching profile for ${symbol}:`, error);
        return {};
    }
};

export const getFinancials = async (symbol: string): Promise<FinancialsData> => {
    if (!FINNHUB_API_KEY) return {};
    try {
        const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol.toUpperCase())}&metric=all&token=${FINNHUB_API_KEY}`;
        return await fetchJSON<FinancialsData>(url, FINANCIALS_REVALIDATE_SECONDS); // metrics change slowly; cache an hour
    } catch (error) {
        console.error(`Error fetching financials for ${symbol}:`, error);
        return {};
    }
};
