import {redirect} from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import {HEATMAP_WIDGET_CONFIG, TOP_STORIES_WIDGET_CONFIG} from "@/lib/constants";
import {getCurrentUserId, getWatchlistSymbolsByUserId} from "@/lib/actions/watchlist.actions";
import {getPortfolio} from "@/lib/trading/account";
import {getLeaderboard} from "@/lib/actions/friends.actions";
import {getStocksWithData} from "@/lib/actions/finnhub.actions";
import PersonalRow from "@/components/dashboard/PersonalRow";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const Home = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const [portfolio, watchlistSymbols, leaderboard] = await Promise.all([
        getPortfolio(userId),
        getWatchlistSymbolsByUserId(userId),
        getLeaderboard(userId),
    ]);
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
            <PersonalRow portfolio={portfolio} movers={movers} leaderboard={leaderboard} />

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
