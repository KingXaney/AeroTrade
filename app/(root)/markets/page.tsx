import TradingViewWidget from "@/components/TradingViewWidget";
import {TICKER_TAPE_WIDGET_CONFIG} from "@/lib/constants";
import MarketsTabs from "@/components/markets/MarketsTabs";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const MarketsPage = () => {
    return (
        <div className="space-y-4">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-fg mb-1"
                    style={{ fontFamily: 'var(--type-display)' }}>
                    Markets
                </h1>
                <p className="text-sm text-fg-muted">
                    Scan equities, crypto and FX
                </p>
            </div>

            {/* Persistent ticker tape */}
            <section className="glass-panel rounded-xl p-3">
                <TradingViewWidget
                    scriptUrl={`${scriptUrl}ticker-tape.js`}
                    config={TICKER_TAPE_WIDGET_CONFIG}
                    height={70}
                />
            </section>

            {/* Tabbed: Stocks / Heatmap / Crypto / Forex — one widget at a time */}
            <MarketsTabs />
        </div>
    );
};

export default MarketsPage;
