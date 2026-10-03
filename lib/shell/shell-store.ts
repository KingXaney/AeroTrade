// The (root) layout's one read: everything the header, rail, chat and theme sync need
// beside the session, in one parallel pass. Server only; the rail's card view-models are
// lib/shell/sidebar.ts.

import {searchStocks} from "@/lib/prices/finnhub";
import {getCachedWatchlistSymbols} from "@/lib/stocks/watchlist-store";
import {getCachedTopicsOverview} from "@/lib/topics/store";
import {aggregatePortfolios, getPortfoliosForUser} from "@/lib/trading/valuation";
import {getAppearanceForUser} from "@/lib/theme/store";
import {countIncomingRequests} from "@/lib/friends/store";
import {getLatestMarketBriefing} from "@/lib/news/briefing-store";
import {outletAllowed} from "@/lib/news/feed";
import {getNewsReaderPrefs} from "@/lib/news/feed-store";
import {filterBriefing} from "@/lib/news/page";
import {toSidebarNews, toSidebarPortfolio, type SidebarNews, type SidebarPortfolio} from "@/lib/shell/sidebar";
import type {NavBadges} from "@/lib/shell/navigation";
import type {TopicLink, TopicsOverview} from "@/lib/topics/types";

export type ShellView = {
    initialStocks: Awaited<ReturnType<typeof searchStocks>>;
    initialTopics: TopicLink[];
    navBadges: NavBadges;
    portfolio: SidebarPortfolio;
    news: SidebarNews;
    savedTheme: Awaited<ReturnType<typeof getAppearanceForUser>>;
};

export const getShellView = async (userId: string): Promise<ShellView> => {
    // Pre-load the popular-stocks list once for the SearchCommand fallback.
    // All the user's accounts power the compact sidebar card, priced from one shared
    // quote map (getQuote caches 30s, so this stays cheap across navigations).
    // The News card must never take the whole shell down with it.
    const [initialStocks, watchlistSymbols, accountPortfolios, savedTheme, topicsOverview, friendRequests, briefing, reader] = await Promise.all([
        searchStocks(),
        getCachedWatchlistSymbols(userId),
        getPortfoliosForUser(userId),
        getAppearanceForUser(userId),
        getCachedTopicsOverview(userId).catch((error: unknown) => {
            console.error('Sidebar topics failed:', error);
            return {topics: [], unseenTotal: 0} as TopicsOverview;
        }),
        // A pending request was invisible until you happened to open /friends, so both
        // sides sat waiting. Guarded like the News card: a badge must never take the
        // whole shell down.
        countIncomingRequests(userId).catch(() => 0),
        // The day's briefing and the reader's outlet filter plus last look at News — both shared
        // with /news and Home through React's cache, and both read as "none" on failure.
        getLatestMarketBriefing(),
        getNewsReaderPrefs(userId),
    ]);

    const portfolio = toSidebarPortfolio(aggregatePortfolios(accountPortfolios), accountPortfolios.length);
    // A hidden outlet is hidden in the card and in the dot alike (invariant 10): the briefing goes
    // through the news page's filter, and the view-model tests each topic's newest headline with
    // the same rule.
    const news = toSidebarNews({
        overview: topicsOverview,
        briefing: filterBriefing(briefing, reader.feed),
        allowed: outletAllowed(reader.feed),
        newsSeenAt: reader.newsSeenAt,
    });
    return {
        initialStocks,
        initialTopics: topicsOverview.topics.map((t) => ({name: t.name, slug: t.slug})),
        // The rail's dots stand where the sidebar's cards showed these all the time.
        navBadges: {watchlist: watchlistSymbols.length, friendRequests, newsNew: news.newTopics, unpriced: portfolio.unpriced},
        portfolio,
        news,
        savedTheme,
    };
};
