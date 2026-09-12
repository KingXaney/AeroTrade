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
import {connectToDatabase} from "@/database/mongoose";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from "@/database/models/suggestion-set.model";
import {getActiveTheses, getBrainDigestData} from "@/lib/brain/queries";
import {getTopicFeed, getTopicsForUser, getTopicsOverview} from "@/lib/topics/store";
import {createTopic, deleteTopic} from "@/lib/actions/topics.actions";
import {MAX_KEYWORDS} from "@/lib/topics/config";
import {
    aggregatePortfolios,
    buildPriceMap,
    computePortfolio,
    getTradeHistory,
    readAccountsForUser,
    toAccountSummary,
} from "@/lib/trading/account";
import {findAccountByName, toChatPortfolio} from "@/lib/trading/portfolio-view";

const TOPIC_FEED_DEFAULT = 5;
const TOPIC_FEED_MAX = 10;

// buildPriceMap is one Finnhub quote per unique symbol with no ceiling. A chat answer
// doesn't need every tail position priced to the cent, so price the largest holdings and
// report how many were left at cost. (getQuote caches 30s, so repeat calls in one
// conversation are close to free — this bounds the first one.)
const CHAT_MAX_PRICED_SYMBOLS = 25;
const CHAT_TRADES_DEFAULT = 8;
const CHAT_TRADES_MAX = 20;

// "AI chips" / "ai-chips" -> one of this user's topics: slug, exact name, then a name that contains it.
const findTopic = async (userId: string, ref: string): Promise<TopicView | null> => {
    const needle = ref.trim().toLowerCase();
    if (!needle) return null;
    const topics = await getTopicsForUser(userId);
    return topics.find((t) => t.slug === needle)
        ?? topics.find((t) => t.name.toLowerCase() === needle)
        ?? topics.find((t) => t.name.toLowerCase().includes(needle))
        ?? null;
};

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

    getBrainDigest: tool({
        description: 'Read the news brain: the strongest current market narratives (tickers, sectors, themes) with persistent-attention weight, sentiment and whether each is an active long-term thesis. Use when the user asks what the market cares about, which themes are building, or what the AI is watching.',
        inputSchema: z.object({}),
        execute: async () => {
            const [digest, theses] = await Promise.all([getBrainDigestData(), getActiveTheses()]);
            return {
                topNarratives: digest,
                activeTheses: theses.map((t) => ({
                    name: t.displayName,
                    key: t.key,
                    weightSlow: Number(t.weightSlow.toFixed(2)),
                    sentiment: Number(t.sentimentSlow.toFixed(2)),
                    activeSince: t.thesisSince ? new Date(t.thesisSince).toISOString().slice(0, 10) : null,
                })),
            };
        },
    }),

    getAiSuggestions: tool({
        description: "Fetch the AI Navigator's latest weekly portfolio decisions: the global model portfolio plus this user's own executed decisions if they are enrolled. Use when the user asks what the AI suggests, holds, or traded. Always present these as an automated paper-trading experiment, never as financial advice.",
        inputSchema: z.object({}),
        execute: async () => {
            await connectToDatabase();
            type LeanSet = {date: string; kind?: string; items: SuggestionItem[]; rationaleMd?: string} | null;
            const [globalSet, userSet] = await Promise.all([
                SuggestionSet.findOne({userId: GLOBAL_SUGGESTIONS_USER}).sort({date: -1}).lean<LeanSet>(),
                SuggestionSet.findOne({userId}).sort({date: -1}).lean<LeanSet>(),
            ]);
            const shape = (set: LeanSet) =>
                set ? {
                    date: set.date,
                    // Previews are manual analysis runs — nothing was traded.
                    preview: set.kind === 'preview',
                    items: set.items.map((i) => ({
                        action: i.action,
                        symbol: i.symbol,
                        targetWeightPct: Math.round(i.targetWeight * 100),
                        executed: i.executed,
                        reasons: i.reasons,
                    })),
                    rationale: set.rationaleMd ?? null,
                } : null;
            return {global: shape(globalSet), yours: shape(userSet)};
        },
    }),

    getPaperPortfolio: tool({
        description:
            "Read the user's paper-trading accounts: cash, open positions with unrealised P&L, total value and return since inception, and optionally their recent trades. Call this before answering anything about what they hold, how they're doing, or whether to sell something — positions change, so never answer from memory or from earlier in the conversation. Read-only: you cannot place orders.",
        inputSchema: z.object({
            account: z.string().optional().describe('Strategy account name, e.g. "AI Navigator". Omit for every account combined.'),
            includeRecentTrades: z.boolean().optional().describe('Set true for "what did I trade", "why is my P&L X", "did I sell Y"'),
            tradeLimit: z.number().int().min(1).max(CHAT_TRADES_MAX).optional().describe(`Trades to return (default ${CHAT_TRADES_DEFAULT})`),
        }),
        execute: async ({account, includeRecentTrades, tradeLimit}) => {
            try {
                // readAccountsForUser, NOT getAccountsForUser: the latter lazily creates a
                // "Main Strategy" account and backfills legacy trades. Asking the assistant
                // a question must not materialise an account for someone who never traded.
                const docs = await readAccountsForUser(userId);
                if (docs.length === 0) {
                    return {accounts: [], message: 'No paper accounts yet — open the Trade page to start one.'};
                }

                const summaries = docs.map(toAccountSummary);
                const picked = account ? findAccountByName(summaries, account) : undefined;
                if (account && !picked) {
                    return {error: `No strategy account named "${account}". They have: ${summaries.map((s) => s.name).join(', ')}.`};
                }
                const chosen = picked ? docs.filter((d) => String(d._id) === picked.id) : docs;

                // Price the biggest holdings first; the rest fall back to cost basis and
                // are counted in `valuation`.
                const ranked = chosen
                    .flatMap((d) => d.positions ?? [])
                    .sort((a, b) => b.avgCost * b.quantity - a.avgCost * a.quantity)
                    .map((p) => p.symbol);
                const prices = await buildPriceMap(Array.from(new Set(ranked)).slice(0, CHAT_MAX_PRICED_SYMBOLS));

                const withPortfolios = chosen.map((d) => ({
                    account: toAccountSummary(d),
                    summary: computePortfolio(d, prices),
                }));
                const total = aggregatePortfolios(withPortfolios);

                const trades = includeRecentTrades
                    ? (await Promise.all(
                        withPortfolios.map((a) => getTradeHistory(userId, a.account.id, tradeLimit ?? CHAT_TRADES_DEFAULT)),
                    ))
                        .flat()
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .slice(0, tradeLimit ?? CHAT_TRADES_DEFAULT)
                    : undefined;

                return toChatPortfolio(withPortfolios, total, trades);
            } catch (error) {
                console.error('getPaperPortfolio failed:', error);
                return {error: 'Could not read your paper accounts right now.'};
            }
        },
    }),

    getFollowedTopics: tool({
        description: "List the news topics the user follows (markets or anything else) with how many articles are new since they last looked, the latest headline and today's AI brief when one exists. Call this first for \"what's new\", \"my topics\", or before reading a topic's feed.",
        inputSchema: z.object({}),
        execute: async () => {
            const overview = await getTopicsOverview(userId);
            return {
                unseenTotal: overview.unseenTotal,
                topics: overview.topics.map((t) => ({
                    name: t.name,
                    slug: t.slug,
                    keywords: t.keywords,
                    unseenCount: t.unseenCount,
                    articleCount: t.articleCount,
                    latestHeadline: t.latest?.headline ?? null,
                    brief: t.brief ? {date: t.brief.date, summary: t.brief.summary, bullets: t.brief.bullets} : null,
                })),
            };
        },
    }),

    getTopicFeed: tool({
        description: 'Read the newest articles matched to one followed topic. Pass the topic name or slug the way the user said it.',
        inputSchema: z.object({
            topic: z.string().describe('Topic name or slug, e.g. "AI chips"'),
            limit: z.number().int().min(1).max(TOPIC_FEED_MAX).optional().describe(`Articles to return (default ${TOPIC_FEED_DEFAULT})`),
        }),
        execute: async ({topic, limit}) => {
            const found = await findTopic(userId, topic);
            if (!found) return {error: `You don't follow a topic called "${topic}".`};
            const feed = await getTopicFeed(userId, found.slug, {limit: limit ?? TOPIC_FEED_DEFAULT});
            return {
                topic: {name: found.name, slug: found.slug, keywords: found.keywords},
                articles: (feed?.articles ?? []).map((a) => ({
                    headline: a.headline,
                    source: a.source,
                    url: a.url,
                    publishedAt: new Date(a.datetime * 1000).toISOString(),
                    matchedTerms: a.matchedTerms,
                })),
            };
        },
    }),

    followTopic: tool({
        description: 'Follow a new news topic for the user — any subject works ("Fed rate decisions", "NBA trade deadline", "AI chips"). Keywords are optional: leave them out unless the user named specific terms to match.',
        inputSchema: z.object({
            name: z.string().describe('Topic name, 2–60 characters'),
            keywords: z.array(z.string()).max(MAX_KEYWORDS).optional().describe('Optional match terms, each 2–40 characters'),
        }),
        execute: async ({name, keywords}) => {
            // Same validation and limits as the /topics page; the action reads the session itself.
            const result = await createTopic({name, keywords: keywords ?? []});
            return result.success && result.topic
                ? {success: true, topic: {name: result.topic.name, slug: result.topic.slug, keywords: result.topic.keywords}}
                : {success: false, message: result.message ?? 'Could not follow the topic'};
        },
    }),

    unfollowTopic: tool({
        description: "Stop following one of the user's topics. Its matched articles disappear from their feed.",
        inputSchema: z.object({
            topic: z.string().describe('Topic name or slug'),
        }),
        execute: async ({topic}) => {
            const found = await findTopic(userId, topic);
            if (!found) return {success: false, message: `You don't follow a topic called "${topic}".`};
            const result = await deleteTopic(found.id);
            return result.success
                ? {success: true, topic: {name: found.name, slug: found.slug}}
                : {success: false, message: result.message ?? 'Could not unfollow the topic'};
        },
    }),
});

export type ChatTools = ReturnType<typeof buildTools>;
