import TradingViewWidget from "@/components/TradingViewWidget";
import {MARKET_EMBEDS} from "@/lib/stocks/tradingview";
import MarketsTabs, {isMarketsTabId} from "@/components/markets/MarketsTabs";

type MarketsPageProps = {searchParams: Promise<{view?: string}>};

const MarketsPage = async ({searchParams}: MarketsPageProps) => {
    const {view} = await searchParams;
    const active = isMarketsTabId(view) ? view : 'stocks';
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
                    scriptUrl={MARKET_EMBEDS.tickerTape.script}
                    config={MARKET_EMBEDS.tickerTape.config}
                    height={70}
                />
            </section>

            {/* Tabbed: Stocks / Heatmap / Crypto / Forex — one widget at a time */}
            <MarketsTabs active={active} />
        </div>
    );
};

export default MarketsPage;
