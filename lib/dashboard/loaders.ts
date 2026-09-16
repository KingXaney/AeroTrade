// Server-only data loaders for the dashboard widgets. Never imported by tests:
// the action modules below reach lib/better-auth/auth.ts, whose top-level
// await needs a database.

import {cache} from "react";
import {getAccountAnalytics, getComparisonStats, getPortfoliosForUser, getTradeHistory} from "@/lib/trading/account";
import {getCachedTopicsOverview, getCachedWatchlistSymbols} from "@/lib/dashboard/cached";
import {getMergedTopicFeed} from "@/lib/topics/store";
import {getNews, getStocksWithData} from "@/lib/actions/finnhub.actions";
import {getLeaderboard} from "@/lib/actions/friends.actions";
import {getActiveTheses, getBrainGraph, getBrainSystemStatus, getTopEntities, type BrainSystemStatus} from "@/lib/brain/queries";
import {getLatestSuggestions} from "@/lib/navigator/service";
import {getNavigatorStatus} from "@/lib/actions/navigator.actions";
import {getLatestSecondOpinion, type SecondOpinionView} from "@/lib/brain/opinion";
import {pickActiveAccount, type ComparisonStat, type LatestSuggestions} from "@/lib/dashboard/select";
import type {DataKey} from "@/lib/dashboard/widgets";

export type LoaderCtx = {
    userId: string;
    preferredAccountId?: string;   // ?account= ?? ACTIVE_ACCOUNT_COOKIE
};

export const MOVERS_SYMBOL_CAP = 8;   // 3 Finnhub calls per symbol — keep the fan-out bounded
export const NEWS_SYMBOL_CAP = 5;     // getNews loops symbols serially
export const RECENT_TRADES_LIMIT = 8;
export const TOP_ENTITIES_PER_TYPE = 5;
export const GRAPH_NODE_LIMIT = 16;
export const TOPICS_LATEST_LIMIT = 6;

export type DashboardData = Partial<{
    portfolios: AccountWithPortfolio[];
    watchlistSymbols: string[];
    movers: StockWithData[];
    leaderboard: LeaderboardEntry[];
    theses: BrainEntitySummary[];
    suggestions: LatestSuggestions;
    activeAccount: AccountWithPortfolio;
    analytics: AccountAnalytics | null;
    trades: PaperTradeRecord[];
    comparisonStats: Record<string, ComparisonStat>;
    navigatorStatus: NavigatorStatus;
    topEntities: Awaited<ReturnType<typeof getTopEntities>>;
    brainGraph: Awaited<ReturnType<typeof getBrainGraph>>;
    brainStatus: BrainSystemStatus;
    secondOpinion: SecondOpinionView | null;
    news: MarketNewsArticle[];
    topicsOverview: TopicsOverview;
    topicsLatest: MergedTopicArticle[];
}>;

type Loader<K extends DataKey> = (ctx: LoaderCtx) => Promise<DashboardData[K]>;

// cache() memoises per request by argument identity — pass primitives only.
// getPortfoliosForUser and the watchlist symbols are cached at their source.
const cActive = cache(async (userId: string, preferred: string | undefined) =>
    pickActiveAccount(await getPortfoliosForUser(userId), preferred));
const cAnalytics = cache(async (userId: string, preferred: string | undefined) => {
    const active = await cActive(userId, preferred);
    return active ? getAccountAnalytics(userId, active.account.id) : null;
});
const cLeaderboard = cache((userId: string) => getLeaderboard(userId));
const cTheses = cache(() => getActiveTheses());
const cSuggestions = cache((userId: string) => getLatestSuggestions(userId));

// Each loader fetches its own dependencies through the cached wrappers, so any
// subset can run in one Promise.all without double-fetching.
export const LOADERS: {[K in DataKey]: Loader<K>} = {
    portfolios: ({userId}) => getPortfoliosForUser(userId),
    watchlistSymbols: ({userId}) => getCachedWatchlistSymbols(userId),
    movers: async ({userId}) => getStocksWithData((await getCachedWatchlistSymbols(userId)).slice(0, MOVERS_SYMBOL_CAP)),
    news: async ({userId}) => {
        const symbols = (await getCachedWatchlistSymbols(userId)).slice(0, NEWS_SYMBOL_CAP);
        return getNews(symbols.length ? symbols : undefined);
    },
    leaderboard: ({userId}) => cLeaderboard(userId),
    theses: () => cTheses(),
    suggestions: ({userId}) => cSuggestions(userId),
    activeAccount: ({userId, preferredAccountId}) => cActive(userId, preferredAccountId),
    analytics: ({userId, preferredAccountId}) => cAnalytics(userId, preferredAccountId),
    trades: async ({userId, preferredAccountId}) => {
        const active = await cActive(userId, preferredAccountId);
        return active ? getTradeHistory(userId, active.account.id, RECENT_TRADES_LIMIT) : [];
    },
    comparisonStats: async ({userId}) => {
        const all = await getPortfoliosForUser(userId);
        return getComparisonStats(userId, Object.fromEntries(all.map((x) => [x.account.id, x.summary.totalValue])));
    },
    navigatorStatus: ({userId}) => getNavigatorStatus(userId),
    topEntities: () => getTopEntities(TOP_ENTITIES_PER_TYPE),
    brainGraph: () => getBrainGraph(GRAPH_NODE_LIMIT),
    brainStatus: () => getBrainSystemStatus(),
    secondOpinion: ({userId}) => getLatestSecondOpinion(userId),
    topicsOverview: ({userId}) => getCachedTopicsOverview(userId),
    topicsLatest: ({userId}) => getMergedTopicFeed(userId, {limit: TOPICS_LATEST_LIMIT}),
};

export type LoadedDashboard = {data: DashboardData; failed: Set<DataKey>};

// One parallel pass over the eager keys. A failing loader never rejects the
// page: it lands in `failed` and only its widgets render an error state.
export const loadDashboardData = async (keys: readonly DataKey[], ctx: LoaderCtx): Promise<LoadedDashboard> => {
    const failed = new Set<DataKey>();
    const entries = await Promise.all(keys.map(async (key) => {
        try {
            const value = await LOADERS[key](ctx);
            return [key, value] as const;
        } catch (error) {
            console.error(`Dashboard loader "${key}" failed:`, error);
            failed.add(key);
            return [key, undefined] as const;
        }
    }));
    return {data: Object.fromEntries(entries) as DashboardData, failed};
};
