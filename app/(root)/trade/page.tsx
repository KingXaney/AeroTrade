import TradingViewWidget from "@/components/TradingViewWidget";
import {
    TRADE_CHART_WIDGET_CONFIG,
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    SYMBOL_INFO_WIDGET_CONFIG,
} from "@/lib/constants";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

type TradePageProps = {
    searchParams: Promise<{ symbol?: string }>;
};

const TradePage = async ({ searchParams }: TradePageProps) => {
    const { symbol: raw } = await searchParams;
    // Default focus symbol; the chart's own search lets the user switch to anything.
    const symbol = (raw || 'NASDAQ:AAPL').toUpperCase();

    return (
        <div className="min-h-screen space-y-4">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1"
                    style={{ fontFamily: 'var(--font-sora)' }}>
                    Trade Desk
                </h1>
                <p className="text-sm text-[#849495]"
                   style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                    Advanced charting, indicators & technicals · search any symbol in the chart
                </p>
            </div>

            {/* Symbol Info */}
            <section className="glass-panel rounded-xl p-4 shimmer">
                <TradingViewWidget
                    scriptUrl={`${scriptUrl}symbol-info.js`}
                    config={SYMBOL_INFO_WIDGET_CONFIG(symbol)}
                    height={170}
                />
            </section>

            {/* Advanced chart + technicals */}
            <div className="grid gap-4 xl:grid-cols-3">
                <section className="xl:col-span-2 glass-panel rounded-xl p-4 shimmer">
                    <TradingViewWidget
                        title="Advanced Chart"
                        scriptUrl={`${scriptUrl}advanced-chart.js`}
                        config={TRADE_CHART_WIDGET_CONFIG(symbol)}
                        height={640}
                    />
                </section>
                <section className="xl:col-span-1 glass-panel rounded-xl p-4">
                    <TradingViewWidget
                        title="Technical Analysis"
                        scriptUrl={`${scriptUrl}technical-analysis.js`}
                        config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
                        height={600}
                    />
                </section>
            </div>
        </div>
    );
};

export default TradePage;
