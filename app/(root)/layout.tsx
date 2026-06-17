import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import {getWatchlistSymbolsByUserId} from "@/lib/actions/watchlist.actions";
import {getPortfolio} from "@/lib/trading/account";
import ChatWidget from "@/components/chat/ChatWidget";
import ParticleBackground from "@/components/ParticleBackground";

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
    // Portfolio powers the compact sidebar card (getQuote caches 30s, so this stays cheap across navigations).
    const [initialStocks, watchlistSymbols, portfolio] = await Promise.all([
        searchStocks(undefined, user.id),
        getWatchlistSymbolsByUserId(user.id),
        getPortfolio(user.id),
    ]);

    const sidebarPortfolio = {
        totalValue: portfolio.totalValue,
        totalReturnPct: portfolio.totalReturnPct,
        cash: portfolio.cash,
        top: portfolio.positions.slice(0, 3).map((p) => ({
            symbol: p.symbol,
            quantity: p.quantity,
            unrealizedPnlPct: p.unrealizedPnlPct,
        })),
    };

    return (
        <main className="min-h-screen" style={{ color: '#b9cacb' }}>
            <ParticleBackground />
            <Header user={user} initialStocks={initialStocks}/>
            <Sidebar watchlistCount={watchlistSymbols.length} portfolio={sidebarPortfolio} />
            <div className="pt-20 lg:ml-64 px-6 pb-8 min-h-screen">
                {children}
            </div>
            <ChatWidget userId={user.id}/>
        </main>
    )
}

export default Layout
