// The (root) layout's one read: everything the header, sidebar, chat and theme sync need
// beside the session, in one parallel pass. Server only; the sidebar's view-models are
// lib/shell/sidebar.ts.

import {searchStocks} from "@/lib/prices/finnhub";
import {getCachedWatchlistSymbols} from "@/lib/stocks/watchlist-store";
import {getCachedTopicsOverview} from "@/lib/topics/store";
import {aggregatePortfolios, getPortfoliosForUser} from "@/lib/trading/valuation";
import {getAppearanceForUser} from "@/lib/theme/store";
import {countIncomingRequests} from "@/lib/friends/store";
import {toSidebarPortfolio, toSidebarTopics, type SidebarPortfolio, type SidebarTopics} from "@/lib/shell/sidebar";
import type {NavBadges} from "@/lib/shell/navigation";
import type {TopicLink, TopicsOverview} from "@/lib/topics/types";

export type ShellView = {
    initialStocks: Awaited<ReturnType<typeof searchStocks>>;
    initialTopics: TopicLink[];
    navBadges: NavBadges;
    portfolio: SidebarPortfolio;
    topics: SidebarTopics;
    savedTheme: Awaited<ReturnType<typeof getAppearanceForUser>>;
};

export const getShellView = async (userId: string): Promise<ShellView> => {
    // Pre-load the popular-stocks list once for the SearchCommand fallback.
    // All the user's accounts power the compact sidebar card, priced from one shared
    // quote map (getQuote caches 30s, so this stays cheap across navigations).
    // The topics card must never take the whole shell down with it.
    const [initialStocks, watchlistSymbols, accountPortfolios, savedTheme, topicsOverview, friendRequests] = await Promise.all([
        searchStocks(),
        getCachedWatchlistSymbols(userId),
        getPortfoliosForUser(userId),
        getAppearanceForUser(userId),
        getCachedTopicsOverview(userId).catch((error: unknown) => {
            console.error('Sidebar topics failed:', error);
            return {topics: [], unseenTotal: 0} as TopicsOverview;
        }),
        // A pending request was invisible until you happened to open /friends, so both
        // sides sat waiting. Guarded like the topics card: a badge must never take the
        // whole shell down.
        countIncomingRequests(userId).catch(() => 0),
    ]);

    return {
        initialStocks,
        initialTopics: topicsOverview.topics.map((t) => ({name: t.name, slug: t.slug})),
        navBadges: {watchlist: watchlistSymbols.length, friendRequests},
        portfolio: toSidebarPortfolio(aggregatePortfolios(accountPortfolios), accountPortfolios.length),
        topics: toSidebarTopics(topicsOverview),
        savedTheme,
    };
};
