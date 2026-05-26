import {tool} from "ai";
import {z} from "zod";
import {
    searchStocks,
    getQuote,
    getCompanyProfile,
    getFinancials,
    getNews,
} from "@/lib/actions/finnhub.actions";
import {
    addToWatchlist,
    removeFromWatchlist,
    getWatchlistForUser,
} from "@/lib/actions/watchlist.actions";

// Tool definitions for the chat assistant. Each one wraps an existing server action.
// The userId closure keeps auth off the LLM — it never sees or supplies a user id.
export const buildTools = (userId: string) => ({
    searchStock: tool({
        description: 'Search for stocks by company name or ticker symbol. Use this when the user mentions a company or symbol you want to confirm exists. Returns up to 25 matches with isInWatchlist flags.',
        inputSchema: z.object({
            query: z.string().describe('Company name or ticker, e.g. "Apple" or "AAPL"'),
        }),
        execute: async ({query}) => {
            const results = await searchStocks(query, userId);
            return results.slice(0, 10);
        },
    }),

    getStockQuote: tool({
        description: 'Get the current price and percent change for a single stock symbol. Always use this before quoting any price number.',
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol, e.g. "AAPL"'),
        }),
        execute: async ({symbol}) => {
            const q = await getQuote(symbol);
            return {symbol: symbol.toUpperCase(), price: q.c, changePercent: q.dp};
        },
    }),

    getStockProfile: tool({
        description: 'Get a company profile (name, market capitalization). Use to identify a company by symbol and fetch its market cap.',
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol'),
        }),
        execute: async ({symbol}) => {
            const p = await getCompanyProfile(symbol);
            return {
                symbol: symbol.toUpperCase(),
                name: p.name,
                marketCapMillions: p.marketCapitalization,
            };
        },
    }),

    getStockFinancials: tool({
        description: 'Get valuation metrics for a stock (P/E ratio, etc.). Use when discussing whether a stock is over/undervalued.',
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol'),
        }),
        execute: async ({symbol}) => {
            const f = await getFinancials(symbol);
            const peTTM = f.metric?.peTTM;
            const peBasic = f.metric?.peBasicExclExtraTTM;
            return {
                symbol: symbol.toUpperCase(),
                peRatioTTM: peTTM,
                peRatioBasic: peBasic,
            };
        },
    }),

    getWatchlist: tool({
        description: "List the stocks currently in the user's watchlist. Returns symbol, company name, and when it was added.",
        inputSchema: z.object({}),
        execute: async () => {
            const items = await getWatchlistForUser(userId);
            return items.map((i) => ({
                symbol: i.symbol,
                company: i.company,
                addedAt: i.addedAt.toISOString(),
            }));
        },
    }),

    addStockToWatchlist: tool({
        description: 'Add a stock to the watchlist. Idempotent — safe to call even if the stock is already there.',
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol, e.g. "NVDA"'),
            company: z.string().describe('Company display name, e.g. "NVIDIA Corp"'),
        }),
        execute: async ({symbol, company}) => {
            return await addToWatchlist({symbol, company});
        },
    }),

    removeStockFromWatchlist: tool({
        description: 'Remove a stock from the watchlist.',
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol to remove'),
        }),
        execute: async ({symbol}) => {
            return await removeFromWatchlist(symbol);
        },
    }),

    getMarketNews: tool({
        description: 'Fetch recent market news. Pass specific symbols to get company-specific news, or leave empty for general market news.',
        inputSchema: z.object({
            symbols: z.array(z.string()).optional().describe('Optional list of ticker symbols'),
        }),
        execute: async ({symbols}) => {
            const articles = await getNews(symbols && symbols.length > 0 ? symbols : undefined);
            return articles.map((a) => ({
                headline: a.headline,
                summary: a.summary,
                source: a.source,
                url: a.url,
                related: a.related,
            }));
        },
    }),
});

export type ChatTools = ReturnType<typeof buildTools>;
