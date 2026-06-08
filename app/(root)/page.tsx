import TradingViewWidget from "@/components/TradingViewWidget";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG
} from "@/lib/constants";


const Home = () =>{
    const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-'
    return (
        <div className="min-h-screen">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1"
                    style={{ fontFamily: 'var(--font-sora)' }}>
                    Dashboard
                </h1>
                <p className="text-sm text-[#849495]"
                   style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                    Real-time market intelligence · <span id="dashboard-timestamp">Live</span>
                </p>
            </div>

            {/* Primary Grid: Market Overview + Heatmap */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
                {/* Market Overview */}
                <section className="xl:col-span-4 glass-panel rounded-xl p-6 shimmer">
                    <TradingViewWidget
                        title="Market Overview"
                        scriptUrl={`${scriptUrl}market-overview.js`}
                        config={MARKET_OVERVIEW_WIDGET_CONFIG}
                        className="custom-chart"
                        height={600}
                    />
                </section>

                {/* Stock Heatmap */}
                <section className="xl:col-span-8 glass-panel rounded-xl p-6">
                    <TradingViewWidget
                        title="Stock Heatmap"
                        scriptUrl={`${scriptUrl}stock-heatmap.js`}
                        config={HEATMAP_WIDGET_CONFIG}
                        height={600}
                    />
                </section>
            </div>

            {/* Secondary Grid: News + Market Data */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Top Stories */}
                <section className="xl:col-span-4 glass-panel rounded-xl p-6 shimmer">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        className="custom-chart"
                        title="Top Stories"
                        height={600}
                    />
                </section>

                {/* Market Quotes */}
                <section className="xl:col-span-8 glass-panel rounded-xl p-6">
                    <TradingViewWidget
                        title="Market Data"
                        scriptUrl={`${scriptUrl}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </section>
            </div>
        </div>
    )
}

export default Home
