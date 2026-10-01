import {tool} from "ai";
import {TOOL_DESCRIPTIONS} from "@/lib/ai/tool-copy";
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
    getWatchlistSymbolsByUserId,
} from "@/lib/actions/watchlist.actions";
import {getLatestSuggestions, type SuggestionSetView} from "@/lib/navigator/service";
import {getActiveTheses, getBrainDigestData} from "@/lib/brain/queries";
import {getTopicFeed, getTopicsForUser, getTopicsOverview} from "@/lib/topics/store";
import {createTopic, deleteTopic} from "@/lib/actions/topics.actions";
import {MAX_KEYWORDS} from "@/lib/topics/config";
import {FEED_WATCHLIST_SYMBOL_CAP} from "@/lib/news/config";
import {
    aggregatePortfolios,
    computePortfolio,
    getTradeHistory,
    readAccountsForUser,
    toAccountSummary,
} from "@/lib/trading/account";
import {findAccountByName, toChatPortfolio} from "@/lib/trading/portfolio-view";
import {resolveTerm} from "@/lib/learn/glossary";
import {decodeQuotedReason, shapeExplain} from "@/lib/ai/explain";
import {resolveStrategy, shapeQuantLeaderboard, shapeQuantStrategy, shapeUnknownStrategy} from "@/lib/ai/quant-strategies";
import {STRATEGY_SLUGS} from "@/lib/strategies/catalog";
import {getLatestRun, getStrategyLeaderboard} from "@/lib/strategies/queries";
import {priceLargestHoldings, readLearnerValue} from "@/lib/ai/learner-hooks";

const TOPIC_FEED_DEFAULT = 5;
const TOPIC_FEED_MAX = 10;

// Bounds on what the model may pass explainTerm; the shaper clips what it echoes back.
const EXPLAIN_TERM_MAX = 200;
const EXPLAIN_REASON_MAX = 1000;

// Longer than any slug or strategy name; the shaper clips what it echoes back.
const QUANT_SLUG_MAX = 80;

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
        description: TOOL_DESCRIPTIONS.searchStock,
        inputSchema: z.object({
            query: z.string().describe('Company name or ticker, e.g. "Apple" or "AAPL"'),
        }),
        execute: async ({query}) => {
            // The search action is public and takes no user id; the watchlist join is done here.
            const [results, watched] = await Promise.all([searchStocks(query), getWatchlistSymbolsByUserId(userId)]);
            const watchedSet = new Set(watched);
            return results.slice(0, 10).map((stock): StockWithWatchlistStatus => ({...stock, isInWatchlist: watchedSet.has(stock.symbol)}));
        },
    }),

    getStockQuote: tool({
        description: TOOL_DESCRIPTIONS.getStockQuote,
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol, e.g. "AAPL"'),
        }),
        execute: async ({symbol}) => {
            const q = await getQuote(symbol);
            return {symbol: symbol.toUpperCase(), price: q.c, changePercent: q.dp};
        },
    }),

    getStockProfile: tool({
        description: TOOL_DESCRIPTIONS.getStockProfile,
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
        description: TOOL_DESCRIPTIONS.getStockFinancials,
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
        description: TOOL_DESCRIPTIONS.getWatchlist,
        inputSchema: z.object({}),
        execute: async () => {
            const items = await getWatchlistForUser(userId);
            if (!items) return {error: 'Could not read your watchlist right now.'};
            return items.map((i) => ({
                symbol: i.symbol,
                company: i.company,
                addedAt: i.addedAt.toISOString(),
            }));
        },
    }),

    addStockToWatchlist: tool({
        description: TOOL_DESCRIPTIONS.addStockToWatchlist,
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol, e.g. "NVDA"'),
            company: z.string().describe('Company display name, e.g. "NVIDIA Corp"'),
        }),
        execute: async ({symbol, company}) => {
            return await addToWatchlist({symbol, company});
        },
    }),

    removeStockFromWatchlist: tool({
        description: TOOL_DESCRIPTIONS.removeStockFromWatchlist,
        inputSchema: z.object({
            symbol: z.string().describe('Ticker symbol to remove'),
        }),
        execute: async ({symbol}) => {
            return await removeFromWatchlist(symbol);
        },
    }),

    getMarketNews: tool({
        description: TOOL_DESCRIPTIONS.getMarketNews,
        inputSchema: z.object({
            // getNews makes one Finnhub call per symbol, in turn, on the shared key: the same cap as /news.
            symbols: z.array(z.string()).max(FEED_WATCHLIST_SYMBOL_CAP).optional()
                .describe(`Optional list of ticker symbols, at most ${FEED_WATCHLIST_SYMBOL_CAP}`),
        }),
        execute: async ({symbols}) => {
            const capped = symbols?.slice(0, FEED_WATCHLIST_SYMBOL_CAP);
            const articles = await getNews(capped && capped.length > 0 ? capped : undefined);
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
        description: TOOL_DESCRIPTIONS.getBrainDigest,
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
        description: TOOL_DESCRIPTIONS.getAiSuggestions,
        inputSchema: z.object({}),
        execute: async () => {
            const {global, user} = await getLatestSuggestions(userId);
            const shape = (set: SuggestionSetView | null) =>
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
                    rationale: set.rationaleMd,
                } : null;
            return {global: shape(global), yours: shape(user)};
        },
    }),

    getPaperPortfolio: tool({
        description: TOOL_DESCRIPTIONS.getPaperPortfolio,
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
                const prices = await priceLargestHoldings(chosen);

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
        description: TOOL_DESCRIPTIONS.getFollowedTopics,
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
        description: TOOL_DESCRIPTIONS.getTopicFeed,
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
        description: TOOL_DESCRIPTIONS.followTopic,
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
        description: TOOL_DESCRIPTIONS.unfollowTopic,
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

    explainTerm: tool({
        description: TOOL_DESCRIPTIONS.explainTerm,
        inputSchema: z.object({
            term: z.string().max(EXPLAIN_TERM_MAX).optional().describe('The term as the user wrote it, e.g. "max drawdown" or "my win rate"'),
            reason: z.string().max(EXPLAIN_REASON_MAX).optional().describe('A reason a quant strategy or the AI Navigator wrote, quoted exactly, e.g. "enter: SMA50 42.10 > SMA200 40.00 (+5.3%)" or "slow news weight 3.2 (rank 4/59)"'),
            writer: z.enum(['strategy', 'navigator']).optional().describe('Who wrote the reason: "navigator" for the AI Navigator\'s decisions (getAiSuggestions), "strategy" for a quant strategy\'s. Omit it when unsure; a shape both engines write then comes back read both ways, one reading per writer.'),
        }),
        execute: async ({term, reason, writer}) => {
            // The glossary's one resolver and the two reason grammars; none builds a RegExp
            // from what the model passed (invariant 2).
            const entry = term ? resolveTerm(term) : null;
            const readings = reason ? decodeQuotedReason(reason, writer) : null;
            const yours = entry ? await readLearnerValue(userId, entry.key) : null;
            return shapeExplain({term, reason, entry, readings, yours});
        },
    }),

    getQuantStrategies: tool({
        description: TOOL_DESCRIPTIONS.getQuantStrategies,
        inputSchema: z.object({
            slug: z.string().max(QUANT_SLUG_MAX).optional()
                .describe(`One strategy's slug: ${STRATEGY_SLUGS.join(', ')}. Omit it for all eight.`),
        }),
        execute: async ({slug}) => {
            try {
                // The /strategies page's own cached reader; with a slug, one run document more.
                if (!slug?.trim()) return shapeQuantLeaderboard((await getStrategyLeaderboard(userId)).rows);
                const def = resolveStrategy(slug);
                if (!def) return shapeUnknownStrategy(slug);
                const [leaderboard, run] = await Promise.all([getStrategyLeaderboard(userId), getLatestRun(def.id)]);
                return shapeQuantStrategy({def, row: leaderboard.rows.find((row) => row.id === def.id) ?? null, run});
            } catch (error) {
                console.error('getQuantStrategies failed:', error);
                return {error: 'Could not read the quant strategies right now.'};
            }
        },
    }),
}) satisfies Record<ChatToolName, unknown>;

export type ChatTools = ReturnType<typeof buildTools>;
