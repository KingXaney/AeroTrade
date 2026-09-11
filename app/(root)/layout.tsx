import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import {getCachedTopicsOverview, getCachedWatchlistSymbols} from "@/lib/dashboard/cached";
import {aggregatePortfolios, getPortfoliosForUser} from "@/lib/trading/account";
import ChatWidget from "@/components/chat/ChatWidget";
import ThemeSync from "@/components/theme/ThemeSync";
import {getAppearanceForUser} from "@/lib/actions/appearance.actions";

// Every page under (root) reads the session from request headers, so they can never be
// statically prerendered. Declaring this avoids a build-time dynamic-usage error.
export const dynamic = 'force-dynamic';

const Layout = async ({children}: {children: React.ReactNode}) => {
    const session = await auth.api.getSession({headers: await headers()})

    if (!session?.user) redirect('/sign-in')

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }

    // Pre-load the popular-stocks list once for the SearchCommand fallback, joined with this user's watchlist.
    // All strategy accounts power the compact sidebar card, priced from one shared
    // quote map (getQuote caches 30s, so this stays cheap across navigations).
    // The topics card must never take the whole shell down with it.
    const [initialStocks, watchlistSymbols, accountPortfolios, savedTheme, topicsOverview] = await Promise.all([
        searchStocks(undefined, user.id),
        getCachedWatchlistSymbols(user.id),
        getPortfoliosForUser(user.id),
        getAppearanceForUser(user.id),
        getCachedTopicsOverview(user.id).catch((error: unknown) => {
            console.error('Sidebar topics failed:', error);
            return {topics: [], unseenTotal: 0} as TopicsOverview;
        }),
    ]);

    const portfolio = aggregatePortfolios(accountPortfolios);
    const sidebarPortfolio = {
        totalValue: portfolio.totalValue,
        totalReturnPct: portfolio.totalReturnPct,
        cash: portfolio.cash,
        strategiesCount: accountPortfolios.length,
        top: portfolio.positions.slice(0, 3).map((p) => ({
            symbol: p.symbol,
            quantity: p.quantity,
            unrealizedPnlPct: p.unrealizedPnlPct,
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

    return (
        <main className="min-h-screen" style={{ color: 'var(--fg-soft)' }}>
            <Header user={user} initialStocks={initialStocks} initialTopics={topicsOverview.topics.map((t) => ({name: t.name, slug: t.slug}))}/>
            <Sidebar watchlistCount={watchlistSymbols.length} portfolio={sidebarPortfolio} topics={sidebarTopics} />
            <div className="pt-20 lg:ml-64 px-6 pb-8">
                {children}
            </div>
            <ChatWidget userId={user.id}/>
            <ThemeSync dbTheme={savedTheme}/>
        </main>
    )
}

export default Layout
