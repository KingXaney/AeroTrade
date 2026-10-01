import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import {getSessionUser} from "@/lib/auth/session";
import {redirect} from "next/navigation";
import {searchStocks} from "@/lib/prices/finnhub";
import {getCachedWatchlistSymbols} from "@/lib/stocks/watchlist-store";
import {getCachedTopicsOverview} from "@/lib/topics/store";
import {aggregatePortfolios, getPortfoliosForUser} from "@/lib/trading/valuation";
import {countUnpriced} from "@/lib/trading/analytics";
import ChatWidget from "@/components/chat/ChatWidget";
import ThemeSync from "@/components/theme/ThemeSync";
import {getAppearanceForUser} from "@/lib/theme/store";
import {countIncomingRequests} from "@/lib/friends/store";
import type {NavBadges} from "@/lib/shell/navigation";
import type {TopicsOverview} from '@/lib/topics/types';

// Every page under (root) reads the session from request headers, so they can never be
// statically prerendered. Declaring this avoids a build-time dynamic-usage error.
export const dynamic = 'force-dynamic';

const Layout = async ({children}: {children: React.ReactNode}) => {
    const user = await getSessionUser()

    if (!user) redirect('/sign-in')

    // Pre-load the popular-stocks list once for the SearchCommand fallback.
    // All strategy accounts power the compact sidebar card, priced from one shared
    // quote map (getQuote caches 30s, so this stays cheap across navigations).
    // The topics card must never take the whole shell down with it.
    const [initialStocks, watchlistSymbols, accountPortfolios, savedTheme, topicsOverview, friendRequests] = await Promise.all([
        searchStocks(),
        getCachedWatchlistSymbols(user.id),
        getPortfoliosForUser(user.id),
        getAppearanceForUser(user.id),
        getCachedTopicsOverview(user.id).catch((error: unknown) => {
            console.error('Sidebar topics failed:', error);
            return {topics: [], unseenTotal: 0} as TopicsOverview;
        }),
        // A pending request was invisible until you happened to open /friends, so both
        // sides sat waiting. Guarded like the topics card: a badge must never take the
        // whole shell down.
        countIncomingRequests(user.id).catch(() => 0),
    ]);

    const portfolio = aggregatePortfolios(accountPortfolios);
    const sidebarPortfolio = {
        totalValue: portfolio.totalValue,
        totalReturnPct: portfolio.totalReturnPct,
        cash: portfolio.cash,
        strategiesCount: accountPortfolios.length,
        unpriced: countUnpriced(portfolio.positions),
        top: portfolio.positions.slice(0, 3).map((p) => ({
            symbol: p.symbol,
            quantity: p.quantity,
            unrealizedPnlPct: p.unrealizedPnlPct,
            priceStale: p.priceStale,
        })),
    };

    const sidebarTopics = {
        followed: topicsOverview.topics.length,
        unseen: topicsOverview.unseenTotal,
        top: [...topicsOverview.topics]
            .sort((a, b) => b.unseenCount - a.unseenCount || (b.latest?.datetime ?? 0) - (a.latest?.datetime ?? 0))
            .slice(0, 3)
            .map((t) => ({slug: t.slug, name: t.name, color: t.color, unseenCount: t.unseenCount})),
    };

    const navBadges: NavBadges = {
        watchlist: watchlistSymbols.length,
        friendRequests: friendRequests,
    };

    return (
        <main className="min-h-screen" style={{ color: 'var(--fg-soft)' }}>
            <Header
                user={user}
                initialStocks={initialStocks}
                initialTopics={topicsOverview.topics.map((t) => ({name: t.name, slug: t.slug}))}
                navBadges={navBadges}
            />
            <Sidebar portfolio={sidebarPortfolio} topics={sidebarTopics} badges={navBadges} />
            <div className="pt-20 lg:ml-64 px-6 pb-8">
                {children}
            </div>
            <ChatWidget userId={user.id}/>
            <ThemeSync dbTheme={savedTheme}/>
        </main>
    )
}

export default Layout
