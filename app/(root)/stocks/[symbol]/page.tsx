import {notFound, redirect} from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import StockHeader from "@/components/stock/StockHeader";
import {
    SYMBOL_INFO_WIDGET_CONFIG,
    CANDLE_CHART_WIDGET_CONFIG,
    COMPANY_PROFILE_WIDGET_CONFIG,
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import {getCompanyProfile, getQuote} from "@/lib/actions/finnhub.actions";
import {getCurrentUserId, isInWatchlist} from "@/lib/actions/watchlist.actions";

const TRADINGVIEW_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const StockDetailsPage = async ({params}: StockDetailsPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {symbol: raw} = await params;
    const symbol = raw.toUpperCase();

    const [profile, quote, inWatchlist] = await Promise.all([
        getCompanyProfile(symbol),
        getQuote(symbol),
        isInWatchlist(userId, symbol),
    ]);

    // Finnhub returns an empty object for unknown symbols; treat that as 404.
    if (!profile.name && typeof quote.c !== 'number') notFound();

    const company = profile.name || symbol;

    return (
        <div className="space-y-6">
            <StockHeader
                symbol={symbol}
                company={company}
                currentPrice={quote.c}
                changePercent={quote.dp}
                isInWatchlist={inWatchlist}
            />

            {/* Symbol Info */}
            <section className="glass-panel rounded-xl p-4 shimmer">
                <TradingViewWidget
                    scriptUrl={`${TRADINGVIEW_SCRIPT}symbol-info.js`}
                    config={SYMBOL_INFO_WIDGET_CONFIG(symbol)}
                    height={170}
                />
            </section>

            {/* Chart + Technical Analysis */}
            <div className="grid gap-4 xl:grid-cols-3">
                <section className="xl:col-span-2 glass-panel rounded-xl p-4 shimmer">
                    <TradingViewWidget
                        title="Advanced Chart"
                        scriptUrl={`${TRADINGVIEW_SCRIPT}advanced-chart.js`}
                        config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
                        height={600}
                    />
                </section>
                <section className="xl:col-span-1 glass-panel rounded-xl p-4">
                    <TradingViewWidget
                        title="Technical Analysis"
                        scriptUrl={`${TRADINGVIEW_SCRIPT}technical-analysis.js`}
                        config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
                        height={400}
                    />
                </section>
            </div>

            {/* Company Profile + Financials */}
            <div className="grid gap-4 xl:grid-cols-2">
                <section className="glass-panel rounded-xl p-4 shimmer">
                    <TradingViewWidget
                        title="Company Profile"
                        scriptUrl={`${TRADINGVIEW_SCRIPT}symbol-profile.js`}
                        config={COMPANY_PROFILE_WIDGET_CONFIG(symbol)}
                        height={440}
                    />
                </section>
                <section className="glass-panel rounded-xl p-4">
                    <TradingViewWidget
                        title="Financials"
                        scriptUrl={`${TRADINGVIEW_SCRIPT}financials.js`}
                        config={COMPANY_FINANCIALS_WIDGET_CONFIG(symbol)}
                        height={464}
                    />
                </section>
            </div>
        </div>
    );
};

export default StockDetailsPage;
