// The news page's one read (app/(root)/news/page.tsx). Server only; the shaping — sections,
// outlet filter, one story once — is the pure lib/news/page.ts.
//
// The feed's own contract is untouched (invariant 10): getNewsFeedForPrefs still plans the
// requests, owns the Google kill switch and the outage fallback. The page reads the followed
// topics beside it rather than through it, because here they have a section of their own.

import {getNewsForSymbols} from "@/lib/brain/store";
import {getLatestMarketBriefing} from "@/lib/news/briefing-store";
import {NEWS_PAGE_SIZE} from "@/lib/news/config";
import {getNewsFeedForPrefs} from "@/lib/news/feed-store";
import {toNewsPageView, type NewsPageView} from "@/lib/news/page";
import {getCachedWatchlistSymbols} from "@/lib/stocks/watchlist-store";
import {getCachedTopicsOverview, getMergedTopicFeed} from "@/lib/topics/store";
import {getHeldSymbolsByUserId} from "@/lib/trading/accounts";
import type {NewsFeedPrefs} from "@/lib/news/feed-prefs";
import type {TopicsOverview} from "@/lib/topics/types";

// How many stored topic articles the page reads to fill its topic sections.
const TOPIC_ARTICLES_READ = 40;

// Every part is best effort: a news page must never break because one store is unreachable.
const quiet = <T>(label: string, fallback: T) => (error: unknown): T => {
    console.error(`News page: ${label} unavailable:`, error);
    return fallback;
};

export const getNewsPageView = async (userId: string, prefs: NewsFeedPrefs): Promise<NewsPageView> => {
    const [watchlist, held, overview, topicArticles, briefing] = await Promise.all([
        getCachedWatchlistSymbols(userId).catch(quiet('watchlist', [] as string[])),
        getHeldSymbolsByUserId(userId).catch(quiet('holdings', [] as string[])),
        getCachedTopicsOverview(userId).catch(quiet('topics', {topics: [], unseenTotal: 0} as TopicsOverview)),
        getMergedTopicFeed(userId, {limit: TOPIC_ARTICLES_READ}).catch(quiet('topic articles', [])),
        getLatestMarketBriefing(),
    ]);
    const symbols = [...new Set([...held, ...watchlist].map((s) => s.toUpperCase()))];

    const [feed, holdings] = await Promise.all([
        // The watchlist enters the feed only when the feed asks for it, as everywhere else.
        getNewsFeedForPrefs(prefs, {limit: NEWS_PAGE_SIZE, watchlistSymbols: prefs.includeWatchlist ? watchlist : []}),
        getNewsForSymbols(symbols).catch(quiet('tagged articles', [])),
    ]);

    return toNewsPageView({briefing, prefs, overview, topicArticles, holdings, feed: feed.articles, fallback: feed.fallback, symbols});
};
