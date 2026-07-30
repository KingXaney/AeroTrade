import {redirect} from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import {HEATMAP_WIDGET_CONFIG, TOP_STORIES_WIDGET_CONFIG} from "@/lib/constants";
import Link from "next/link";
import {getCurrentUserId, getWatchlistSymbolsByUserId} from "@/lib/actions/watchlist.actions";
import {aggregatePortfolios, getPortfoliosForUser} from "@/lib/trading/account";
import {getLeaderboard} from "@/lib/actions/friends.actions";
import {getActiveTheses} from "@/lib/brain/queries";
import {getLatestSuggestions} from "@/lib/navigator/service";
import {getStocksWithData} from "@/lib/actions/finnhub.actions";
import PersonalRow from "@/components/dashboard/PersonalRow";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const Home = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const [accountPortfolios, watchlistSymbols, leaderboard, theses, suggestions] = await Promise.all([
        getPortfoliosForUser(userId),
        getWatchlistSymbolsByUserId(userId),
        getLeaderboard(userId),
        getActiveTheses(),
        getLatestSuggestions(userId),
    ]);
    const topThesis = theses[0];
    const latestSet = suggestions.user ?? suggestions.global;
    const portfolio = aggregatePortfolios(accountPortfolios);
    const bestEntry = accountPortfolios.reduce((top, x) => (x.summary.totalReturnPct > top.summary.totalReturnPct ? x : top));
    const best = accountPortfolios.length > 1
        ? {name: bestEntry.account.name, totalReturnPct: bestEntry.summary.totalReturnPct}
        : undefined;
    // Bound the movers fetch so a large watchlist doesn't fan out unbounded.
    const movers = await getStocksWithData(watchlistSymbols.slice(0, 8));

    return (
        <div className="min-h-screen space-y-4">
            {/* Page Header */}
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1"
                    style={{ fontFamily: 'var(--font-sora)' }}>
                    Dashboard
                </h1>
                <p className="text-sm text-[#849495]">
                    Your portfolio, watchlist and friends at a glance
                </p>
            </div>

            {/* Your data first */}
            <PersonalRow portfolio={portfolio} best={best} movers={movers} leaderboard={leaderboard} />

            {/* News brain tile */}
            <Link href="/brain" className="glass-panel rounded-xl p-5 block transition-colors hover:border-[rgba(125,244,255,0.25)]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#7df4ff]">neurology</span>
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                                News Brain
                            </div>
                            <div className="text-sm text-[#e2e2e8]" style={{fontFamily: 'var(--font-sora)'}}>
                                {topThesis
                                    ? <>Top thesis: <span className="text-[#7df4ff]">{topThesis.displayName}</span></>
                                    : 'Building market narratives from daily news'}
                            </div>
                        </div>
                    </div>
                    <span className="text-xs text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {latestSet ? `${latestSet.items.length} decisions · ${latestSet.date}` : 'Navigator runs Mondays'} →
                    </span>
                </div>
            </Link>

            {/* One market widget + news */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <section className="xl:col-span-8 glass-panel rounded-xl p-6">
                    <TradingViewWidget
                        title="Market Heatmap"
                        scriptUrl={`${scriptUrl}stock-heatmap.js`}
                        config={HEATMAP_WIDGET_CONFIG}
                        height={460}
                    />
                </section>
                <section className="xl:col-span-4 glass-panel rounded-xl p-6">
                    <TradingViewWidget
                        title="Top Stories"
                        scriptUrl={`${scriptUrl}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        className="custom-chart"
                        height={460}
                    />
                </section>
            </div>
        </div>
    );
};

export default Home;
