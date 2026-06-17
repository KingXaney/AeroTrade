import TradingViewWidget from "@/components/TradingViewWidget";
import {
    TICKER_TAPE_WIDGET_CONFIG,
    MARKET_SCREENER_WIDGET_CONFIG,
    CRYPTO_SCREENER_WIDGET_CONFIG,
    FOREX_CROSS_RATES_WIDGET_CONFIG,
    HEATMAP_WIDGET_CONFIG,
} from "@/lib/constants";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const MarketsPage = () => {
    return (
        <div className="min-h-screen space-y-4">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1"
                    style={{ fontFamily: 'var(--font-sora)' }}>
                    Markets
                </h1>
                <p className="text-sm text-[#849495]"
                   style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                    Scan equities, crypto and FX · <span className="text-[#7df4ff]">Live</span>
                </p>
            </div>

            {/* Ticker Tape */}
            <section className="glass-panel rounded-xl p-3">
                <TradingViewWidget
                    scriptUrl={`${scriptUrl}ticker-tape.js`}
                    config={TICKER_TAPE_WIDGET_CONFIG}
                    height={70}
                />
            </section>

            {/* Stock Screener — gainers, losers, most active */}
            <section className="glass-panel rounded-xl p-6 shimmer">
                <TradingViewWidget
                    title="Stock Screener"
                    scriptUrl={`${scriptUrl}screener.js`}
                    config={MARKET_SCREENER_WIDGET_CONFIG}
                    height={600}
                />
            </section>

            {/* Heatmap */}
            <section className="glass-panel rounded-xl p-6">
                <TradingViewWidget
                    title="S&P 500 Heatmap"
                    scriptUrl={`${scriptUrl}stock-heatmap.js`}
                    config={HEATMAP_WIDGET_CONFIG}
                    height={500}
                />
            </section>

            {/* Crypto + Forex */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <section className="glass-panel rounded-xl p-6 shimmer">
                    <TradingViewWidget
                        title="Crypto Market"
                        scriptUrl={`${scriptUrl}screener.js`}
                        config={CRYPTO_SCREENER_WIDGET_CONFIG}
                        height={490}
                    />
                </section>
                <section className="glass-panel rounded-xl p-6">
                    <TradingViewWidget
                        title="Forex Cross Rates"
                        scriptUrl={`${scriptUrl}forex-cross-rates.js`}
                        config={FOREX_CROSS_RATES_WIDGET_CONFIG}
                        height={490}
                    />
                </section>
            </div>
        </div>
    );
};

export default MarketsPage;
